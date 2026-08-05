import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigLoadResult } from '../../../src/config/config-loader';
import { activateP2pHub, registerP2pHub } from '../../../src/extensions/p2p-hub/p2p-hub.extension';

type Handler = (event: unknown, ctx: ExtensionContext) => void;

function makePi() {
  const sessionStartHandlers: Handler[] = [];
  const registerToolCalls: unknown[] = [];
  const registerCommandCalls: { name: string; options: { handler: (args: string, ctx: ExtensionContext) => Promise<void> } }[] = [];
  const eventBusHandlers = new Map<string, (() => void)[]>();

  const pi = {
    on: (event: string, handler: Handler) => {
      if (event === 'session_start') sessionStartHandlers.push(handler);
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

  return { pi, sessionStartHandlers, registerToolCalls, registerCommandCalls, eventBusHandlers };
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
    model: undefined,
    ui: {
      notify: (message: string, type?: string) => notifyCalls.push({ message, type }),
      setWidget: (...args: unknown[]) => setWidgetCalls.push(args),
      input: async () => undefined,
    },
  } as unknown as ExtensionContext;
}

function mockConfig(enabled: boolean) {
  mock.module('../../../src/config/config-loader', () => ({
    ConfigLoader: {
      load: (): ConfigLoadResult => ({ success: true, config: { tmux_popup: { enabled: false }, p2p_hub: { enabled } } as never }),
    },
  }));
}

describe('registerP2pHub lazy activation', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = join(tmpdir(), `p2p-ext-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    mock.restore();
  });

  it('registers nothing observable while disabled before activation', () => {
    mockConfig(false);
    const { pi, registerToolCalls, registerCommandCalls, eventBusHandlers, sessionStartHandlers } = makePi();

    registerP2pHub(pi);
    expect(sessionStartHandlers).toHaveLength(1); // bootstrap listener only

    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, makeCtx(cwd));
    expect(registerToolCalls).toHaveLength(0);
    expect(registerCommandCalls).toHaveLength(0);
    expect(eventBusHandlers.size).toBe(0);
  });

  it('activates exactly once, on the first enabled session', () => {
    const { pi, registerToolCalls, registerCommandCalls, sessionStartHandlers } = makePi();
    registerP2pHub(pi);

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

  it('disabled command handler shows a notice and never opens the modal', async () => {
    mockConfig(false);
    const { pi, registerCommandCalls } = makePi();
    activateP2pHub(pi, makeCtx(cwd));

    const notifyCalls: { message: string; type?: string }[] = [];
    const ctx = makeCtx(cwd, { notifyCalls });
    await registerCommandCalls[0]?.options.handler('', ctx);

    expect(notifyCalls).toHaveLength(1);
    expect(notifyCalls[0]?.message).toContain('disabled');
  });

  it('a mid-process disable disconnects a live hub and clears the widget', async () => {
    mockConfig(true);
    const { pi, sessionStartHandlers } = makePi();
    const initialCtx = makeCtx(cwd);
    const { state } = activateP2pHub(pi, initialCtx);

    await state.createHub('ext-test-hub');
    expect(state.isConnected()).toBe(true);

    mockConfig(false);
    const setWidgetCalls: unknown[] = [];
    const disabledCtx = makeCtx(cwd, { setWidgetCalls });
    // activateP2pHub was called directly (bypassing registerP2pHub's bootstrap),
    // so its own session_start listener is the only one registered.
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, disabledCtx);

    expect(state.isConnected()).toBe(false);
    expect(setWidgetCalls.some(call => Array.isArray(call) && call[1] === undefined)).toBe(true);

    state.dispose();
  });
});
