import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../src/config/config-loader';
import { activateP2pHub, registerP2pHub } from '../../../src/extensions/p2p-hub/p2p-hub.extension';
import { resetP2pHubService, resolveP2pHubService } from '../../../src/extensions/p2p-hub/p2p-hub-service';
import { P2pHubState, type P2pHubStateDeps } from '../../../src/extensions/p2p-hub/p2p-hub-state';
import { HubRegistry } from '../../../src/extensions/p2p-hub/registry.util';

type Handler = (event: unknown, ctx: ExtensionContext) => void;

function makePi() {
  const sessionStartHandlers: Handler[] = [];
  const sessionShutdownHandlers: Handler[] = [];
  const registerToolCalls: unknown[] = [];
  const registerCommandCalls: { name: string; options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> } }[] = [];
  const eventBusHandlers = new Map<string, (() => void)[]>();

  const pi = {
    on: (event: string, handler: Handler) => {
      if (event === 'session_start') sessionStartHandlers.push(handler);
      if (event === 'session_shutdown') sessionShutdownHandlers.push(handler);
    },
    registerTool: (tool: unknown) => {
      registerToolCalls.push(tool);
    },
    registerCommand: (name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => {
      registerCommandCalls.push({ name, options });
    },
    sendMessage: () => {},
    sendUserMessage: () => {},
    events: {
      on: (channel: string, handler: () => void) => {
        const list = eventBusHandlers.get(channel) ?? [];
        list.push(handler);
        eventBusHandlers.set(channel, list);
        return () => {};
      },
      emit: () => {},
    },
  } as unknown as ExtensionAPI;

  return { pi, sessionStartHandlers, sessionShutdownHandlers, registerToolCalls, registerCommandCalls, eventBusHandlers };
}

