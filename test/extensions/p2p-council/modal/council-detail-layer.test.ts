import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { CouncilDetailLayer } from '../../../../src/extensions/p2p-council/modal/council-detail-layer';
import { P2pCouncilState, type P2pCouncilStateDeps } from '../../../../src/extensions/p2p-council/p2p-council-state';
import { CouncilRegistry } from '../../../../src/extensions/p2p-council/registry.util';
import { PathUtil } from '../../../../src/utils/path.util';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function makeDeps(overrides: Partial<P2pCouncilStateDeps> & { name: string; registry: CouncilRegistry }): P2pCouncilStateDeps {
  return {
    identity: { name: overrides.name, description: undefined, cwd: `/tmp/${overrides.name}` },
    getModelId: () => 'gpt-5.6-sol',
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

describe('CouncilDetailLayer', () => {
  let dir: string;
  let registry: CouncilRegistry;
  const created: P2pCouncilState[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-detail-'));
    registry = new CouncilRegistry(PathUtil.findFile(dir));
  });

  afterEach(() => {
    for (const state of created) state.dispose();
    created.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  function spawn(name: string): P2pCouncilState {
    const state = new P2pCouncilState(makeDeps({ name, registry }));
    created.push(state);
    return state;
  }

  test('peeks an unjoined council and renders host/client blocks without joining', async () => {
    const host = spawn('host-a');
    await host.createCouncil('detail-council');
    const entry = registry.read('detail-council');
    if (!entry) throw new Error('missing entry');
    const client = spawn('client-a');
    await client.joinCouncil(entry);
    await Bun.sleep(20);

    const viewer = spawn('viewer'); // not a member of the council
    const tui = makeTui();
    const layer = new CouncilDetailLayer(theme, tui as never, entry, viewer, () => {});
    expect(layer.render(60, undefined).join('\n')).toContain('Loading...');

    await Bun.sleep(50);
    const rendered = layer.render(60, undefined).join('\n');
    expect(rendered).toContain('Council: detail-council');
    expect(rendered).toContain('host-a');
    expect(rendered).toContain('client-a');
    expect(rendered).toContain('gpt-5.6-sol');

    // The viewer must not have joined as a member.
    expect(host.getRoster().map(r => r.identity.name)).not.toContain('viewer');
    expect(layer.hints()).toEqual([['Enter', 'Connect']]);
  });

  test('shows the live roster and "Disconnect" hint for the currently connected council', async () => {
    const host = spawn('host-a');
    await host.createCouncil('own-council');
    const entry = registry.read('own-council');
    if (!entry) throw new Error('missing entry');

    const tui = makeTui();
    const layer = new CouncilDetailLayer(theme, tui as never, entry, host, () => {});
    await Bun.sleep(10);

    expect(layer.hints()).toEqual([['Enter', 'Disconnect']]);
    expect(layer.render(60, undefined).join('\n')).toContain('host-a');
  });

  test('connected detail updates live for joins, status changes, and leaves without reopening', async () => {
    const host = spawn('host-a');
    await host.createCouncil('live-council');
    const entry = registry.read('live-council');
    if (!entry) throw new Error('missing entry');
    const clientA = spawn('client-a');
    await clientA.joinCouncil(entry);

    const tui = makeTui();
    const layer = new CouncilDetailLayer(theme, tui as never, entry, host, () => {});
    await Bun.sleep(10);
    expect(layer.render(60, undefined).join('\n')).toContain('Clients (1):');
    const priorRenders = tui.renders;

    const clientB = spawn('client-b');
    await clientB.joinCouncil(entry);
    expect(tui.renders).toBeGreaterThan(priorRenders);
    expect(layer.render(60, undefined).join('\n')).toContain('Clients (2):');
    expect(layer.render(60, undefined).join('\n')).toContain('client-b');

    clientB.setActiveTool('bash');
    await Bun.sleep(10);
    expect(layer.render(60, undefined).join('\n')).toContain('tool:bash');

    clientB.disconnect('manual');
    await Bun.sleep(10);
    expect(layer.render(60, undefined).join('\n')).toContain('Clients (1):');
    expect(layer.render(60, undefined).join('\n')).not.toContain('client-b');
    layer.dispose();
  });

  test('confirm connects to an unjoined council with authoritative grouping immediately', async () => {
    const host = spawn('host-a');
    await host.createCouncil('connect-council');
    const entry = registry.read('connect-council');
    if (!entry) throw new Error('missing entry');

    const client = spawn('client-a');
    const tui = makeTui();
    const connectionChanges: boolean[] = [];
    const layer = new CouncilDetailLayer(theme, tui as never, entry, client, () => {}, connected => connectionChanges.push(connected));
    await Bun.sleep(10);
    expect(client.isConnected()).toBe(false);

    layer.handleNavigation('confirm');
    await Bun.sleep(30);

    expect(client.isConnected()).toBe(true);
    expect(connectionChanges).toEqual([true]);
    expect(client.getCouncilName()).toBe('connect-council');
    expect(layer.hints()).toEqual([['Enter', 'Disconnect']]);
    const rendered = layer.render(60, undefined).join('\n');
    expect(rendered.indexOf('Host:')).toBeLessThan(rendered.indexOf('host-a'));
    expect(rendered).toContain('Clients (1):');
    expect(rendered).toContain('client-a');
  });

  test('confirm disconnects from the currently connected council', async () => {
    const host = spawn('host-a');
    await host.createCouncil('disconnect-council');
    const entry = registry.read('disconnect-council');
    if (!entry) throw new Error('missing entry');

    const tui = makeTui();
    const connectionChanges: boolean[] = [];
    const layer = new CouncilDetailLayer(theme, tui as never, entry, host, () => {}, connected => connectionChanges.push(connected));
    await Bun.sleep(10);

    layer.handleNavigation('confirm');
    await Bun.sleep(30);

    expect(host.isConnected()).toBe(false);
    expect(connectionChanges).toEqual([false]);
  });

  test('a failed join does not report a connection transition', async () => {
    const viewer = spawn('failed-join-viewer');
    const tui = makeTui();
    const connectionChanges: boolean[] = [];
    const layer = new CouncilDetailLayer(
      theme,
      tui as never,
      { name: 'missing-council', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() },
      viewer,
      () => {},
      connected => connectionChanges.push(connected),
    );
    await Bun.sleep(4000);

    layer.handleNavigation('confirm');
    await Bun.sleep(4000);

    expect(viewer.isConnected()).toBe(false);
    expect(connectionChanges).toEqual([]);
  }, 10000);

  test('an unreachable council renders an error instead of hanging', async () => {
    const viewer = spawn('viewer');
    const tui = makeTui();
    const layer = new CouncilDetailLayer(
      theme,
      tui as never,
      { name: 'ghost-council', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() },
      viewer,
      () => {},
    );
    await Bun.sleep(4000);
    expect(layer.render(60, undefined).join('\n')).toContain('unreachable');
  }, 10000);
});
