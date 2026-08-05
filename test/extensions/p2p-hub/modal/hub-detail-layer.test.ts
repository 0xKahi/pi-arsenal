import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { HubDetailLayer } from '../../../../src/extensions/p2p-hub/modal/hub-detail-layer';
import { P2pHubState, type P2pHubStateDeps } from '../../../../src/extensions/p2p-hub/p2p-hub-state';
import { HubRegistry } from '../../../../src/extensions/p2p-hub/registry.util';
import { PathUtil } from '../../../../src/utils/path.util';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function makeDeps(overrides: Partial<P2pHubStateDeps> & { name: string; registry: HubRegistry }): P2pHubStateDeps {
  return {
    identity: { name: overrides.name, description: undefined, cwd: `/tmp/${overrides.name}` },
    getModelName: () => 'test-model',
    getContextSnapshot: () => ({ tokens: 45_000, contextWindow: 272_000 }),
    isIdle: () => true,
    deliverBatch: () => {},
    deliverSteer: () => {},
    runRemotePrompt: () => {},
    notify: () => {},
    onChange: () => {},
    ...overrides,
  };
}

function makeTui() {
  let renders = 0;
  return {
    terminal: { rows: 24 },
    requestRender: () => renders++,
    get renders() {
      return renders;
    },
  };
}

describe('HubDetailLayer', () => {
  let dir: string;
  let registry: HubRegistry;
  const created: P2pHubState[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-detail-'));
    registry = new HubRegistry(PathUtil.findFile(dir));
  });

  afterEach(() => {
    for (const state of created) state.dispose();
    created.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  function spawn(name: string): P2pHubState {
    const state = new P2pHubState(makeDeps({ name, registry }));
    created.push(state);
    return state;
  }

  test('peeks an unjoined hub and renders host/client blocks without joining', async () => {
    const host = spawn('host-a');
    await host.createHub('detail-hub');
    const entry = registry.read('detail-hub');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const viewer = spawn('viewer'); // not a member of the hub
    const tui = makeTui();
    const layer = new HubDetailLayer(theme, tui as never, entry, viewer, () => {});
    expect(layer.render(60, undefined).join('\n')).toContain('Loading...');

    await Bun.sleep(50);
    const rendered = layer.render(60, undefined).join('\n');
    expect(rendered).toContain('Hub: detail-hub');
    expect(rendered).toContain('host-a');
    expect(rendered).toContain('client-a');
    expect(rendered).toContain('test-model');

    // The viewer must not have joined as a member.
    expect(host.getRoster().map(r => r.identity.name)).not.toContain('viewer');
    expect(layer.hints()).toEqual([['Enter', 'Connect']]);
  });

  test('shows the live roster and "Disconnect" hint for the currently connected hub', async () => {
    const host = spawn('host-a');
    await host.createHub('own-hub');
    const entry = registry.read('own-hub');
    if (!entry) throw new Error('missing entry');

    const tui = makeTui();
    const layer = new HubDetailLayer(theme, tui as never, entry, host, () => {});
    await Bun.sleep(10);

    expect(layer.hints()).toEqual([['Enter', 'Disconnect']]);
    expect(layer.render(60, undefined).join('\n')).toContain('host-a');
  });

  test('confirm connects to an unjoined hub', async () => {
    const host = spawn('host-a');
    await host.createHub('connect-hub');
    const entry = registry.read('connect-hub');
    if (!entry) throw new Error('missing entry');

    const client = spawn('client-a');
    const tui = makeTui();
    const layer = new HubDetailLayer(theme, tui as never, entry, client, () => {});
    await Bun.sleep(10);
    expect(client.isConnected()).toBe(false);

    layer.handleNavigation('confirm');
    await Bun.sleep(30);

    expect(client.isConnected()).toBe(true);
    expect(client.getHubName()).toBe('connect-hub');
    expect(layer.hints()).toEqual([['Enter', 'Disconnect']]);
  });

  test('confirm disconnects from the currently connected hub', async () => {
    const host = spawn('host-a');
    await host.createHub('disconnect-hub');
    const entry = registry.read('disconnect-hub');
    if (!entry) throw new Error('missing entry');

    const tui = makeTui();
    const layer = new HubDetailLayer(theme, tui as never, entry, host, () => {});
    await Bun.sleep(10);

    layer.handleNavigation('confirm');
    await Bun.sleep(30);

    expect(host.isConnected()).toBe(false);
  });

  test('an unreachable hub renders an error instead of hanging', async () => {
    const viewer = spawn('viewer');
    const tui = makeTui();
    const layer = new HubDetailLayer(
      theme,
      tui as never,
      { name: 'ghost-hub', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() },
      viewer,
      () => {},
    );
    await Bun.sleep(4000);
    expect(layer.render(60, undefined).join('\n')).toContain('unreachable');
  }, 10000);
});
