import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { P2pHubState, type P2pHubStateDeps } from '../../../src/extensions/p2p-hub/p2p-hub-state';
import { HubRegistry } from '../../../src/extensions/p2p-hub/registry.util';
import { PathUtil } from '../../../src/utils/path.util';

function makeDeps(overrides: Partial<P2pHubStateDeps> & { name: string; registry: HubRegistry }): P2pHubStateDeps {
  return {
    identity: { name: overrides.name, description: undefined, cwd: `/tmp/${overrides.name}` },
    getModelId: () => 'gpt-5.6-sol',
    getContextSnapshot: () => ({ tokens: 1000, contextWindow: 10000 }),
    isIdle: () => true,
    deliverBatch: () => {},
    deliverSteer: () => {},
    runRemotePrompt: () => {},
    notify: () => {},
    onChange: () => {},
    ...overrides,
  };
}

describe('P2pHubState', () => {
  let dir: string;
  let registry: HubRegistry;
  const created: P2pHubState[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-state-'));
    registry = new HubRegistry(PathUtil.findFile(dir));
  });

  afterEach(() => {
    for (const state of created) state.dispose();
    created.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  function spawn(name: string, overrides: Partial<P2pHubStateDeps> = {}): P2pHubState {
    const state = new P2pHubState(makeDeps({ name, registry, ...overrides }));
    created.push(state);
    return state;
  }

  test('createHub starts a host and writes a live registry entry', async () => {
    const host = spawn('host-a');
    const result = await host.createHub('team-a');
    expect(result.success).toBe(true);
    expect(host.getRole()).toBe('host');
    expect(host.getHubName()).toBe('team-a');
    expect(registry.exists('team-a')).toBe(true);
  });

  test('createHub rejects a name with a live registry entry', async () => {
    const host = spawn('host-a');
    await host.createHub('dup-hub');

    const other = spawn('host-b');
    const result = await other.createHub('dup-hub');
    expect(result.success).toBe(false);
  });

  test('client joins a hub and both sides see the roster', async () => {
    const host = spawn('host-a');
    await host.createHub('team-b');
    const entry = registry.read('team-b');
    expect(entry).toBeDefined();
    if (!entry) return;

    const client = spawn('client-a');
    const join = await client.joinHub(entry);
    expect(join.success).toBe(true);
    expect(client.getRole()).toBe('client');

    const hostRoster = host.getRoster();
    const clientRoster = client.getRoster();
    expect(hostRoster.map(r => r.identity.name).sort()).toEqual(['client-a', 'host-a']);
    expect(clientRoster.map(r => r.identity.name).sort()).toEqual(['client-a', 'host-a']);
    expect(hostRoster.find(r => r.identity.name === 'host-a')).toMatchObject({ role: 'host', isSelf: true });
    expect(hostRoster.find(r => r.identity.name === 'client-a')).toMatchObject({ role: 'client', isSelf: false });
    expect(clientRoster.find(r => r.identity.name === 'host-a')).toMatchObject({ role: 'host', isSelf: false });
    expect(clientRoster.find(r => r.identity.name === 'client-a')).toMatchObject({ role: 'client', isSelf: true });
  });

  test('canonical model IDs survive registration, welcome snapshots, status updates, roster access, and peeks', async () => {
    let clientModelId = 'gpt-5.6-sol';
    const host = spawn('host-model', { getModelId: () => 'claude-sonnet-4-5' });
    await host.createHub('model-hub');
    const entry = registry.read('model-hub');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-model', { getModelId: () => clientModelId });
    await client.joinHub(entry);
    await Bun.sleep(20);

    expect(host.getRoster().find(member => member.identity.name === 'client-model')?.identity.model).toBe('gpt-5.6-sol');
    expect(client.getRoster().find(member => member.identity.name === 'host-model')?.identity.model).toBe('claude-sonnet-4-5');

    clientModelId = 'gpt-5.7-sol';
    client.setActiveTool('bash');
    await Bun.sleep(20);
    expect(host.getRoster().find(member => member.identity.name === 'client-model')?.identity.model).toBe('gpt-5.7-sol');

    const viewer = spawn('viewer');
    const peek = await viewer.peek(entry);
    expect(peek?.host?.model).toBe('claude-sonnet-4-5');
    expect(peek?.clients.find(member => member.name === 'client-model')?.model).toBe('gpt-5.7-sol');
  });

  test('a joining client immediately receives the host and all existing clients with explicit roles', async () => {
    const host = spawn('host-a');
    await host.createHub('topology-hub');
    const entry = registry.read('topology-hub');
    if (!entry) throw new Error('missing entry');
    const clientA = spawn('client-a');
    await clientA.joinHub(entry);
    const clientB = spawn('client-b');
    const result = await clientB.joinHub(entry);

    expect(result.success).toBe(true);
    expect(clientB.getRoster().map(member => ({ name: member.identity.name, role: member.role, isSelf: member.isSelf }))).toEqual([
      { name: 'client-b', role: 'client', isSelf: true },
      { name: 'host-a', role: 'host', isSelf: false },
      { name: 'client-a', role: 'client', isSelf: false },
    ]);
  });

  test('join fails cleanly when an open transport never sends welcome', async () => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');
    const client = spawn('client-a');
    const result = await client.joinHub({
      name: 'silent-hub',
      port: address.port,
      hostPid: process.pid,
      createdAt: new Date().toISOString(),
    });

    expect(result).toEqual({ success: false, error: 'welcome handshake timed out' });
    expect(client.getRole()).toBe('disconnected');
    expect(client.getHubName()).toBeUndefined();
    expect(client.getRoster()).toEqual([]);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }, 5000);

  test('hub deduplicates a colliding member name', async () => {
    const host = spawn('host-a');
    await host.createHub('team-c');
    const entry = registry.read('team-c');
    if (!entry) throw new Error('missing entry');

    const client1 = spawn('same-name');
    await client1.joinHub(entry);
    const client2 = spawn('same-name');
    await client2.joinHub(entry);
    await Bun.sleep(20);

    expect(client1.getSelfName()).toBe('same-name');
    expect(client2.getSelfName()).toBe('same-name-2');
  });

  test('status propagates from client to host and back to other members', async () => {
    const host = spawn('host-a');
    await host.createHub('team-d');
    const entry = registry.read('team-d');
    if (!entry) throw new Error('missing entry');

    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    client.setActiveTool('bash');
    await Bun.sleep(20);

    const statusOnHost = host.getRoster().find(r => r.identity.name === 'client-a')?.status;
    expect(statusOnHost?.kind).toBe('tool');
  });

  test('chat with triggerTurn:false delivers as a steer message on the target', async () => {
    const received: { content: string; from: string }[] = [];
    const host = spawn('host-a', { deliverSteer: (content, from) => received.push({ content, from }) });
    await host.createHub('team-e');
    const entry = registry.read('team-e');
    if (!entry) throw new Error('missing entry');

    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const result = client.sendChat('host-a', 'hello host', false);
    expect(result.success).toBe(true);
    await Bun.sleep(20);
    expect(received).toEqual([{ content: 'hello host', from: 'client-a' }]);
  });

  test('chat targeting an unknown member fails with not_found', async () => {
    const host = spawn('host-a');
    await host.createHub('team-f');
    const entry = registry.read('team-f');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const result = client.sendChat('ghost', 'hi', false);
    expect(result).toEqual({ success: false, error: 'not_found' });
  });

  test('askPrompt round-trips through prompt_request/prompt_response', async () => {
    const host = spawn('host-a', {
      runRemotePrompt: (from, prompt) => {
        // Simulate the remote agent finishing a turn and answering.
        setTimeout(() => host.resolveRemotePrompt(`echo: ${prompt} (from ${from})`), 5);
      },
    });
    await host.createHub('team-g');
    const entry = registry.read('team-g');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const result = await client.askPrompt('host-a', 'what is up');
    expect(result.error).toBeUndefined();
    expect(result.response).toBe('echo: what is up (from client-a)');
  });

  test('askPrompt against a busy target returns an error', async () => {
    const host = spawn('host-a');
    await host.createHub('team-h');
    const entry = registry.read('team-h');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    host.setAgentRunning(true);
    const result = await client.askPrompt('host-a', 'ping');
    expect(result.error).toBe('Terminal is busy');
  });

  test('peek returns the roster without registering the peeker as a member', async () => {
    const host = spawn('host-a');
    await host.createHub('team-i');
    const entry = registry.read('team-i');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const peeker = spawn('peeker');
    const snapshot = await peeker.peek(entry);
    expect(snapshot?.hubName).toBe('team-i');
    expect(snapshot?.host?.name).toBe('host-a');
    expect(snapshot?.clients.map(c => c.name)).toEqual(['client-a']);

    // The peeker must not appear in the host's or client's live roster.
    const hostRoster = host.getRoster().map(r => r.identity.name);
    expect(hostRoster).not.toContain('peeker');
  });

  test('manual disconnect removes the registry entry when no clients remain', async () => {
    const host = spawn('host-a');
    await host.createHub('team-j');
    expect(registry.exists('team-j')).toBe(true);
    host.disconnect('manual');
    expect(registry.exists('team-j')).toBe(false);
    expect(host.getRole()).toBe('disconnected');
  });

  test('member_left fires when a client disconnects, and roster updates on the host', async () => {
    const host = spawn('host-a');
    await host.createHub('team-k');
    const entry = registry.read('team-k');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    client.disconnect('manual');
    await Bun.sleep(20);

    const hostRoster = host.getRoster().map(r => r.identity.name);
    expect(hostRoster).toEqual(['host-a']);
  });

  test('runtime replacement rejects stale callbacks and refreshes model/context status', async () => {
    let oldChanges = 0;
    let newChanges = 0;
    const host = spawn('host-binding', { onChange: () => oldChanges++ });
    await host.createHub('binding-hub');
    const oldToken = host.attachRuntime(makeDeps({ name: 'host-binding', registry, getModelId: () => 'old-model', onChange: () => oldChanges++ }));
    host.detachRuntime(oldToken);

    const newToken = host.attachRuntime(
      makeDeps({
        name: 'host-binding',
        registry,
        getModelId: () => 'new-model',
        getContextSnapshot: () => ({ tokens: 42, contextWindow: 100 }),
        onChange: () => newChanges++,
      }),
    );
    host.setActiveTool('stale-tool', oldToken);

    expect(host.getRoster()[0]?.identity.model).toBe('new-model');
    expect(host.getRoster()[0]?.identity.context).toEqual({ tokens: 42, contextWindow: 100 });
    expect(host.getRoster()[0]?.status?.kind).toBe('idle');
    expect(newChanges).toBeGreaterThan(0);
    expect(host.isRuntimeAttached()).toBe(true);
    host.setActiveTool('bash', newToken);
    expect(host.getRoster()[0]?.status).toMatchObject({ kind: 'tool', toolName: 'bash' });
  });

  test('queues trigger-turn and steer chat while detached and rejects prompts temporarily', async () => {
    const batches: string[] = [];
    const steers: string[] = [];
    const host = spawn('host-detached');
    await host.createHub('detached-hub');
    const entry = registry.read('detached-hub');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-detached');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const token = host.attachRuntime(makeDeps({ name: 'host-detached', registry }));
    host.detachRuntime(token);
    client.sendChat('host-detached', 'turn later', true);
    client.sendChat('host-detached', 'steer later', false);
    const unavailable = await client.askPrompt('host-detached', 'do work');
    expect(unavailable.error).toBe('runtime_temporarily_unavailable');

    host.attachRuntime(
      makeDeps({
        name: 'host-detached',
        registry,
        deliverBatch: text => batches.push(text),
        deliverSteer: content => steers.push(content),
      }),
    );
    await Bun.sleep(20);
    expect(batches.join('\n')).toContain('turn later');
    expect(steers).toEqual(['steer later']);
  });

  test('detach terminates outgoing and incoming runtime-owned prompt work', async () => {
    const host = spawn('host-prompts', { runRemotePrompt: () => {} });
    await host.createHub('prompt-detach-hub');
    const entry = registry.read('prompt-detach-hub');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-prompts', { runRemotePrompt: () => {} });
    await client.joinHub(entry);
    await Bun.sleep(20);

    const hostToken = host.attachRuntime(makeDeps({ name: 'host-prompts', registry, runRemotePrompt: () => {} }));
    const incoming = client.askPrompt('host-prompts', 'incoming work');
    await Bun.sleep(10);
    host.detachRuntime(hostToken);
    expect((await incoming).error).toBe('runtime_replaced');

    host.attachRuntime(makeDeps({ name: 'host-prompts', registry, runRemotePrompt: () => {} }));
    const clientToken = client.attachRuntime(makeDeps({ name: 'client-prompts', registry, runRemotePrompt: () => {} }));
    const outgoing = client.askPrompt('host-prompts', 'outgoing work');
    await Bun.sleep(10);
    client.detachRuntime(clientToken);
    expect((await outgoing).error).toBe('runtime_replaced');
  });

  test('handoff timeout disposes transport, registry ownership, and retained queues', async () => {
    const host = spawn('host-timeout');
    await host.createHub('timeout-hub');
    const token = host.attachRuntime(makeDeps({ name: 'host-timeout', registry }));

    jest.useFakeTimers();
    try {
      host.detachRuntime(token);
      jest.advanceTimersByTime(5001);
      expect(host.isConnected()).toBe(false);
      expect(host.isRuntimeAttached()).toBe(false);
      expect(registry.exists('timeout-hub')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('promotion: a client rebinds the same port and becomes host after the original host disconnects', async () => {
    const host = spawn('host-a');
    await host.createHub('team-l');
    const entry = registry.read('team-l');
    if (!entry) throw new Error('missing entry');
    const originalPort = entry.port;

    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    // Simulate a crash: drop the host without a clean disconnect (no registry removal).
    host.debugSimulateCrash();

    // Wait past the promotion jitter window for the client to win the race.
    await Bun.sleep(3000);

    expect(client.getRole()).toBe('host');
    expect(client.getHubName()).toBe('team-l');
    const promoted = registry.read('team-l');
    expect(promoted?.port).toBe(originalPort);
  }, 10000);
});
