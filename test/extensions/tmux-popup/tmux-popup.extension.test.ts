import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigLoadResult } from '../../../src/config/config-loader';
import { registerTmuxPopup, resetTmuxPopupRegistrationState } from '../../../src/extensions/tmux-popup/tmux-popup.extension';
import type { createTmuxPopupTool } from '../../../src/extensions/tmux-popup/tmux-popup.tool';

describe('registerTmuxPopup', () => {
  let registerToolCalls: unknown[] = [];
  let notifyCalls: { message: string; type?: 'info' | 'warning' | 'error' }[] = [];

  const createPi = (): ExtensionAPI =>
    ({
      registerTool: (tool: unknown) => {
        registerToolCalls.push(tool);
      },
      on: () => {},
    }) as unknown as ExtensionAPI;

  const createCtx = (trusted = true): ExtensionContext =>
    ({
      cwd: '/tmp/project',
      isProjectTrusted: () => trusted,
      ui: { notify: (message: string, type?: 'info' | 'warning' | 'error') => notifyCalls.push({ message, type }) },
    }) as unknown as ExtensionContext;

  beforeEach(() => {
    registerToolCalls = [];
    notifyCalls = [];
    resetTmuxPopupRegistrationState();
  });

  it('does not register the tool when disabled', () => {
    mock.module('../../../src/config/config-loader', () => ({
      ConfigLoader: {
        load: (): ConfigLoadResult => ({
          success: true,
          config: { tmux_popup: { enabled: false, width: 50, height: 50, fileCommand: 'nvim' } },
        }),
      },
    }));

    registerTmuxPopup(createPi(), createCtx());
    expect(registerToolCalls).toHaveLength(0);
  });

  it('registers the tool when enabled', () => {
    mock.module('../../../src/config/config-loader', () => ({
      ConfigLoader: {
        load: (): ConfigLoadResult => ({
          success: true,
          config: { tmux_popup: { enabled: true, width: 50, height: 50, fileCommand: 'nvim' } },
        }),
      },
    }));

    registerTmuxPopup(createPi(), createCtx());
    expect(registerToolCalls).toHaveLength(1);
    const tool = registerToolCalls[0];
    if (tool) {
      expect((tool as ReturnType<typeof createTmuxPopupTool>).name).toBe('tmux_popup');
    }
  });

  it('notifies on invalid configuration', () => {
    mock.module('../../../src/config/config-loader', () => ({
      ConfigLoader: {
        load: (): ConfigLoadResult => ({ success: false, error: 'Invalid dimensions' }),
      },
    }));

    registerTmuxPopup(createPi(), createCtx());
    expect(registerToolCalls).toHaveLength(0);
    expect(notifyCalls).toHaveLength(1);
    const notification = notifyCalls[0];
    if (notification) {
      expect(notification.type).toBe('error');
    }
  });

  it('is idempotent', () => {
    mock.module('../../../src/config/config-loader', () => ({
      ConfigLoader: {
        load: (): ConfigLoadResult => ({
          success: true,
          config: { tmux_popup: { enabled: true, width: 50, height: 50, fileCommand: 'nvim' } },
        }),
      },
    }));

    const pi = createPi();
    registerTmuxPopup(pi, createCtx());
    registerTmuxPopup(pi, createCtx());
    expect(registerToolCalls).toHaveLength(1);
  });
});
