import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STATUS_WIDGET_KEY } from '../../../../src/extensions/p2p-hub/constants';
import { P2pHubState, type P2pHubStateDeps } from '../../../../src/extensions/p2p-hub/p2p-hub-state';
import { HubRegistry } from '../../../../src/extensions/p2p-hub/registry.util';
import { PathUtil } from '../../../../src/utils/path.util';
import { P2PWidgetController } from '../../../../src/extensions/p2p-hub/widget/status-widget-controller';

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

function makeUiSpy() {
  const calls: { key: string; content: unknown; options: unknown }[] = [];
  return {
    calls,
    ui: {
      setWidget: (key: string, content: unknown, options: unknown) => {
        calls.push({ key, content, options });
      },
      setFooter: () => {
        throw new Error('setFooter must never be called by the status widget controller');
      },
    } as never,
  };
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

  function spawn(name: string): P2pHubState {
    const state = new P2pHubState(makeDeps({ name, registry }));
    created.push(state);
    return state;
  }

  test('hides the widget when disconnected', () => {
    const state = spawn('agent-a');
    const { ui, calls } = makeUiSpy();
    P2PWidgetController.renderWidget(ui, state);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ key: STATUS_WIDGET_KEY, content: undefined, options: { placement: 'belowEditor' } });
  });

  test('shows a rendered box while connected, placed belowEditor', async () => {
    const state = spawn('agent-a');
    await state.createHub('widget-hub');
    const { ui, calls } = makeUiSpy();
    P2PWidgetController.renderWidget(ui, state);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.options).toEqual({ placement: 'belowEditor' });
    expect(Array.isArray(call?.content)).toBe(true);
    expect((call?.content as string[]).some(line => line.includes('agent-a'))).toBe(true);
  });

  test('clearWidget unconditionally removes the widget without touching the footer', () => {
    const { ui, calls } = makeUiSpy();
    P2PWidgetController.clearWidget(ui);
    expect(calls).toEqual([{ key: STATUS_WIDGET_KEY, content: undefined, options: { placement: 'belowEditor' } }]);
  });
});
