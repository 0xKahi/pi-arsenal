import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { P2pHubState, type P2pHubStateDeps } from '../../../../src/extensions/p2p-hub/p2p-hub-state';
import { HubRegistry } from '../../../../src/extensions/p2p-hub/registry.util';
import { PathUtil } from '../../../../src/utils/path.util';
import { createP2pAskTool } from '../../../../src/extensions/p2p-hub/tools/p2p-ask.tool';
import { createP2pLsTool } from '../../../../src/extensions/p2p-hub/tools/p2p-ls.tool';
import { createP2pSendTool } from '../../../../src/extensions/p2p-hub/tools/p2p-send.tool';

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

describe('p2p-hub tools', () => {
  let dir: string;
  let registry: HubRegistry;
  const created: P2pHubState[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-tools-'));
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

  async function connectedPair(hubName: string, deliverSteer?: P2pHubStateDeps['deliverSteer']) {
    const host = spawn('host-a', deliverSteer ? { deliverSteer } : {});
    await host.createHub(hubName);
    const entry = registry.read(hubName);
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);
    return { host, client };
  }

  test('p2p_send returns not-connected error when disconnected', async () => {
    const state = spawn('lonely');
    const tool = createP2pSendTool(state);
    const result = await tool.execute('id', { to: 'nobody', message: 'hi' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('not_connected');
  });

  test('p2p_send delivers a steer message when triggerTurn is false', async () => {
    const received: { content: string; from: string }[] = [];
    const { client } = await connectedPair('send-hub', (content, from) => received.push({ content, from }));
    const tool = createP2pSendTool(client);
    const result = await tool.execute('id', { to: 'host-a', message: 'hello' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBeUndefined();
    await Bun.sleep(20);
    expect(received).toEqual([{ content: 'hello', from: 'client-a' }]);
  });

  test('p2p_send against an unknown target lists connected members', async () => {
    const { client } = await connectedPair('send-hub-2');
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
    await host.createHub('ask-hub');
    const entry = registry.read('ask-hub');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-b');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const tool = createP2pAskTool(client);
    const result = await tool.execute('id', { to: 'host-a', prompt: 'ping' }, undefined, undefined, undefined as never);
    expect(result.content[0]?.type === 'text' ? result.content[0].text : '').toBe('reply to ping from client-b');
  });

  test('p2p_ask returns not-connected error when disconnected', async () => {
    const state = spawn('lonely-ask');
    const tool = createP2pAskTool(state);
    const result = await tool.execute('id', { to: 'nobody', prompt: 'hi' }, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('not_connected');
  });

  test('p2p_ls reports actual roles and separate self markers for clients and hosts', async () => {
    const { host, client } = await connectedPair('ls-hub');
    const clientResult = await createP2pLsTool(client).execute('id', {}, undefined, undefined, undefined as never);
    const clientText = clientResult.content[0]?.type === 'text' ? clientResult.content[0].text : '';
    expect(clientText).toContain('host-a [host]');
    expect(clientText).toContain('client-a (you) [client]');
    expect(clientText).toContain('gpt-5.6-sol');
    expect(clientText).toContain('%');
    expect(clientResult.details.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'host-a', role: 'host', isSelf: false, model: 'gpt-5.6-sol' }),
        expect.objectContaining({ name: 'client-a', role: 'client', isSelf: true, model: 'gpt-5.6-sol' }),
      ]),
    );

    const hostResult = await createP2pLsTool(host).execute('id', {}, undefined, undefined, undefined as never);
    const hostText = hostResult.content[0]?.type === 'text' ? hostResult.content[0].text : '';
    expect(hostText).toContain('host-a (you) [host]');
    expect(hostText).toContain('client-a [client]');
    expect(hostResult.details.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'host-a', role: 'host', isSelf: true }),
        expect.objectContaining({ name: 'client-a', role: 'client', isSelf: false }),
      ]),
    );
  });

  test('p2p_ls returns not-connected error when disconnected', async () => {
    const state = spawn('lonely-ls');
    const tool = createP2pLsTool(state);
    const result = await tool.execute('id', {}, undefined, undefined, undefined as never);
    expect(result.details.error).toBe('not_connected');
  });
});
