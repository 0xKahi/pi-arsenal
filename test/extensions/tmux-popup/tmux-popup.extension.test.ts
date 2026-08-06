import { beforeEach, describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../src/config/config-loader';
import { registerTmuxPopup } from '../../../src/extensions/tmux-popup/tmux-popup.extension';
import type { createTmuxPopupTool } from '../../../src/extensions/tmux-popup/tmux-popup.tool';

type SessionStartHandler = (event: { type: 'session_start'; reason: 'startup' }, ctx: ExtensionContext) => void;

describe('registerTmuxPopup', () => {
  let registerToolCalls: unknown[] = [];

  const createPi = () => {
    const sessionStartHandlers: SessionStartHandler[] = [];
    const pi = {
      registerTool: (tool: unknown) => registerToolCalls.push(tool),
      on: (event: string, handler: SessionStartHandler) => {
        if (event === 'session_start') sessionStartHandlers.push(handler);
      },
    } as unknown as ExtensionAPI;
    return { pi, sessionStartHandlers };
  };

  const createCtx = (): ExtensionContext =>
    ({
      cwd: '/tmp/project',
      isProjectTrusted: () => true,
      ui: { notify: () => {} },
    }) as unknown as ExtensionContext;

  let enabled = false;
  const config: ConfigProvider = {
    getP2pHub: () => ({ enabled: false, layout: 'inline' }),
    getTmuxPopup: () => ({ enabled, width: 50, height: 50, fileCommand: 'nvim' }),
  };

  beforeEach(() => {
    registerToolCalls = [];
    enabled = false;
  });

  it('registers nothing observable while disabled', () => {
    const { pi, sessionStartHandlers } = createPi();
    registerTmuxPopup(pi, { config });

    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, createCtx());

    expect(registerToolCalls).toHaveLength(0);
  });

  it('activates on the first enabled session', () => {
    const { pi, sessionStartHandlers } = createPi();
    registerTmuxPopup(pi, { config });
    enabled = true;

    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, createCtx());

    expect(registerToolCalls).toHaveLength(1);
    expect((registerToolCalls[0] as ReturnType<typeof createTmuxPopupTool>).name).toBe('tmux_popup');
  });

  it('registers surfaces only once per runtime', () => {
    const { pi, sessionStartHandlers } = createPi();
    registerTmuxPopup(pi, { config });

    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, createCtx());
    enabled = true;
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, createCtx());
    sessionStartHandlers[0]?.({ type: 'session_start', reason: 'startup' }, createCtx());

    expect(registerToolCalls).toHaveLength(1);
  });
});
