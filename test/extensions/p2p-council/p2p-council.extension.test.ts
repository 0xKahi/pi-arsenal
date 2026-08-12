import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../src/config/config-loader';
import { activateP2pCouncil, registerP2pCouncil } from '../../../src/extensions/p2p-council/p2p-council.extension';
import { resetP2pCouncilService, resolveP2pCouncilService } from '../../../src/extensions/p2p-council/p2p-council-service';
import { P2pCouncilState, type P2pCouncilStateDeps } from '../../../src/extensions/p2p-council/p2p-council-state';
import { CouncilRegistry } from '../../../src/extensions/p2p-council/registry.util';

type Handler = (event: unknown, ctx: ExtensionContext) => void;

function makePi(initialActiveTools: string[] = ['read', 'bash']) {
  const sessionStartHandlers: Handler[] = [];
  const sessionShutdownHandlers: Handler[] = [];
  const handlersByEvent = new Map<string, Handler[]>();
  const registerToolCalls: unknown[] = [];
  const registerMessageRendererCalls: { customType: string; renderer: unknown }[] = [];
  const registerCommandCalls: { name: string; options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> } }[] = [];
  const sendMessageCalls: { message: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
  const eventBusHandlers = new Map<string, (() => void)[]>();

  let activeTools: string[] = [...initialActiveTools];

  const pi = {
    getActiveTools: () => [...activeTools],
    setActiveTools: (names: string[]) => {
      activeTools = [...names];
    },
    on: (event: string, handler: Handler) => {
      const handlers = handlersByEvent.get(event) ?? [];
      handlers.push(handler);
      handlersByEvent.set(event, handlers);
      if (event === 'session_start') sessionStartHandlers.push(handler);
      if (event === 'session_shutdown') sessionShutdownHandlers.push(handler);
    },
    registerTool: (tool: unknown) => {
      registerToolCalls.push(tool);
    },
    registerCommand: (name: string, options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => {
      registerCommandCalls.push({ name, options });
    },
    registerMessageRenderer: (customType: string, renderer: unknown) => {
      registerMessageRendererCalls.push({ customType, renderer });
    },
    sendMessage: (message: Record<string, unknown>, options?: Record<string, unknown>) => {
      sendMessageCalls.push({ message, options });
    },
    sendUserMessage: () => {
      throw new Error('remote prompts must use custom p2p messages');
    },
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

  return {
    pi,
    getActiveTools: () => [...activeTools],
    emitSessionStart: (ctx: ExtensionContext, reason = 'startup') => {
      for (const handler of sessionStartHandlers) handler({ type: 'session_start', reason }, ctx);
    },
    sessionStartHandlers,
    sessionShutdownHandlers,
    handlersByEvent,
    registerToolCalls,
    registerMessageRendererCalls,
    registerCommandCalls,
    sendMessageCalls,
    eventBusHandlers,
  };
}

function makeCtx(
  cwd: string,
  opts: {
    notifyCalls?: { message: string; type?: string }[];
    setWidgetCalls?: unknown[];
    custom?: (...args: unknown[]) => Promise<unknown>;
  } = {},
): ExtensionContext {
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
      custom: opts.custom,
    },
  } as unknown as ExtensionContext;
}

function makeStateDeps(name: string, registry: CouncilRegistry): P2pCouncilStateDeps {
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
  getP2pCouncil: () => ({ enabled: configEnabled, layout: 'inline' }),
  getTmuxPopup: () => ({ enabled: false, width: 50, height: 50, fileCommand: 'nvim' }),
};

function mockConfig(enabled: boolean) {
  configEnabled = enabled;
}

