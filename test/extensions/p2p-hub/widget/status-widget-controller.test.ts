import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dye } from '@0xkahi/cli-dye';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { STATUS_WIDGET_KEY } from '../../../../src/extensions/p2p-hub/constants';
import { P2pHubState, type P2pHubStateDeps } from '../../../../src/extensions/p2p-hub/p2p-hub-state';
import { HubRegistry } from '../../../../src/extensions/p2p-hub/registry.util';
import { P2PWidgetController } from '../../../../src/extensions/p2p-hub/widget/status-widget-controller';
import { PathUtil } from '../../../../src/utils/path.util';

const theme = {
  fg: (_color: string, text: string) => `\x1b[32m${text}\x1b[0m`,
  bold: (text: string) => text,
} as Theme;

function makeDeps(overrides: Partial<P2pHubStateDeps> & { name: string; registry: HubRegistry }): P2pHubStateDeps {
  return {
    identity: { name: overrides.name, description: undefined, cwd: `/tmp/${overrides.name}` },
    getModelId: () => 'gpt-5.6-sol',
    getContextSnapshot: () => ({ tokens: 17_000, contextWindow: 100_000 }),
    isIdle: () => true,
    deliverBatch: () => {},
    deliverSteer: () => {},
    runRemotePrompt: () => {},
    notify: () => {},
    onChange: () => {},
    ...overrides,
  };
}

function makeUiSpy() {
  const calls: { key: string; content: unknown; options: unknown }[] = [];
  return {
    calls,
    ui: {
      setWidget: (key: string, content: unknown, options: unknown) => calls.push({ key, content, options }),
      setFooter: () => {
        throw new Error('setFooter must never be called by the status widget controller');
      },
    } as never,
  };
}

function renderCall(call: { content: unknown }, width: number): string[] {
  expect(typeof call.content).toBe('function');
  const component = (call.content as (tui: unknown, theme: Theme) => { render: (width: number) => string[]; invalidate: () => void })({}, theme);
  component.invalidate();
  return component.render(width);
}

function plain(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('status widget controller', () => {
  let dir: string;
  let registry: HubRegistry;
  const created: P2pHubState[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-widget-'));
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

  test('hides and clears the stable below-editor widget when disconnected', () => {
    const state = spawn('agent-a');
    const { ui, calls } = makeUiSpy();
    P2PWidgetController.renderWidget(ui, state);
    P2PWidgetController.clearWidget(ui);
    expect(calls).toEqual([
      { key: STATUS_WIDGET_KEY, content: undefined, options: { placement: 'belowEditor' } },
      { key: STATUS_WIDGET_KEY, content: undefined, options: { placement: 'belowEditor' } },
    ]);
  });

  test('registers a stateless component factory and renders aligned open rows at normal width', async () => {
    const host = spawn('agent-a');
    await host.createHub('widget-hub');
    const entry = registry.read('widget-hub');
    if (!entry) throw new Error('missing hub');
    const client = spawn('longer-agent');
    await client.joinHub(entry);
    await Bun.sleep(20);

    const { ui, calls } = makeUiSpy();
    P2PWidgetController.renderWidget(ui, host);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.key).toBe(STATUS_WIDGET_KEY);
    expect(calls[0]?.options).toEqual({ placement: 'belowEditor' });

    const lines = renderCall(calls[0]!, 80);
    expect(lines[0]).toContain('widget-hub');
    expect(lines.at(-1)).toContain('2 members');
    expect(lines.every(line => visibleWidth(line) <= 80)).toBe(true);
    expect(visibleWidth(lines[0] ?? '')).toBe(80);
    expect(visibleWidth(lines.at(-1) ?? '')).toBe(80);
    expect(lines.slice(1, -1).every(line => !plain(line).includes('┃'))).toBe(true);
    expect(lines.join('\n')).toContain('gpt-5.6-sol');

    const rows = lines.slice(1, -1).map(plain);
    expect(rows[0]?.indexOf('gpt-5.6-sol')).toBe(rows[1]?.indexOf('gpt-5.6-sol'));
    expect(rows[0]?.indexOf('[')).toBe(rows[1]?.indexOf('['));
  });

  test('expands only borders on a wide terminal and uses a singular member label', async () => {
    const state = spawn('solo');
    await state.createHub('wide-hub');
    const { ui, calls } = makeUiSpy();
    P2PWidgetController.renderWidget(ui, state);

    const normal = renderCall(calls[0]!, 80);
    const wide = renderCall(calls[0]!, 180);
    expect(visibleWidth(wide[0] ?? '')).toBe(180);
    expect(visibleWidth(wide.at(-1) ?? '')).toBe(180);
    expect(wide.at(-1)).toContain('1 member ');
    expect(plain(wide[1] ?? '').trimEnd()).toBe(plain(normal[1] ?? '').trimEnd());
  });

  test('degrades narrow layouts without overflow or negative-width errors', async () => {
    const state = spawn('agent-name-that-is-unusually-long', {
      getModelId: () => 'provider/model-id-that-is-also-unusually-long',
    });
    await state.createHub('hub-with-an-unusually-long-title');
    const { ui, calls } = makeUiSpy();
    P2PWidgetController.renderWidget(ui, state);

    for (const width of [40, 24, 12, 5, 2, 1, 0, -10]) {
      const lines = renderCall(calls[0]!, width);
      expect(lines.every(line => visibleWidth(line) <= Math.max(0, width))).toBe(true);
    }
    const narrow = plain(renderCall(calls[0]!, 24)[1] ?? '');
    expect(narrow).toContain('●');
    expect(narrow).toContain('17%');
  });

  test('handles Unicode names, ANSI styling, absent values, and factory replacement after roster changes', async () => {
    const { ui, calls } = makeUiSpy();
    const host = spawn('界界-agent', {
      getModelId: () => undefined,
      getContextSnapshot: () => undefined,
      onChange: () => P2PWidgetController.renderWidget(ui, host),
    });
    await host.createHub('unicode-hub');
    const firstFactory = calls.at(-1)?.content;
    expect(typeof firstFactory).toBe('function');

    const entry = registry.read('unicode-hub');
    if (!entry) throw new Error('missing hub');
    const client = spawn('client-é');
    await client.joinHub(entry);
    await Bun.sleep(20);
    expect(calls.at(-1)?.content).not.toBe(firstFactory);
    const lines = renderCall(calls.at(-1)!, 36);
    expect(lines.every(line => visibleWidth(line) <= 36)).toBe(true);
    if (dye.enabled) expect(lines.join('\n')).toContain('\x1b[');
    else expect(lines.join('\n')).not.toContain('\x1b[');

    host.disconnect('manual');
    expect(calls.at(-1)).toEqual({ key: STATUS_WIDGET_KEY, content: undefined, options: { placement: 'belowEditor' } });
  });
});
