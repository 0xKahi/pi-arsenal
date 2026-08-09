import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { P2pInboundItem } from './communication-presentation';
import {
  BATCH_MAX_CHARS,
  BATCH_MAX_ITEMS,
  FLUSH_DELAY_MS,
  IDLE_RETRY_MS,
  KEEPALIVE_INTERVAL_MS,
  PEEK_TIMEOUT_MS,
  PROMOTION_BASE_DELAY_MS,
  PROMOTION_JITTER_MS,
  PROMPT_HARD_CEILING_MS,
  PROMPT_INACTIVITY_MS,
  RECONNECT_RETRY_MS,
  RUNTIME_HANDOFF_TIMEOUT_MS,
  WELCOME_TIMEOUT_MS,
} from './constants';
import {
  type ChatMsg,
  type MemberJoinedMsg,
  type MemberLeftMsg,
  type P2pContextSnapshot,
  type P2pIdentity,
  type P2pMessage,
  type P2pStatus,
  type PeekResponseMsg,
  type PromptRequestMsg,
  type PromptResponseMsg,
  type RegisterMsg,
  type StatusUpdateMsg,
  safeParseP2pMessage,
  type WelcomeMsg,
} from './protocol.types';
import { CouncilRegistry, type CouncilRegistryEntry, isEntryLive } from './registry.util';

export type P2pConnectionType = 'host' | 'client' | 'disconnected';

export interface P2pRosterEntry {
  identity: P2pIdentity;
  status: P2pStatus | undefined;
  connectionType: 'host' | 'client';
  isSelf: boolean;
}

export interface P2pCouncilRuntimeBinding {
  /** Canonical Pi model ID for the active model. */
  getModelId: () => string | undefined;
  getContextSnapshot: () => P2pContextSnapshot | undefined;
  isIdle: () => boolean;
  /** Deliver an ordered batch of triggerTurn:true messages once idle. */
  deliverBatch: (items: P2pInboundItem[]) => void;
  /** Deliver a single triggerTurn:false message as a steer/non-turn message. */
  deliverSteer: (content: string, from: string) => void;
  /** Start a local agent turn for a remote prompt request. */
  runRemotePrompt: (from: string, prompt: string) => void;
  notify: (message: string, level: 'info' | 'warning' | 'error') => void;
  /** Roster, status, or connection state changed - re-render widget/modal. */
  onChange: () => void;
}

export interface P2pCouncilStateDeps extends P2pCouncilRuntimeBinding {
  registry: CouncilRegistry;
  identity: { name: string; description: string | undefined; cwd: string };
}

export type P2pCouncilBindingToken = symbol;

interface PendingPromptResponse {
  resolve: (result: { response?: string; error?: string; from?: string }) => void;
  targetName: string;
  inactivityTimeout: ReturnType<typeof setTimeout>;
  ceilingTimeout: ReturnType<typeof setTimeout>;
}

export type CreateCouncilResult = { success: true } | { success: false; error: string };
export type JoinCouncilResult = { success: true; councilName: string } | { success: false; error: string };
export type SendChatResult = { success: true } | { success: false; error: string };

/**
 * Owns one council connection's networking, protocol handling, membership,
 * status propagation, promotion, and pending RPCs. One instance per pi
 * process, created once during lazy activation.
 */
export class P2pCouncilState {
  private connectionType: P2pConnectionType = 'disconnected';
  private selfName: string;
  private councilName: string | undefined;
  private councilPort: number | undefined;
  private manuallyDisconnected = false;

  // Host-side
  private server: WebSocketServer | null = null;
  private councilClients = new Map<WebSocket, string>();
  private councilIdentities = new Map<string, P2pIdentity>();
  private councilStatuses = new Map<string, P2pStatus>();

  // Client-side
  private ws: WebSocket | null = null;
  private clientHostName: string | undefined;
  private members = new Map<string, P2pIdentity>();
  private statuses = new Map<string, P2pStatus>();

  // Local status tracking
  private agentRunning = false;
  private activeToolName: string | null = null;
  private stateSince = Date.now();
  private lastPushedKind: string | null = null;
  private lastPushedTool: string | null = null;