describe('registerP2pCouncil lazy activation', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = join(tmpdir(), `p2p-ext-${Math.random().toString(36).slice(2)}`);
    configEnabled = false;
  });

  afterEach(() => {
    resetP2pCouncilService();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('deactivates its tools while disabled, keeping renderers for restored history', () => {
    mockConfig(false);
    const { pi, registerToolCalls, registerMessageRendererCalls, registerCommandCalls, eventBusHandlers, sessionStartHandlers, getActiveTools } =
      makePi();

    registerP2pCouncil(pi, { config });
    expect(sessionStartHandlers).toHaveLength(1); // bootstrap listener only

    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    // Definitions and renderers stay registered so restored history renders correctly...
    expect(registerToolCalls).toHaveLength(3);
    expect(registerMessageRendererCalls).toHaveLength(1);
    // ...but the model never sees the tools, and nothing is activated.
    expect(getActiveTools()).toEqual(['read', 'bash']);
    expect(registerCommandCalls).toHaveLength(0);
    expect(eventBusHandlers.size).toBe(0);
    expect(resolveP2pCouncilService()).toBeUndefined();
  });

  it('removes Pi-preactivated p2p tools on an enabled session without a connection', () => {
    mockConfig(true);
    const runtime = makePi(['read', 'bash', 'p2p_send', 'p2p_ask', 'p2p_ls']);
    registerP2pCouncil(runtime.pi, { config });

    runtime.emitSessionStart(makeCtx(cwd));

    expect(runtime.getActiveTools()).toEqual(['read', 'bash']);
    expect(resolveP2pCouncilService()?.isConnected()).toBe(false);
  });

  it('activates p2p tools when session_start recovers a connected process service', async () => {
    mockConfig(true);
    const oldRuntime = makePi();
    const oldCtx = makeCtx(cwd);
    const oldActivation = activateP2pCouncil(oldRuntime.pi, oldCtx, { config });
    await oldActivation.state.createCouncil('reconcile-connected-council');
    oldRuntime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason: 'reload' }, oldCtx);

    const replacement = makePi(['read', 'bash', 'p2p_send']);
    registerP2pCouncil(replacement.pi, { config });
    replacement.emitSessionStart(makeCtx(cwd), 'reload');

    expect(replacement.getActiveTools()).toEqual(['read', 'bash', 'p2p_send', 'p2p_ask', 'p2p_ls']);
  });

  it('deactivates Pi-preactivated tools while disabled even if a connected service exists', async () => {
    mockConfig(true);
    const oldRuntime = makePi();
    const activation = activateP2pCouncil(oldRuntime.pi, makeCtx(cwd), { config });
    await activation.state.createCouncil('disabled-connected-council');

    mockConfig(false);
    const replacement = makePi(['read', 'bash', 'p2p_send', 'p2p_ask', 'p2p_ls']);
    registerP2pCouncil(replacement.pi, { config });
    replacement.emitSessionStart(makeCtx(cwd));

    expect(replacement.getActiveTools()).toEqual(['read', 'bash']);
    expect(resolveP2pCouncilService()).toBeUndefined();
  });

  it('registers render surfaces without reading config, which loads only at session_start', () => {
    // ConfigLoader defaults to disabled until initializeConfig runs during session_start,
    // so gating registration on `enabled` at load time would register nothing at all.
    let configReads = 0;
    const countingConfig = {
      getP2pCouncil: () => {
        configReads++;
        return { enabled: false, layout: 'inline' as const };
      },
    } as unknown as ConfigProvider;
    const { pi, registerToolCalls, registerMessageRendererCalls } = makePi();

    registerP2pCouncil(pi, { config: countingConfig });
    expect(configReads).toBe(0);
    expect(registerToolCalls).toHaveLength(3);
    expect(registerMessageRendererCalls).toHaveLength(1);
  });

  it('registers render surfaces at load so resumed sessions keep custom rendering', () => {
    mockConfig(true);
    const { pi, registerToolCalls, registerMessageRendererCalls, registerCommandCalls, sessionStartHandlers, getActiveTools } = makePi();

    // Pi captures renderers per component when it replays history, so tools and the
    // message renderer must already exist once registerP2pCouncil returns.
    registerP2pCouncil(pi, { config });
    expect(registerToolCalls).toHaveLength(3); // p2p_send, p2p_ask, p2p_ls
    expect(registerMessageRendererCalls).toEqual([expect.objectContaining({ customType: 'p2p_council' })]);

    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'resume' }, makeCtx(cwd));
    expect(registerCommandCalls).toHaveLength(1);
    expect(registerCommandCalls[0]?.name).toBe('p2p-council');
    expect(registerCommandCalls.some(call => call.name === 'p2p-hub')).toBe(false);
    expect(getActiveTools()).toEqual(['read', 'bash']);

    // A later session must not re-activate state or re-register surfaces.
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    expect(registerToolCalls).toHaveLength(3);
    expect(registerCommandCalls).toHaveLength(1);
  });

  it('activates on modal create and deactivates on manual disconnect', async () => {
    mockConfig(true);
    const runtime = makePi();
    let dialog: { handleInput(data: string): void } | undefined;
    const tui = { terminal: { rows: 24 }, requestRender: () => undefined };
    const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
    const keybindings = {
      matches: (data: string, action: string) =>
        ({ enter: 'tui.select.confirm', esc: 'tui.select.cancel' })[data as 'enter' | 'esc'] === action,
    };
    const ctx = makeCtx(cwd, {
      custom: factory =>
        new Promise(resolve => {
          dialog = (factory as (tui: unknown, theme: unknown, keybindings: unknown, done: (result: unknown) => void) => typeof dialog)(
            tui,
            theme,
            keybindings,
            resolve,
          );
        }),
    });
    activateP2pCouncil(runtime.pi, ctx, { config });
    const command = runtime.registerCommandCalls.find(call => call.name === 'p2p-council');
    if (!command) throw new Error('missing p2p-council command');

    const commandPromise = command.options.handler('', ctx);
    await Bun.sleep(20);
    if (!dialog) throw new Error('modal did not open');
    dialog.handleInput('\r');
    for (const char of 'transition-council') dialog.handleInput(char);
    dialog.handleInput('\r');
    await Bun.sleep(30);
    // Council name advances to the member-name step; accept the prefilled default.
    dialog.handleInput('\r');
    await Bun.sleep(30);
    expect(runtime.getActiveTools()).toEqual(['read', 'bash', 'p2p_send', 'p2p_ask', 'p2p_ls']);
    await commandPromise;

    // A successful create closes the modal. Reopen it before navigating into the
    // newly created council's detail layer and disconnecting.
    const disconnectPromise = command.options.handler('', ctx);
    await Bun.sleep(20);
    if (!dialog) throw new Error('modal did not reopen');
    dialog.handleInput('\r');
    await Bun.sleep(20);
    dialog.handleInput('\r');
    await Bun.sleep(30);
    expect(runtime.getActiveTools()).toEqual(['read', 'bash']);
    await disconnectPromise;
  });

  it('toggles tools without duplicate entries across repeated modal join/disconnect cycles', async () => {
    mockConfig(true);
    const registry = new CouncilRegistry();
    const host = new P2pCouncilState(makeStateDeps('cycle-host', registry));
    await host.createCouncil('cycle-council');

    const runtime = makePi();
    let dialog: { handleInput(data: string): void } | undefined;
    const tui = { terminal: { rows: 24 }, requestRender: () => undefined };
    const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
    const keybindings = { matches: (data: string, action: string) => ({ enter: 'tui.select.confirm' })[data as 'enter'] === action };
    const ctx = makeCtx(cwd, {
      custom: factory =>
        new Promise(resolve => {
          dialog = (factory as (tui: unknown, theme: unknown, keybindings: unknown, done: (result: unknown) => void) => typeof dialog)(
            tui,
            theme,
            keybindings,
            resolve,
          );
        }),
    });
    activateP2pCouncil(runtime.pi, ctx, { config });
    const command = runtime.registerCommandCalls.find(call => call.name === 'p2p-council');
    if (!command) throw new Error('missing p2p-council command');

    const commandPromise = command.options.handler('', ctx);
    await Bun.sleep(20);
    if (!dialog) throw new Error('modal did not open');
    dialog.handleInput('\r');
    await Bun.sleep(20);
    for (let cycle = 0; cycle < 2; cycle++) {
      // Connect pushes the member-name step; accept the prefilled default to join.
      dialog.handleInput('\r');
      await Bun.sleep(20);
      dialog.handleInput('\r');
      await Bun.sleep(30);
      expect(runtime.getActiveTools()).toEqual(['read', 'bash', 'p2p_send', 'p2p_ask', 'p2p_ls']);
      // Disconnect is immediate, with no member-name step.
      dialog.handleInput('\r');
      await Bun.sleep(30);
      expect(runtime.getActiveTools()).toEqual(['read', 'bash']);
    }

    dialog.handleInput('q');
    dialog.handleInput('q');
    await commandPromise;
    host.dispose();
  });

  it('keeps tools active during automatic host-loss promotion churn', async () => {
    mockConfig(true);
    const registry = new CouncilRegistry();
    const host = new P2pCouncilState(makeStateDeps('promotion-host', registry));
    await host.createCouncil('promotion-council');
    const entry = registry.read('promotion-council');
    if (!entry) throw new Error('missing promotion council');

    const runtime = makePi();
    const activation = activateP2pCouncil(runtime.pi, makeCtx(cwd), { config });
    await activation.state.joinCouncil(entry);
    runtime.emitSessionStart(makeCtx(cwd));
    expect(runtime.getActiveTools()).toContain('p2p_send');

    host.dispose();
    for (let i = 0; i < 20 && activation.state.getConnectionType() !== 'disconnected'; i++) await Bun.sleep(10);
    expect(activation.state.getConnectionType()).toBe('disconnected');
    expect(runtime.getActiveTools()).toEqual(['read', 'bash', 'p2p_send', 'p2p_ask', 'p2p_ls']);
  });

  it('delivers attributed custom steers, triggering batches, and remote prompts with correct turn behavior', async () => {
    mockConfig(true);
    const runtime = makePi();
    const activation = activateP2pCouncil(runtime.pi, makeCtx(cwd), { config });
    const councilName = `presentation-${Math.random().toString(36).slice(2)}`;
    await activation.state.createCouncil(councilName);
    const registry = new CouncilRegistry();
    const entry = registry.read(councilName);
    if (!entry) throw new Error('missing presentation council');
    const client = new P2pCouncilState(makeStateDeps('remote-peer', registry));

    try {
      await client.joinCouncil(entry);
      await Bun.sleep(20);

      client.sendChat(activation.state.getSelfName(), 'steer content', false);
      await Bun.sleep(20);
      expect(runtime.sendMessageCalls.at(-1)).toEqual({
        message: {
          customType: 'p2p_council',
          content: '[Peer message from "remote-peer"]\n\nsteer content',
          display: true,
          details: {
            kind: 'steer',
            delivery: 'steer',
            items: [{ from: 'remote-peer', content: 'steer content' }],
          },
        },
        options: { triggerTurn: false, deliverAs: 'steer' },
      });

      client.sendChat(activation.state.getSelfName(), 'turn content', true);
      await Bun.sleep(300);
      expect(runtime.sendMessageCalls.at(-1)).toEqual({
        message: {
          customType: 'p2p_council',
          content: '[Peer batch: 1 message]\n\n[Peer message from "remote-peer"]\n\nturn content',
          display: true,
          details: {
            kind: 'batch',
            delivery: 'trigger_when_idle',
            items: [{ from: 'remote-peer', content: 'turn content' }],
          },
        },
        options: { triggerTurn: true },
      });

      const replyPromise = client.askPrompt(activation.state.getSelfName(), 'remote work');
      await Bun.sleep(20);
      expect(runtime.sendMessageCalls.at(-1)).toEqual({
        message: {
          customType: 'p2p_council',
          content:
            '[Remote prompt from "remote-peer" — your final reply is returned automatically; do not use p2p_send to answer]\n\nremote work',
          display: true,
          details: {
            kind: 'remote_prompt',
            delivery: 'remote_prompt',
            items: [{ from: 'remote-peer', content: 'remote work' }],
          },
        },
        options: { triggerTurn: true },
      });
      expect(
        runtime.sendMessageCalls.filter(call => call.message.details && (call.message.details as { kind?: string }).kind === 'remote_prompt'),
      ).toHaveLength(1);
      runtime.handlersByEvent.get('agent_end')?.[0]?.(
        {
          messages: [
            { role: 'assistant', content: [{ type: 'text', text: 'draft' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'final response' }] },
          ],
        },
        makeCtx(cwd),
      );
      expect(await replyPromise).toMatchObject({ response: 'final response', from: activation.state.getSelfName() });

      activation.state.setAgentRunning(true);
      const countBeforeBusyAsk = runtime.sendMessageCalls.length;
      expect(await client.askPrompt(activation.state.getSelfName(), 'should not inject')).toMatchObject({ error: 'Terminal is busy' });
      expect(runtime.sendMessageCalls).toHaveLength(countBeforeBusyAsk);
    } finally {
      client.dispose();
      activation.state.dispose();
    }
  });

  it('preserves one hosted service across reload and restores it through the replacement runtime', async () => {
    mockConfig(true);
    const oldRuntime = makePi();
    const oldWidgetCalls: unknown[] = [];
    const oldCtx = makeCtx(cwd, { setWidgetCalls: oldWidgetCalls });
    const oldActivation = activateP2pCouncil(oldRuntime.pi, oldCtx, { config });
    await oldActivation.state.createCouncil('reload-council');
    const entryBefore = new (await import('../../../src/extensions/p2p-council/registry.util')).CouncilRegistry().read('reload-council');

    oldRuntime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason: 'reload' }, oldCtx);
    expect(oldActivation.state.isConnected()).toBe(true);
    expect(oldActivation.state.isRuntimeAttached()).toBe(false);

    const newRuntime = makePi();
    const newWidgetCalls: unknown[] = [];
    const newCtx = makeCtx(cwd, { setWidgetCalls: newWidgetCalls });
    const replacement = activateP2pCouncil(newRuntime.pi, newCtx, { config });
    const entryAfter = new (await import('../../../src/extensions/p2p-council/registry.util')).CouncilRegistry().read('reload-council');

    expect(replacement.state).toBe(oldActivation.state);
    expect(resolveP2pCouncilService()).toBe(oldActivation.state);
    expect(replacement.state.getConnectionType()).toBe('host');
    expect(entryAfter?.port).toBe(entryBefore?.port);
    expect(oldWidgetCalls.some(call => Array.isArray(call) && call[1] === undefined)).toBe(true);
    expect(newWidgetCalls.some(call => Array.isArray(call) && call[1] !== undefined)).toBe(true);
  });

  it('preserves one client membership across new, resume, and fork runtime transitions', async () => {
    mockConfig(true);
    const registry = new CouncilRegistry();
    const host = new P2pCouncilState(makeStateDeps('transition-host', registry));
    await host.createCouncil('transition-council');
    const entry = registry.read('transition-council');
    if (!entry) throw new Error('missing transition council');

    let runtime = makePi();
    let ctx = makeCtx(cwd);
    let activation = activateP2pCouncil(runtime.pi, ctx, { config });
    await activation.state.joinCouncil(entry);
    const assignedName = activation.state.getSelfName();

    for (const reason of ['new', 'resume', 'fork']) {
      runtime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason }, ctx);
      const replacementRuntime = makePi();
      const replacementCtx = makeCtx(cwd);
      const replacement = activateP2pCouncil(replacementRuntime.pi, replacementCtx, { config });

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
    const activation = activateP2pCouncil(oldRuntime.pi, oldCtx, { config });
    await activation.state.createCouncil('disabled-replacement-council');
    oldRuntime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason: 'reload' }, oldCtx);

    mockConfig(false);
    const replacement = makePi();
    const widgetCalls: unknown[] = [];
    registerP2pCouncil(replacement.pi, { config });
    replacement.sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd, { setWidgetCalls: widgetCalls }));

    expect(activation.state.isConnected()).toBe(false);
    expect(resolveP2pCouncilService()).toBeUndefined();
    // Tools are registered at load regardless, but the disabled session never activates them.
    expect(replacement.registerCommandCalls).toHaveLength(0);
    expect(widgetCalls.some(call => Array.isArray(call) && call[1] === undefined)).toBe(true);
  });

  it('final quit disposes the process service immediately', async () => {
    mockConfig(true);
    const runtime = makePi();
    const ctx = makeCtx(cwd);
    const activation = activateP2pCouncil(runtime.pi, ctx, { config });
    await activation.state.createCouncil('quit-council');

    runtime.sessionShutdownHandlers[0]?.({ type: 'session_shutdown', reason: 'quit' }, ctx);

    expect(activation.state.isConnected()).toBe(false);
    expect(resolveP2pCouncilService()).toBeUndefined();
  });

  it('a disabled replacement session disposes a live council and clears the widget', async () => {
    mockConfig(true);
    const { pi, sessionStartHandlers } = makePi();
    registerP2pCouncil(pi, { config });
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    const state = resolveP2pCouncilService();
    if (!state) throw new Error('missing p2p service');

    await state.createCouncil('ext-test-council');
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
