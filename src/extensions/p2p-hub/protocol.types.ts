/**
 * Wire protocol for p2p-hub. Adapted from the pi-link hub-and-spoke protocol
 * with identity fields (model, description) added, and a peek request/response
 * pair for read-only roster queries that never join the hub as a member.
 * Remote-compaction messages from pi-link are intentionally not carried over.
 */

export type P2pStatus = { kind: 'idle'; since: number } | { kind: 'thinking'; since: number } | { kind: 'tool'; toolName: string; since: number };

export type P2pContextSnapshot = { tokens: number | null; contextWindow: number };

export interface P2pIdentity {
  name: string;
  model?: string;
  description?: string;
  cwd?: string;
  context?: P2pContextSnapshot;
}

export interface RegisterMsg {
  type: 'register';
  name: string;
  model?: string;
  description?: string;
  cwd?: string;
  context?: P2pContextSnapshot;
}

export interface WelcomeMsg {
  type: 'welcome';
  assignedName: string; // possibly deduped by the hub
  host: P2pIdentity;
  clients: P2pIdentity[]; // existing clients, excluding this joiner
  statuses: Record<string, P2pStatus>;
}

export interface MemberJoinedMsg {
  type: 'member_joined';
  identity: P2pIdentity;
}

export interface MemberLeftMsg {
  type: 'member_left';
  name: string;
}

export interface ChatMsg {
  type: 'chat';
  from: string;
  to: string;
  content: string;
  triggerTurn: boolean;
}

export interface PromptRequestMsg {
  type: 'prompt_request';
  id: string;
  from: string;
  to: string;
  prompt: string;
}

export interface PromptResponseMsg {
  type: 'prompt_response';
  id: string;
  from: string;
  to: string;
  response: string;
  error?: string;
}

export interface StatusUpdateMsg {
  type: 'status_update';
  name: string;
  status: P2pStatus;
  model?: string;
  /** Absent = no change; null = clear stored value; object = store. */
  context?: P2pContextSnapshot | null;
}

export interface ErrorMsg {
  type: 'error';
  message: string;
}

/** Sent instead of `register` to obtain a roster without joining. */
export interface PeekMsg {
  type: 'peek';
}

export interface PeekResponseMsg {
  type: 'peek_response';
  hubName: string;
  host: P2pIdentity | undefined;
  clients: P2pIdentity[];
  statuses: Record<string, P2pStatus>;
}

export type P2pMessage =
  | RegisterMsg
  | WelcomeMsg
  | MemberJoinedMsg
  | MemberLeftMsg
  | ChatMsg
  | PromptRequestMsg
  | PromptResponseMsg
  | StatusUpdateMsg
  | ErrorMsg
  | PeekMsg
  | PeekResponseMsg;

export function safeParseP2pMessage(raw: string): P2pMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') return undefined;
    if ((parsed as { type: string }).type === 'welcome' && !isWelcomeMsg(parsed)) return undefined;
    return parsed as P2pMessage;
  } catch {
    return undefined;
  }
}

function isWelcomeMsg(value: unknown): value is WelcomeMsg {
  if (value === null || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (msg.type !== 'welcome' || typeof msg.assignedName !== 'string' || !isIdentity(msg.host) || !Array.isArray(msg.clients)) return false;
  if (!msg.clients.every(isIdentity) || msg.statuses === null || typeof msg.statuses !== 'object' || Array.isArray(msg.statuses)) return false;
  return Object.values(msg.statuses).every(isStatus);
}

function isIdentity(value: unknown): value is P2pIdentity {
  if (value === null || typeof value !== 'object') return false;
  const identity = value as Record<string, unknown>;
  return typeof identity.name === 'string';
}

function isStatus(value: unknown): value is P2pStatus {
  if (value === null || typeof value !== 'object') return false;
  const status = value as Record<string, unknown>;
  if (typeof status.since !== 'number') return false;
  return status.kind === 'idle' || status.kind === 'thinking' || (status.kind === 'tool' && typeof status.toolName === 'string');
}