function makeCtx(cwd: string, opts: { notifyCalls?: { message: string; type?: string }[]; setWidgetCalls?: unknown[] } = {}): ExtensionContext {
  const notifyCalls = opts.notifyCalls ?? [];
  const setWidgetCalls = opts.setWidgetCalls ?? [];
  return {
    cwd,
    mode: 'tui',
    isProjectTrusted: () => true,
    isIdle: () => true,
    getContextUsage: () => undefined,
    model: { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' } as never,
    ui: {
      notify: (message: string, type?: string) => notifyCalls.push({ message, type }),
      setWidget: (...args: unknown[]) => setWidgetCalls.push(args),
      input: async () => undefined,
    },
  } as unknown as ExtensionContext;
}

function makeStateDeps(name: string, registry: HubRegistry): P2pHubStateDeps {
  return {
    registry,
    identity: { name, description: undefined, cwd: `/tmp/${name}` },
    getModelId: () => 'test-model',
    getContextSnapshot: () => undefined,
    isIdle: () => true,
    deliverBatch: () => {},
    deliverSteer: () => {},
    runRemotePrompt: () => {},
    notify: () => {},
    onChange: () => {},
  };
}

let configEnabled = false;
const config: ConfigProvider = {
  getP2pHub: () => ({ enabled: configEnabled, layout: 'inline' }),
  getTmuxPopup: () => ({ enabled: false, width: 50, height: 50, fileCommand: 'nvim' }),
};

function mockConfig(enabled: boolean) {
  configEnabled = enabled;
}

describe('registerP2pHub lazy activation', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = join(tmpdir(), `p2p-ext-${Math.random().toString(36).slice(2)}`);
    configEnabled = false;
  });

  afterEach(() => {
    resetP2pHubService();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('registers nothing observable while disabled before activation', () => {
    mockConfig(false);
    const { pi, registerToolCalls, registerCommandCalls, eventBusHandlers, sessionStartHandlers } = makePi();

    registerP2pHub(pi, { config });
    expect(sessionStartHandlers).toHaveLength(1); // bootstrap listener only

    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    expect(registerToolCalls).toHaveLength(0);
    expect(registerCommandCalls).toHaveLength(0);
    expect(eventBusHandlers.size).toBe(0);
  });

  it('activates exactly once, on the first enabled session', () => {
    const { pi, registerToolCalls, registerCommandCalls, sessionStartHandlers } = makePi();
    registerP2pHub(pi, { config });

    mockConfig(false);
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    expect(registerToolCalls).toHaveLength(0);

    mockConfig(true);
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    expect(registerToolCalls).toHaveLength(3); // p2p_send, p2p_ask, p2p_ls
    expect(registerCommandCalls).toHaveLength(1);
    expect(registerCommandCalls[0]?.name).toBe('p2p-hub');

    // A later enabled session must not re-activate (no double registration).
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    expect(registerToolCalls).toHaveLength(3);
  });

  it('preserves one hosted service across reload and restores it through the replacement runtime', async () => {
    mockConfig(true);
    const oldRuntime = makePi();
    const oldWidgetCalls: unknown[] = [];
    const oldCtx = makeCtx(cwd, { setWidgetCalls: oldWidgetCalls });
    const oldActivation = activateP2pHub(oldRuntime.pi, oldCtx, { config });
    await oldActivation.state.createHub('reload-hub');
    const entryBefore = new (await import('../../../src/extensions/p2p-hub/registry.util')).HubRegistry().read('reload-hub');

    oldRuntime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason: 'reload' }, oldCtx);
    expect(oldActivation.state.isConnected()).toBe(true);
    expect(oldActivation.state.isRuntimeAttached()).toBe(false);

    const newRuntime = makePi();
    const newWidgetCalls: unknown[] = [];
    const newCtx = makeCtx(cwd, { setWidgetCalls: newWidgetCalls });
    const replacement = activateP2pHub(newRuntime.pi, newCtx, { config });
    const entryAfter = new (await import('../../../src/extensions/p2p-hub/registry.util')).HubRegistry().read('reload-hub');

    expect(replacement.state).toBe(oldActivation.state);
    expect(resolveP2pHubService()).toBe(oldActivation.state);
    expect(replacement.state.getConnectionType()).toBe('host');
    expect(entryAfter?.port).toBe(entryBefore?.port);
    expect(oldWidgetCalls.some(call => Array.isArray(call) && call[1] === undefined)).toBe(true);
    expect(newWidgetCalls.some(call => Array.isArray(call) && call[1] !== undefined)).toBe(true);
  });

  it('preserves one client membership across new, resume, and fork runtime transitions', async () => {
    mockConfig(true);
    const registry = new HubRegistry();
    const host = new P2pHubState(makeStateDeps('transition-host', registry));
    await host.createHub('transition-hub');
    const entry = registry.read('transition-hub');
    if (!entry) throw new Error('missing transition hub');

    let runtime = makePi();
    let ctx = makeCtx(cwd);
    let activation = activateP2pHub(runtime.pi, ctx, { config });
    await activation.state.joinHub(entry);
    const assignedName = activation.state.getSelfName();

    for (const reason of ['new', 'resume', 'fork']) {
      runtime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason }, ctx);
      const replacementRuntime = makePi();
      const replacementCtx = makeCtx(cwd);
      const replacement = activateP2pHub(replacementRuntime.pi, replacementCtx, { config });

      expect(replacement.state).toBe(activation.state);
      expect(replacement.state.getConnectionType()).toBe('client');
      expect(replacement.state.getSelfName()).toBe(assignedName);
      expect(host.getRoster().filter(member => member.identity.name === assignedName)).toHaveLength(1);

      runtime = replacementRuntime;
      ctx = replacementCtx;
      activation = replacement;
    }

    host.dispose();
  });

  it('a disabled replacement deliberately disposes a preserved service', async () => {
    mockConfig(true);
    const oldRuntime = makePi();
    const oldCtx = makeCtx(cwd);
    const activation = activateP2pHub(oldRuntime.pi, oldCtx, { config });
    await activation.state.createHub('disabled-replacement-hub');
    oldRuntime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason: 'reload' }, oldCtx);

    mockConfig(false);
    const replacement = makePi();
    const widgetCalls: unknown[] = [];
    registerP2pHub(replacement.pi, { config });
    replacement.sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd, { setWidgetCalls: widgetCalls }));

    expect(activation.state.isConnected()).toBe(false);
    expect(resolveP2pHubService()).toBeUndefined();
    expect(replacement.registerToolCalls).toHaveLength(0);
    expect(widgetCalls.some(call => Array.isArray(call) && call[1] === undefined)).toBe(true);
  });

  it('final quit disposes the process service immediately', async () => {
    mockConfig(true);
    const runtime = makePi();
    const ctx = makeCtx(cwd);
    const activation = activateP2pHub(runtime.pi, ctx, { config });
    await activation.state.createHub('quit-hub');

    runtime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason: 'quit' }, ctx);

    expect(activation.state.isConnected()).toBe(false);
    expect(resolveP2pHubService()).toBeUndefined();
  });

  it('a disabled replacement session disposes a live hub and clears the widget', async () => {
    mockConfig(true);
    const { pi, sessionStartHandlers } = makePi();
    registerP2pHub(pi, { config });
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    const state = resolveP2pHubService();
    if (!state) throw new Error('missing p2p service');

    await state.createHub('ext-test-hub');
    expect(state.isConnected()).toBe(true);
    expect(state.getRoster()[0]?.identity.model).toBe('gpt-5.6-sol');
    expect(state.getRoster()[0]?.identity.model).not.toBe('GPT-5.6 Sol');

    mockConfig(false);
    const setWidgetCalls: unknown[] = [];
    const disabledCtx = makeCtx(cwd, { setWidgetCalls });
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, disabledCtx);

    expect(state.isConnected()).toBe(false);
    expect(setWidgetCalls.some(call => Array.isArray(call) && call[1] === undefined)).toBe(true);
  });
});
