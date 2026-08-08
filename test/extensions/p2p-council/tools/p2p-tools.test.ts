import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_MAX_BYTES } from '@earendil-works/pi-coding-agent';
import { P2pCouncilState, type P2pCouncilStateDeps } from '../../../../src/extensions/p2p-council/p2p-council-state';
import { CouncilRegistry } from '../../../../src/extensions/p2p-council/registry.util';
import { createP2pAskTool } from '../../../../src/extensions/p2p-council/tools/p2p-ask.tool';
import { createP2pLsTool } from '../../../../src/extensions/p2p-council/tools/p2p-ls.tool';
import { createP2pSendTool } from '../../../../src/extensions/p2p-council/tools/p2p-send.tool';
import { PathUtil } from '../../../../src/utils/path.util';

function makeDeps(overrides: Partial<P2pCouncilStateDeps> & { name: string; registry: CouncilRegistry }): P2pCouncilStateDeps {
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

describe('p2p-council tools', () => {
  let dir: string;
  let registry: CouncilRegistry;
  const created: P2pCouncilState[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-tools-'));
    registry = new CouncilRegistry(PathUtil.findFile(dir));
  });

  afterEach(() => {
    for (const state of created) state.dispose();
    created.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  function spawn(name: string, overrides: Partial<P2pCouncilStateDeps> = {}): P2pCouncilState {
    const state = new P2pCouncilState(makeDeps({ name, registry, ...overrides }));
    created.push(state);
    return state;
  }

  async function connectedPair(councilName: string, deliverSteer?: P2pCouncilStateDeps['deliverSteer']) {
    const host = spawn('host-a', deliverSteer ? { deliverSteer } : {});
    await host.createCouncil(councilName);
    const entry = registry.read(councilName);
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinCouncil(entry);
    await Bun.sleep(20);
    return { host, client };
  }

  test('p2p_send returns not-connected error when disconnected', async () => {
    const state = spawn('lonely');
    const tool = createP2pSendTool(state);
    const result = await tool.execute('id', { to: 'nobody', message: 'hi' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('not_connected');
  });

  test('tools registered before activation resolve their state lazily at call time', async () => {
    // Tools are registered at extension load, before any council state exists.
    let state: ReturnType<typeof spawn> | undefined;
    const send = createP2pSendTool(() => state);
    const ls = createP2pLsTool(() => state);

    const beforeActivation = await send.execute('id', { to: 'nobody', message: 'hi' }, undefined, undefined, undefined as never);
    expect(beforeActivation.details.error).toBe('not_connected');
    expect((await ls.execute('id', {}, undefined, undefined, undefined as never)).details.error).toBe('not_connected');

    const { host, client } = await connectedPair('lazy-council');
    state = host;
    const afterActivation = await send.execute('id', { to: client.getSelfName(), message: 'hi' }, undefined, undefined, undefined as never);
    expect(afterActivation.details.error).toBeUndefined();
    expect(afterActivation.details.to).toBe(client.getSelfName());
  });

  test('p2p_send delivers a steer message when triggerTurn is false', async () => {
    const received: { content: string; from: string }[] = [];
    const { client } = await connectedPair('send-council', (content, from) => received.push({ content, from }));
    const tool = createP2pSendTool(client);
    const result = await tool.execute('id', { to: 'host-a', message: 'hello' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBeUndefined();
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toBe(
      'Accepted message for transport to "host-a" as a steer; no turn was requested.',
    );
    await Bun.sleep(20);
    expect(received).toEqual([{ content: 'hello', from: 'client-a' }]);
  });

  test('p2p_send against an unknown target lists connected members', async () => {
    const { client } = await connectedPair('send-council-2');
    const tool = createP2pSendTool(client);
    const result = await tool.execute('id', { to: 'ghost', message: 'hi' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('not_found');
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('host-a');
  });

  test('p2p_ask returns the remote reply on success', async () => {
    const host = spawn('host-a', {
      runRemotePrompt: (from, prompt) => {
        setTimeout(() => host.resolveRemotePrompt(`reply to ${prompt} from ${from}`), 5);
      },
    });
    await host.createCouncil('ask-council');
    const entry = registry.read('ask-council');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-b');
    await client.joinCouncil(entry);
    await Bun.sleep(20);

    const tool = createP2pAskTool(client);
    const result = await tool.execute('id', { to: 'host-a', prompt: 'ping' }, undefined, undefined, undefined as never);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toBe('reply to ping from client-b');
  });

  test('p2p_ask truncates oversized replies with an explicit notice', async () => {
    const oversized = 'x'.repeat(DEFAULT_MAX_BYTES + 1000);
    const host = spawn('host-large', {
      runRemotePrompt: () => setTimeout(() => host.resolveRemotePrompt(oversized), 5),
    });
    await host.createCouncil('large-ask-council');
    const entry = registry.read('large-ask-council');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-large');
    await client.joinCouncil(entry);
    await Bun.sleep(20);

    const result = await createP2pAskTool(client).execute(
      'id',
      { to: 'host-large', prompt: 'large reply please' },
      undefined,
      undefined,
      undefined as never,
    );
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(result.details.truncated).toBe(true);
    expect(text).toContain('[Reply truncated:');
    expect(Buffer.byteLength(text)).toBeLessThan(DEFAULT_MAX_BYTES + 500);
  });

  test('p2p_ask normalizes busy errors without throwing', async () => {
    const { host, client } = await connectedPair('busy-ask-council');
    host.setAgentRunning(true);
    const result = await createP2pAskTool(client).execute('id', { to: 'host-a', prompt: 'ping' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('busy');
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toContain('busy');
  });

  test('p2p_ask returns not-connected error when disconnected', async () => {
    const state = spawn('lonely-ask');
    const tool = createP2pAskTool(state);
    const result = await tool.execute('id', { to: 'nobody', prompt: 'hi' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('not_connected');
  });

  test('p2p_ls returns only routing-relevant fields and marks the caller', async () => {
    const { host, client } = await connectedPair('ls-council');
    const clientResult = await createP2pLsTool(client).execute('id', {}, undefined, undefined, undefined as never);
    const clientText = clientResult.content[0]?.type === 'text' ? clientResult.content[0].text : '';
    expect(clientText).toContain('host-a');
    expect(clientText).toContain('client-a (you)');
    expect(clientText).not.toContain('[host]');
    expect(clientText).not.toContain('[client]');
    expect(clientText).not.toContain('gpt-5.6-sol');
    expect(clientText).not.toContain('%');
    expect(clientResult.details.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'host-a', isSelf: false, cwd: '/tmp/host-a' }),
        expect.objectContaining({ name: 'client-a', isSelf: true, cwd: '/tmp/client-a' }),
      ]),
    );

    const hostResult = await createP2pLsTool(host).execute('id', {}, undefined, undefined, undefined as never);
    const hostMembers = hostResult.details.members as Record<string, unknown>[];
    expect(hostMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'host-a', isSelf: true }),
        expect.objectContaining({ name: 'client-a', isSelf: false }),
      ]),
    );
    for (const member of [...(clientResult.details.members as Record<string, unknown>[]), ...hostMembers]) {
      expect(member).not.toHaveProperty('role');
      expect(member).not.toHaveProperty('connectionType');
      expect(member).not.toHaveProperty('model');
      expect(member).not.toHaveProperty('context');
    }
  });

  test('p2p_ls returns not-connected error when disconnected', async () => {
    const state = spawn('lonely-ls');
    const tool = createP2pLsTool(state);
    const result = await tool.execute('id', {}, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('not_connected');
  });
});
