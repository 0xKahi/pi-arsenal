import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import { buildHubModalFactory, type P2pHubModalResult } from '../../../../src/extensions/p2p-hub/modal/open-p2p-hub-modal';
import { P2pHubState, type P2pHubStateDeps } from '../../../../src/extensions/p2p-hub/p2p-hub-state';
import { HubRegistry, type HubRegistryEntry } from '../../../../src/extensions/p2p-hub/registry.util';
import { PathUtil } from '../../../../src/utils/path.util';
import type { ModalDialog } from '../../../../src/libs/modal';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

const keybindings = {
  matches: (data: string, action: string) =>
    ({
      tab: 'tui.input.tab',
      up: 'tui.select.up',
      down: 'tui.select.down',
      enter: 'tui.select.confirm',
      esc: 'tui.select.cancel',
    })[data] === action,
} as unknown as KeybindingsManager;

function makeDeps(overrides: Partial<P2pHubStateDeps> & { name: string; registry: HubRegistry }): P2pHubStateDeps {
  return {
    identity: { name: overrides.name, description: undefined, cwd: `/tmp/${overrides.name}` },
    getModelName: () => 'test-model',
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

function makeTui() {
  return { terminal: { rows: 24 }, requestRender: () => undefined };
}

describe('buildHubModalFactory', () => {
  let dir: string;
  let registry: HubRegistry;
  const created: P2pHubState[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-modal-'));
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

  test('lists live hubs plus a "create new" row, and shows disconnected in the title', () => {
    const state = spawn('agent-a');
    const entries: HubRegistryEntry[] = [{ name: 'team-a', port: 1234, hostPid: process.pid, createdAt: new Date().toISOString() }];
    const results: P2pHubModalResult[] = [];
    const factory = buildHubModalFactory(state, entries);
    const dialog = factory(makeTui() as never, theme, keybindings, r => results.push(r), 'inline') as ModalDialog<P2pHubModalResult>;

    const rendered = dialog.render(60).join('\n');
    expect(rendered).toContain('Current Hub: (none)');
    expect(rendered).toContain('team-a');
    expect(rendered).toContain('create new');
  });

  test('marks the currently connected hub in the title and row', async () => {
    const state = spawn('agent-a');
    await state.createHub('team-b');
    const entry = registry.read('team-b');
    if (!entry) throw new Error('missing entry');

    const factory = buildHubModalFactory(state, [entry]);
    const dialog = factory(makeTui() as never, theme, keybindings, () => undefined, 'inline') as ModalDialog<P2pHubModalResult>;
    const rendered = dialog.render(60).join('\n');
    expect(rendered).toContain('Current Hub: team-b (connected)');
    expect(rendered).toContain('team-b (connected)');
  });

  test('selecting "create new" closes the dialog with {action: "create"}, not a pushed text layer', () => {
    const state = spawn('agent-a');
    const results: P2pHubModalResult[] = [];
    const factory = buildHubModalFactory(state, []);
    const dialog = factory(makeTui() as never, theme, keybindings, r => results.push(r), 'inline') as ModalDialog<P2pHubModalResult>;

    // Only item is "create new" (no hubs registered).
    dialog.handleInput('\r');
    expect(results).toEqual([{ action: 'create' }]);
  });

  test('vim navigation moves selection with j/k and Esc closes with {action: "close"}', () => {
    const state = spawn('agent-a');
    const entries: HubRegistryEntry[] = [
      { name: 'team-a', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() },
      { name: 'team-b', port: 2, hostPid: process.pid, createdAt: new Date().toISOString() },
    ];
    const results: P2pHubModalResult[] = [];
    const factory = buildHubModalFactory(state, entries);
    const dialog = factory(makeTui() as never, theme, keybindings, r => results.push(r), 'inline') as ModalDialog<P2pHubModalResult>;

    dialog.handleInput('j');
    dialog.handleInput('j');
    // Cursor should now be on "create new" (3rd row); confirm it.
    dialog.handleInput('\r');
    expect(results).toEqual([{ action: 'create' }]);

    const dialog2 = factory(makeTui() as never, theme, keybindings, r => results.push(r), 'inline') as ModalDialog<P2pHubModalResult>;
    dialog2.handleInput('q');
    expect(results.at(-1)).toEqual({ action: 'close' });
  });

  test('confirming a hub row pushes a detail layer instead of closing the dialog', () => {
    const state = spawn('agent-a');
    const entries: HubRegistryEntry[] = [{ name: 'team-a', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() }];
    const results: P2pHubModalResult[] = [];
    const factory = buildHubModalFactory(state, entries);
    const dialog = factory(makeTui() as never, theme, keybindings, r => results.push(r), 'inline') as ModalDialog<P2pHubModalResult>;

    dialog.handleInput('\r'); // confirm the first (and only) hub row
    expect(results).toEqual([]); // dialog stayed open - a layer was pushed, not a close
    const rendered = dialog.render(60).join('\n');
    // The detail layer's peek is async and this entry has no real server behind
    // it, so it renders its loading state - proof a layer was pushed over the list.
    expect(rendered).toContain('Loading...');
    expect(rendered).not.toContain('create new');
  });
});
