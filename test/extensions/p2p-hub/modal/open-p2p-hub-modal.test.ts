import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import {
  buildHubModalFactory,
  openP2pHubModal,
  type P2pHubModalResult,
} from '../../../../src/extensions/p2p-hub/modal/open-p2p-hub-modal';
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

  test('creates a hub in a pushed text layer and refreshes the root list', async () => {
    const state = spawn('agent-a');
    const results: P2pHubModalResult[] = [];
    const factory = buildHubModalFactory(state, [], async () => registry.list());
    const dialog = factory(makeTui() as never, theme, keybindings, r => results.push(r), 'inline') as ModalDialog<P2pHubModalResult>;
    dialog.focused = true;

    dialog.handleInput('\r');
    for (const char of 'jkgq-hub') dialog.handleInput(char);
    dialog.handleInput('\r');
    await Bun.sleep(30);

    expect(results).toEqual([]);
    expect(state.getHubName()).toBe('jkgq-hub');
    const rendered = dialog.render(60).join('\n');
    expect(rendered).toContain('Current Hub: jkgq-hub (connected)');
    expect(rendered).toContain('jkgq-hub (connected)');
  });

  test('Esc cancels create and duplicate errors remain inline', async () => {
    const state = spawn('agent-a');
    const factory = buildHubModalFactory(state, []);
    const dialog = factory(makeTui() as never, theme, keybindings, () => undefined, 'inline') as ModalDialog<P2pHubModalResult>;

    dialog.handleInput('\r');
    dialog.handleInput('x');
    dialog.handleInput('\x1b');
    expect(state.isConnected()).toBe(false);
    expect(dialog.render(60).join('\n')).toContain('create new');

    const host = spawn('host-a');
    await host.createHub('duplicate');
    const entry = registry.read('duplicate');
    if (!entry) throw new Error('missing entry');
    const duplicateFactory = buildHubModalFactory(state, [entry]);
    const duplicateDialog = duplicateFactory(
      makeTui() as never,
      theme,
      keybindings,
      () => undefined,
      'inline',
    ) as ModalDialog<P2pHubModalResult>;
    duplicateDialog.handleInput('j');
    duplicateDialog.handleInput('\r');
    for (const char of 'duplicate') duplicateDialog.handleInput(char);
    duplicateDialog.handleInput('\r');
    await Bun.sleep(20);
    expect(duplicateDialog.render(60).join('\n')).toContain('already exists');
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
    // Cursor should now be on "create new" (3rd row); confirm pushes its layer.
    dialog.handleInput('\r');
    expect(results).toEqual([]);
    expect(dialog.render(60).join('\n')).toContain('Create New Hub');

    const dialog2 = factory(makeTui() as never, theme, keybindings, r => results.push(r), 'inline') as ModalDialog<P2pHubModalResult>;
    dialog2.handleInput('q');
    expect(results.at(-1)).toEqual({ action: 'close' });
  });

  test('selected styling moves independently from the connected marker', async () => {
    const state = spawn('agent-a');
    await state.createHub('team-a');
    const connected = registry.read('team-a');
    if (!connected) throw new Error('missing entry');
    const other = { name: 'team-b', port: 2, hostPid: process.pid, createdAt: new Date().toISOString() };
    const recordingTheme = {
      fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
      bold: (text: string) => text,
    } as Theme;
    const factory = buildHubModalFactory(state, [connected, other]);
    const dialog = factory(makeTui() as never, recordingTheme, keybindings, () => undefined, 'inline') as ModalDialog<P2pHubModalResult>;

    const first = dialog.render(80).join('\n');
    expect(first).toContain('[accent]> [/accent][accent]team-a[/accent][success] (connected)[/success]');
    dialog.handleInput('j');
    const second = dialog.render(80).join('\n');
    expect(second).toContain('  team-a[success] (connected)[/success]');
    expect(second).toContain('[accent]> [/accent][accent]team-b[/accent]');
  });

  test('forwards inline and overlay layouts to modal presentation', async () => {
    const state = spawn('agent-a');
    const options: unknown[] = [];
    const ctx = {
      ui: {
        custom: (_factory: unknown, value: unknown) => {
          options.push(value);
          return Promise.resolve({ action: 'close' });
        },
      },
    };

    await openP2pHubModal(ctx as never, state, registry, 'inline');
    await openP2pHubModal(ctx as never, state, registry, 'overlay');
    expect(options[0]).toBeUndefined();
    expect(options[1]).toMatchObject({ overlay: true, overlayOptions: { anchor: 'center' } });
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