  // Pending RPC
  private readonly pendingPromptResponses = new Map<string, PendingPromptResponse>();
  private pendingRemotePrompt: { id: string; from: string } | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  // Inbox for triggerTurn deliveries
  private readonly inbox: { from: string; content: string }[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Promotion
  private promotionTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private binding: { token: P2pCouncilBindingToken; runtime: P2pCouncilRuntimeBinding } | null = null;
  private handoffTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly detachedChats: ChatMsg[] = [];
  private readonly changeListeners = new Set<() => void>();
  private readonly disposeListeners = new Set<() => void>();
  private readonly registry: CouncilRegistry;
  private readonly identity: P2pCouncilStateDeps['identity'];

  public constructor(deps: P2pCouncilStateDeps) {
    this.registry = deps.registry;
    this.identity = deps.identity;
    this.selfName = deps.identity.name;
    this.binding = { token: Symbol('p2p-council-runtime-binding'), runtime: deps };
  }

  public attachRuntime(runtime: P2pCouncilRuntimeBinding): P2pCouncilBindingToken {
    if (this.disposed) throw new Error('Cannot attach a disposed p2p-council service');
    if (this.handoffTimer) {
      clearTimeout(this.handoffTimer);
      this.handoffTimer = null;
    }
    const token = Symbol('p2p-council-runtime-binding');
    this.binding = { token, runtime };
    this.agentRunning = false;
    this.activeToolName = null;
    this.stateSince = Date.now();
    this.emitChange();
    this.pushStatus(true);
    this.drainDetachedChats();
    return token;
  }

  public detachRuntime(token: P2pCouncilBindingToken): boolean {
    if (this.binding?.token !== token) return false;
    this.cancelRuntimeOwnedPrompts('runtime_replaced');
    this.agentRunning = false;
    this.activeToolName = null;
    this.stateSince = Date.now();
    this.pushStatus(true);
    this.binding = null;
    if (this.handoffTimer) clearTimeout(this.handoffTimer);
    this.handoffTimer = setTimeout(() => {
      this.handoffTimer = null;
      if (!this.binding) this.dispose();
    }, RUNTIME_HANDOFF_TIMEOUT_MS);
    return true;
  }

  public isRuntimeAttached(): boolean {
    return this.binding !== null;
  }

  public refreshRuntime(token: P2pCouncilBindingToken): void {
    if (!this.runtimeFor(token)) return;
    this.emitChange();
    this.pushStatus(true);
  }

  public subscribeToDispose(listener: () => void): () => void {
    this.disposeListeners.add(listener);
    return () => this.disposeListeners.delete(listener);
  }

  private runtimeFor(token?: P2pCouncilBindingToken): P2pCouncilRuntimeBinding | undefined {
    if (token && this.binding?.token !== token) return undefined;
    return this.binding?.runtime;
  }

  private emitChange(): void {
    this.binding?.runtime.onChange();
    for (const listener of this.changeListeners) listener();
  }

  // ── Public accessors ────────────────────────────────────────────────────

  public getConnectionType(): P2pConnectionType {
    return this.connectionType;
  }

  public getCouncilName(): string | undefined {
    return this.councilName;
  }

  public getSelfName(): string {
    return this.selfName;
  }

  public isConnected(): boolean {
    return this.connectionType !== 'disconnected';
  }

  public getRoster(): P2pRosterEntry[] {
    if (this.connectionType === 'disconnected') return [];
    const roster: P2pRosterEntry[] = [
      {
        identity: this.selfIdentity(),
        status: this.deriveStatus(),
        connectionType: this.connectionType === 'host' ? 'host' : 'client',
        isSelf: true,
      },
    ];
    if (this.connectionType === 'host') {
      for (const [name, identity] of this.councilIdentities) {
        roster.push({ identity, status: this.councilStatuses.get(name), connectionType: 'client', isSelf: false });
      }
    } else {
      for (const [name, identity] of this.members) {
        roster.push({
          identity,
          status: this.statuses.get(name),
          connectionType: name === this.clientHostName ? 'host' : 'client',
          isSelf: false,
        });
      }
    }
    return roster;
  }

  public subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.handoffTimer) clearTimeout(this.handoffTimer);
    this.handoffTimer = null;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.cancelRuntimeOwnedPrompts('runtime_replaced');
    this.inbox.length = 0;
    this.detachedChats.length = 0;
    this.disconnect('manual');
    this.binding = null;
    this.changeListeners.clear();
    for (const listener of this.disposeListeners) listener();
    this.disposeListeners.clear();
  }

  /**
   * Test-only hook: simulate an abrupt process crash rather than a clean
   * shutdown. Terminates sockets without removing the registry entry, so
   * remaining clients observe a real close event and can exercise promotion
   * against a still-live (but host-less) registry entry.
   */
  public debugSimulateCrash(): void {
    this.disposed = true;
    for (const clientWs of this.councilClients.keys()) {
      try {
        clientWs.terminate();
      } catch {
        // best-effort
      }
    }
    try {
      this.ws?.terminate();
    } catch {
      // best-effort
    }
    try {
      this.server?.close();
    } catch {
      // best-effort
    }
  }

  // ── Identity / status ────────────────────────────────────────────────────

  private selfIdentity(): P2pIdentity {
    return {
      name: this.selfName,
      model: this.runtimeFor()?.getModelId(),
      description: this.identity.description,
      cwd: this.identity.cwd,
      context: this.runtimeFor()?.getContextSnapshot(),
    };
  }

  private deriveStatus(): P2pStatus {
    if (this.activeToolName) return { kind: 'tool', toolName: this.activeToolName, since: this.stateSince };
    if (this.agentRunning) return { kind: 'thinking', since: this.stateSince };
    return { kind: 'idle', since: this.stateSince };
  }

  public setAgentRunning(running: boolean, token?: P2pCouncilBindingToken): void {
    if (token && !this.runtimeFor(token)) return;
    this.agentRunning = running;
    if (!running) this.activeToolName = null;
    this.stateSince = Date.now();
    this.pushStatus();
  }

  public setActiveTool(toolName: string | null, token?: P2pCouncilBindingToken): void {
    if (token && !this.runtimeFor(token)) return;
    this.activeToolName = toolName;
    if (this.agentRunning || toolName) this.stateSince = Date.now();
    this.pushStatus();
  }

  private pushStatus(force = false): void {
    if (this.connectionType === 'disconnected') return;
    const status = this.deriveStatus();
    const newTool = status.kind === 'tool' ? status.toolName : null;
    if (!force && status.kind === this.lastPushedKind && newTool === this.lastPushedTool) return;
    this.lastPushedKind = status.kind;
    this.lastPushedTool = newTool;
    const msg: StatusUpdateMsg = {
      type: 'status_update',
      name: this.selfName,
      status,
      model: this.runtimeFor()?.getModelId(),
      context: this.runtimeFor()?.getContextSnapshot() ?? null,
    };
    if (this.connectionType === 'host') {
      this.councilBroadcast(msg);
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
    this.emitChange();
  }

  // ── Create / join / disconnect ──────────────────────────────────────────

  public async createCouncil(name: string): Promise<CreateCouncilResult> {
    if (this.isConnected()) this.disconnect('manual');

    const existing = this.registry.read(name);
    if (existing && (await isEntryLive(existing))) {
      return { success: false, error: `Council "${name}" already exists and is live.` };
    }
    if (existing) this.registry.remove(name);

    return this.startHost(name, undefined);
  }

  public async joinCouncil(entry: CouncilRegistryEntry): Promise<JoinCouncilResult> {
    if (this.isConnected()) this.disconnect('manual');
    this.manuallyDisconnected = false;
    const result = await this.connectAsClient(entry.name, entry.port);
    if (!result.success) return result;
    return { success: true, councilName: entry.name };
  }

  public disconnect(reason: 'manual' | 'disabled'): void {
    this.manuallyDisconnected = true;
    if (this.promotionTimer) {
      clearTimeout(this.promotionTimer);
      this.promotionTimer = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    const priorCouncilName = this.councilName;
    const priorConnectionType = this.connectionType;

    if (priorConnectionType === 'host') {
      for (const clientWs of this.councilClients.keys()) {
        try {
          clientWs.close();
        } catch {
          // best-effort
        }
      }
      this.councilClients.clear();
      this.councilIdentities.clear();
      this.councilStatuses.clear();
      if (this.server) {
        try {
          this.server.close();
        } catch {
          // best-effort
        }
        this.server = null;
      }
      // Only the host removes the registry entry on a clean, manual shutdown.
      // Losing clients will race to promote instead of racing to delete.
      if (priorCouncilName) this.registry.remove(priorCouncilName);
    } else if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // best-effort
      }
      this.ws = null;
    }

    this.connectionType = 'disconnected';
    this.councilName = undefined;
    this.councilPort = undefined;
    this.clientHostName = undefined;
    this.members.clear();
    this.statuses.clear();
    this.lastPushedKind = null;
    this.lastPushedTool = null;

    // Fail any pending RPCs - nothing will ever answer them now.
    for (const [id] of this.pendingPromptResponses) {
      const pending = this.cleanupPending(id);
      if (pending) pending.resolve({ error: `disconnected:${pending.targetName}` });
    }

    this.emitChange();
    if (reason === 'manual' && priorCouncilName) {
      this.runtimeFor()?.notify(`Disconnected from council "${priorCouncilName}"`, 'info');
    }
  }

  // ── Hosting ──────────────────────────────────────────────────────────────

  private startHost(name: string, preferredPort: number | undefined): Promise<CreateCouncilResult> {
    return new Promise(resolve => {
      const server = new WebSocketServer({ port: preferredPort ?? 0, host: '127.0.0.1' });

      server.on('listening', () => {
        void (async () => {
          if (this.disposed) {
            server.close();
            resolve({ success: false, error: 'disposed' });
            return;
          }
          const address = server.address();
          const port = typeof address === 'object' && address !== null ? address.port : (preferredPort ?? 0);

          this.server = server;
          this.connectionType = 'host';
          this.councilName = name;
          this.councilPort = port;
          this.manuallyDisconnected = false;
          this.councilClients.clear();
          this.councilIdentities.clear();
          this.councilStatuses.clear();
          this.lastPushedKind = null;
          this.lastPushedTool = null;

          await this.registry.write({ name, port, hostPid: process.pid, createdAt: new Date().toISOString() });
          this.runtimeFor()?.notify(`Council Chambers "${name}" has been created (port=${port})`, 'info');
          this.emitChange();
          this.pushStatus(true);
          resolve({ success: true });
        })();
      });

      server.on('connection', clientWs => {
        if (this.disposed) {
          clientWs.close();
          return;
        }
        this.handleHostConnection(clientWs);
      });

      server.on('error', error => {
        resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
      });
    });
  }

  private handleHostConnection(clientWs: WebSocket): void {
    let clientName = '';
    let isPeeker = false;

    clientWs.on('message', raw => {
      if (this.disposed) return;
      const msg = safeParseP2pMessage(raw.toString());
      if (!msg) return;

      if (msg.type === 'peek') {
        isPeeker = true;
        const response: PeekResponseMsg = {
          type: 'peek_response',
          councilName: this.councilName ?? '',
          host: this.selfIdentity(),
          clients: Array.from(this.councilIdentities.values()),
          statuses: this.snapshotStatuses(),
        };
        clientWs.send(JSON.stringify(response));
        clientWs.close();
        return;
      }

      if (msg.type === 'register') {
        if (clientName) return; // already registered
        clientName = this.dedupeName(msg.name);
        const identity: P2pIdentity = {
          name: clientName,
          model: msg.model,
          description: msg.description,
          cwd: msg.cwd,
          context: msg.context,
        };
        this.councilClients.set(clientWs, clientName);
        this.councilIdentities.set(clientName, identity);

        const welcome: WelcomeMsg = {
          type: 'welcome',
          assignedName: clientName,
          host: this.selfIdentity(),
          clients: Array.from(this.councilIdentities.values()).filter(member => member.name !== clientName),
          statuses: { [this.selfName]: this.deriveStatus(), ...this.snapshotStatuses(clientName) },
        };
        clientWs.send(JSON.stringify(welcome));

        const joined: MemberJoinedMsg = { type: 'member_joined', identity };
        this.councilBroadcast(joined, clientName);
        this.runtimeFor()?.notify(`"${clientName}" has joined the chambers · "${this.councilName}"`, 'info');
        this.emitChange();
        return;
      }

      if (!clientName || isPeeker) return; // ignore anything before registration

      if (msg.type === 'status_update') {
        this.councilStatuses.set(clientName, msg.status);
        const identity = this.councilIdentities.get(clientName);
        if (identity) {
          if (msg.model !== undefined) identity.model = msg.model;
          if (msg.context !== undefined) identity.context = msg.context ?? undefined;
        }
        this.resetInactivityFor(clientName);
        const normalized: StatusUpdateMsg = { type: 'status_update', name: clientName, status: msg.status, model: msg.model, context: msg.context };
        this.councilBroadcast(normalized, clientName, /* excludeHost */ true);
        this.emitChange();
        return;
      }

      if (msg.type === 'chat' || msg.type === 'prompt_request' || msg.type === 'prompt_response') {
        this.routeAsHost({ ...msg, from: clientName });
      }
    });

    clientWs.on('close', () => {
      if (this.disposed) return;
      const name = this.councilClients.get(clientWs);
      if (!name) return; // peeker or already removed
      this.councilClients.delete(clientWs);
      this.councilIdentities.delete(name);
      this.councilStatuses.delete(name);
      this.failPendingFor(name);
      const left: MemberLeftMsg = { type: 'member_left', name };
      this.councilBroadcast(left);
      this.runtimeFor()?.notify(`"${name}" has left the chambers · "${this.councilName}"`, 'info');
      this.emitChange();
    });

    clientWs.on('error', () => {
      clientWs.close();
    });
  }

  private snapshotStatuses(excludeName?: string): Record<string, P2pStatus> {
    const out: Record<string, P2pStatus> = {};
    for (const [name, status] of this.councilStatuses) {
      if (name !== excludeName) out[name] = status;
    }
    return out;
  }

  private dedupeName(requested: string): string {
    const existing = new Set<string>([this.selfName, ...this.councilIdentities.keys()]);
    if (!existing.has(requested)) return requested;
    let i = 2;
    while (existing.has(`${requested}-${i}`)) i++;
    return `${requested}-${i}`;
  }

  /** Host: send to every client except `excludeName`; optionally skip delivering to self. */
  private councilBroadcast(msg: P2pMessage, excludeName?: string, excludeHost = false): void {
    const json = JSON.stringify(msg);
    for (const [clientWs, name] of this.councilClients) {
      if (name !== excludeName) clientWs.send(json);
    }
    if (!excludeHost && excludeName !== this.selfName) this.handleIncoming(msg);
  }

  private councilClientByName(name: string): WebSocket | undefined {
    for (const [clientWs, n] of this.councilClients) {
      if (n === name) return clientWs;
    }
    return undefined;
  }

  /** Host-side routing for chat/prompt messages between members (or to self). */
  private routeAsHost(msg: ChatMsg | PromptRequestMsg | PromptResponseMsg): void {
    if (msg.to === this.selfName) {
      this.handleIncoming(msg);
      return;
    }
    const targetWs = this.councilClientByName(msg.to);
    if (targetWs) {
      targetWs.send(JSON.stringify(msg));
      return;
    }
    // Target not found: bounce an error back to the sender.
    const errText = `Terminal "${msg.to}" not found`;
    if (msg.type === 'prompt_request') {
      const errorMsg: PromptResponseMsg = { type: 'prompt_response', id: msg.id, from: this.selfName, to: msg.from, response: '', error: errText };
      this.deliverToSenderOrClient(msg.from, errorMsg);
    } else if (msg.type === 'chat') {
      this.deliverToSenderOrClient(msg.from, { type: 'error', message: errText });
    }
  }

  private deliverToSenderOrClient(senderName: string, msg: P2pMessage): void {
    if (senderName === this.selfName) {
      this.handleIncoming(msg);
      return;
    }
    this.councilClientByName(senderName)?.send(JSON.stringify(msg));
  }

  // ── Client connection ────────────────────────────────────────────────────

  private connectAsClient(councilName: string, port: number): Promise<JoinCouncilResult> {
    return new Promise(resolve => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      let settled = false;
      let welcomed = false;

      const resetPartialState = () => {
        if (this.ws === socket) this.ws = null;
        this.connectionType = 'disconnected';
        this.councilName = undefined;
        this.councilPort = undefined;
        this.clientHostName = undefined;
        this.members.clear();
        this.statuses.clear();
        this.emitChange();
      };
      const finishFailure = (error: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(welcomeTimer);
        resetPartialState();
        try {
          socket.close();
        } catch {
          // best-effort
        }
        resolve({ success: false, error });
      };
      const finishSuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(welcomeTimer);
        resolve({ success: true, councilName });
      };
      const welcomeTimer = setTimeout(() => finishFailure('welcome handshake timed out'), WELCOME_TIMEOUT_MS);

      socket.on('open', () => {
        if (this.disposed) {
          finishFailure('disposed');
          return;
        }
        this.ws = socket;
        this.councilName = councilName;
        this.councilPort = port;
        const register: RegisterMsg = {
          type: 'register',
          name: this.selfName,
          model: this.runtimeFor()?.getModelId(),
          description: this.identity.description,
          cwd: this.identity.cwd,
          context: this.runtimeFor()?.getContextSnapshot(),
        };
        socket.send(JSON.stringify(register));
      });

      socket.on('message', raw => {
        if (this.disposed) {
          finishFailure('disposed');
          return;
        }
        const msg = safeParseP2pMessage(raw.toString());
        if (!welcomed) {
          if (msg?.type !== 'welcome') {
            finishFailure('invalid welcome handshake');
            return;
          }
          welcomed = true;
          this.handleIncoming(msg);
          finishSuccess();
          return;
        }
        if (msg) this.handleIncoming(msg);
      });

      socket.on('close', () => {
        if (!welcomed) {
          finishFailure(this.disposed ? 'disposed' : 'connection closed before welcome');
          return;
        }
        const wasClient = this.connectionType === 'client';
        if (this.ws === socket) this.ws = null;
        if (this.disposed) return;
        if (wasClient) {
          const lostCouncilName = this.councilName;
          const lostPort = this.councilPort;
          this.connectionType = 'disconnected';
          this.councilName = undefined;
          this.councilPort = undefined;
          this.clientHostName = undefined;
          this.members.clear();
          this.statuses.clear();
          this.emitChange();
          if (!this.manuallyDisconnected && lostCouncilName && lostPort) {
            this.runtimeFor()?.notify(`Lost connection to council "${lostCouncilName}" - attempting promotion`, 'warning');
            this.schedulePromotion(lostCouncilName, lostPort);
          }
        }
      });

      socket.on('error', () => finishFailure('connection failed'));
    });
  }

  // ── Promotion ────────────────────────────────────────────────────────────

  private schedulePromotion(councilName: string, port: number): void {
    if (this.disposed || this.manuallyDisconnected || this.promotionTimer) return;
    const delay = PROMOTION_BASE_DELAY_MS + Math.random() * PROMOTION_JITTER_MS;
    this.promotionTimer = setTimeout(() => {
      this.promotionTimer = null;
      if (this.disposed || this.manuallyDisconnected || this.connectionType !== 'disconnected') return;
      void this.attemptPromotion(councilName, port);
    }, delay);
  }

  private async attemptPromotion(councilName: string, port: number): Promise<void> {
    const hostResult = await this.startHost(councilName, port);
    if (hostResult.success) {
      this.runtimeFor()?.notify(`Promoted to host of council "${councilName}"`, 'info');
      return;
    }
    // Someone else won the race, or the port never frees up (rare). Retry as client.
    const rejoin = await this.connectAsClient(councilName, port);
    if (!rejoin.success) {
      setTimeout(
        () => {
          if (!this.disposed && !this.manuallyDisconnected && this.connectionType === 'disconnected') {
            this.schedulePromotion(councilName, port);
          }
        },
        RECONNECT_RETRY_MS + Math.random() * 1000,
      );
    }
  }

  // ── Peek ─────────────────────────────────────────────────────────────────

  public peek(entry: CouncilRegistryEntry): Promise<PeekResponseMsg | undefined> {
    return new Promise(resolve => {
      const socket = new WebSocket(`ws://127.0.0.1:${entry.port}`);
      let settled = false;
      const finish = (result: PeekResponseMsg | undefined) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          // best-effort
        }
        resolve(result);
      };
      const timer = setTimeout(() => finish(undefined), PEEK_TIMEOUT_MS);
      socket.on('open', () => socket.send(JSON.stringify({ type: 'peek' })));
      socket.on('message', raw => {
        const msg = safeParseP2pMessage(raw.toString());
        if (msg?.type === 'peek_response') finish(msg);
      });
      socket.on('error', () => finish(undefined));
    });
  }

  // ── Incoming message handling (both roles) ──────────────────────────────

  private handleIncoming(msg: P2pMessage): void {
    switch (msg.type) {
      case 'welcome': {
        this.selfName = msg.assignedName;
        this.connectionType = 'client';
        this.clientHostName = msg.host.name;
        this.members.clear();
        this.statuses.clear();
        this.members.set(msg.host.name, msg.host);
        for (const identity of msg.clients) this.members.set(identity.name, identity);
        for (const [name, status] of Object.entries(msg.statuses)) this.statuses.set(name, status);
        this.emitChange();
        this.runtimeFor()?.notify(`Joined council "${this.councilName}" as "${this.selfName}"`, 'info');
        this.pushStatus(true);
        break;
      }
      case 'member_joined': {
        this.members.set(msg.identity.name, msg.identity);
        this.emitChange();
        this.runtimeFor()?.notify(`"${msg.identity.name}" joined council "${this.councilName}"`, 'info');
        break;
      }
      case 'member_left': {
        this.members.delete(msg.name);
        this.statuses.delete(msg.name);
        this.failPendingFor(msg.name);
        this.emitChange();
        this.runtimeFor()?.notify(`"${msg.name}" left council "${this.councilName}"`, 'info');
        break;
      }
      case 'status_update': {
        this.statuses.set(msg.name, msg.status);
        const identity = this.members.get(msg.name);
        if (identity) {
          if (msg.model !== undefined) identity.model = msg.model;
          if (msg.context !== undefined) identity.context = msg.context ?? undefined;
        }
        this.resetInactivityFor(msg.name);
        this.emitChange();
        break;
      }
      case 'chat': {
        const runtime = this.runtimeFor();
        if (!runtime) {
          this.detachedChats.push(msg);
        } else if (msg.triggerTurn) {
          this.inbox.push({ from: msg.from, content: msg.content });
          this.scheduleFlush(FLUSH_DELAY_MS);
        } else {
          runtime.deliverSteer(msg.content, msg.from);
        }
        break;
      }
      case 'prompt_request': {
        if (!this.runtimeFor()) {
          const unavailable: PromptResponseMsg = {
            type: 'prompt_response',
            id: msg.id,
            from: this.selfName,
            to: msg.from,
            response: '',
            error: 'runtime_temporarily_unavailable',
          };
          this.sendChatLikeMessage(unavailable);
          break;
        }
        if (this.agentRunning || this.pendingRemotePrompt) {
          const busy: PromptResponseMsg = {
            type: 'prompt_response',
            id: msg.id,
            from: this.selfName,
            to: msg.from,
            response: '',
            error: 'Terminal is busy',
          };
          this.sendChatLikeMessage(busy);
          break;
        }
        this.pendingRemotePrompt = { id: msg.id, from: msg.from };
        if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
        this.keepaliveTimer = setInterval(() => this.pushStatus(true), KEEPALIVE_INTERVAL_MS);
        this.runtimeFor()?.notify(`Running remote prompt from "${msg.from}"`, 'info');
        this.runtimeFor()?.runRemotePrompt(msg.from, msg.prompt);
        break;
      }
      case 'prompt_response': {
        const pending = this.cleanupPending(msg.id);
        if (pending) pending.resolve({ response: msg.response, error: msg.error, from: msg.from });
        break;
      }
      case 'error': {
        this.runtimeFor()?.notify(`p2p-council: ${msg.message}`, 'error');
        break;
      }
      default:
        break;
    }
  }

  /** Send a chat/prompt-shaped message from this node, routing per connection type. */
  private sendChatLikeMessage(msg: ChatMsg | PromptRequestMsg | PromptResponseMsg): boolean {
    if (this.connectionType === 'host') {
      this.routeAsHost(msg);
      return true;
    }
    if (this.connectionType === 'client' && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  // ── Inbox flush (idle-gated batching) ───────────────────────────────────

  private drainDetachedChats(): void {
    if (!this.binding || this.detachedChats.length === 0) return;
    const queued = this.detachedChats.splice(0);
    for (const msg of queued) {
      if (msg.triggerTurn) this.inbox.push({ from: msg.from, content: msg.content });
      else this.binding.runtime.deliverSteer(msg.content, msg.from);
    }
    if (this.inbox.length > 0) this.scheduleFlush(0);
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushInbox(), delay);
  }

  private flushInbox(): void {
    this.flushTimer = null;
    if (this.inbox.length === 0) return;
    if (!this.runtimeFor()?.isIdle()) {
      this.scheduleFlush(IDLE_RETRY_MS);
      return;
    }

    const batch: P2pInboundItem[] = [];
    let totalChars = 0;
    for (let i = 0; i < this.inbox.length && batch.length < BATCH_MAX_ITEMS; i++) {
      const item = this.inbox[i];
      if (!item) break;
      const itemChars = item.from.length + item.content.length;
      if (batch.length > 0 && totalChars + itemChars > BATCH_MAX_CHARS) break;
      batch.push(item);
      totalChars += itemChars;
    }

    this.runtimeFor()?.deliverBatch(batch);
    this.inbox.splice(0, batch.length);
    if (this.inbox.length > 0) this.scheduleFlush(IDLE_RETRY_MS);
  }

  /** Called by the extension wrapper when the agent settles - wakes a stalled flush. */
  public wakeInboxFlush(token?: P2pCouncilBindingToken): void {
    if (token && !this.runtimeFor(token)) return;
    if (this.inbox.length > 0) this.scheduleFlush(0);
  }

  // ── Remote prompt completion (called from agent_end) ────────────────────

  public resolveRemotePrompt(responseText: string, token?: P2pCouncilBindingToken): void {
    if ((token && !this.runtimeFor(token)) || !this.pendingRemotePrompt) return;
    const { id, from } = this.pendingRemotePrompt;
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    this.pendingRemotePrompt = null;
    const response: PromptResponseMsg = { type: 'prompt_response', id, from: this.selfName, to: from, response: responseText || '(no response)' };
    this.sendChatLikeMessage(response);
  }

  private cancelRuntimeOwnedPrompts(error: string): void {
    for (const [id] of this.pendingPromptResponses) {
      const pending = this.cleanupPending(id);
      pending?.resolve({ error });
    }
    if (this.pendingRemotePrompt) {
      const { id, from } = this.pendingRemotePrompt;
      this.pendingRemotePrompt = null;
      if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
      this.sendChatLikeMessage({ type: 'prompt_response', id, from: this.selfName, to: from, response: '', error });
    }
  }

  // ── Outbound tool operations ─────────────────────────────────────────────

  public sendChat(to: string, content: string, triggerTurn: boolean): SendChatResult {
    if (!this.isConnected()) return { success: false, error: 'not_connected' };
    if (to === this.selfName) return { success: false, error: 'self_target' };
    if (!this.hasMember(to)) return { success: false, error: 'not_found' };
    const msg: ChatMsg = { type: 'chat', from: this.selfName, to, content, triggerTurn };
    const delivered = this.sendChatLikeMessage(msg);
    return delivered ? { success: true } : { success: false, error: 'not_delivered' };
  }

  public askPrompt(to: string, prompt: string, signal?: AbortSignal): Promise<{ response?: string; error?: string; from?: string }> {
    if (!this.isConnected()) return Promise.resolve({ error: 'not_connected' });
    if (to === this.selfName) return Promise.resolve({ error: 'self_target' });
    if (!this.hasMember(to)) return Promise.resolve({ error: 'not_found' });

    const requestId = randomUUID();
    return new Promise(resolve => {
      const inactivityTimeout = this.makeInactivityTimeout(requestId, to, resolve);
      const ceilingTimeout = setTimeout(() => {
        const pending = this.cleanupPending(requestId);
        if (pending) resolve({ error: `hard_ceiling:${PROMPT_HARD_CEILING_MS / 60_000}min` });
      }, PROMPT_HARD_CEILING_MS);

      this.pendingPromptResponses.set(requestId, { resolve: r => resolve(r), targetName: to, inactivityTimeout, ceilingTimeout });

      signal?.addEventListener(
        'abort',
        () => {
          const pending = this.cleanupPending(requestId);
          if (pending) resolve({ error: 'aborted' });
        },
        { once: true },
      );

      const request: PromptRequestMsg = { type: 'prompt_request', id: requestId, from: this.selfName, to, prompt };
      const delivered = this.sendChatLikeMessage(request);
      if (!delivered) {
        const pending = this.cleanupPending(requestId);
        if (pending) resolve({ error: 'not_delivered' });
      }
    });
  }

  private makeInactivityTimeout(
    requestId: string,
    targetName: string,
    resolve: (result: { response?: string; error?: string }) => void,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const pending = this.cleanupPending(requestId);
      if (pending) resolve({ error: `inactivity_timeout:${targetName}:${PROMPT_INACTIVITY_MS / 1000}s` });
    }, PROMPT_INACTIVITY_MS);
  }

  private resetInactivityFor(targetName: string): void {
    for (const [id, pending] of this.pendingPromptResponses) {
      if (pending.targetName === targetName) {
        clearTimeout(pending.inactivityTimeout);
        pending.inactivityTimeout = this.makeInactivityTimeout(id, targetName, r => pending.resolve(r));
      }
    }
  }

  private failPendingFor(name: string): void {
    for (const [id, pending] of this.pendingPromptResponses) {
      if (pending.targetName === name) {
        this.cleanupPending(id);
        pending.resolve({ error: `disconnected:${name}` });
      }
    }
  }

  private cleanupPending(requestId: string): PendingPromptResponse | undefined {
    const pending = this.pendingPromptResponses.get(requestId);
    if (!pending) return undefined;
    clearTimeout(pending.inactivityTimeout);
    clearTimeout(pending.ceilingTimeout);
    this.pendingPromptResponses.delete(requestId);
    return pending;
  }

  private hasMember(name: string): boolean {
    return this.getRoster().some(entry => entry.identity.name === name);
  }
}

export { CouncilRegistry };
