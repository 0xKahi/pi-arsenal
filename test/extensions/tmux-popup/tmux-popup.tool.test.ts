import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createTmuxPopupTool, type TmuxPopupToolDetails } from '../../../src/extensions/tmux-popup/tmux-popup.tool';

describe('tmux_popup tool execute', () => {
  const config = { enabled: true, width: 50, height: 50, fileCommand: 'nvim' };
  const ctx = {} as ExtensionContext;
  let originalTmux: string | undefined;
  let capturedCommand = '';

  const createDeps = (overrides?: {
    normalizePath?: typeof import('../../../src/extensions/tmux-popup/popup-path.util').normalizeTmuxPopupPath;
    validateFile?: typeof import('../../../src/extensions/tmux-popup/popup-path.util').validateExistingFile;
    launchPopup?: typeof import('../../../src/extensions/tmux-popup/popup-process.util').launchTmuxPopup;
  }) => ({
    normalizePath: () => ({ success: true as const, normalizedPath: '/tmp/file.ts' }),
    validateFile: () => ({ success: true as const, normalizedPath: '/tmp/file.ts' }),
    launchPopup: async (_width: number, _height: number, command: string) => {
      capturedCommand = command;
      return { success: true as const };
    },
    ...overrides,
  });

  beforeEach(() => {
    originalTmux = process.env.TMUX;
    process.env.TMUX = '/tmp/tmux-123/default';
    capturedCommand = '';
  });

  afterEach(() => {
    process.env.TMUX = originalTmux;
  });

  it('rejects execution outside a tmux session', async () => {
    process.env.TMUX = '';
    const tool = createTmuxPopupTool(config, createDeps());
    await expect(tool.execute('id', { filePath: '/tmp/file.ts' }, undefined, undefined, ctx)).rejects.toThrow(
      'tmux_popup can only be used within a tmux session',
    );
  });

  it('constructs the popup command from fileCommand and escaped path', async () => {
    const tool = createTmuxPopupTool(config, createDeps());
    await tool.execute('id', { filePath: '/tmp/file.ts' }, undefined, undefined, ctx);
    expect(capturedCommand).toBe("nvim '/tmp/file.ts'");
  });

  it('returns success result on popup spawn', async () => {
    const tool = createTmuxPopupTool(config, createDeps());
    const result = (await tool.execute('id', { filePath: '/tmp/file.ts' }, undefined, undefined, ctx)) as AgentToolResult<TmuxPopupToolDetails>;
    expect(result.content[0]).toEqual({ type: 'text', text: 'Opened tmux popup for /tmp/file.ts' });
    expect(result.details.popupCommand).toBe("nvim '/tmp/file.ts'");
  });

  it('throws on spawn failure', async () => {
    const tool = createTmuxPopupTool(
      config,
      createDeps({
        launchPopup: async () => ({ success: false as const, error: 'ENOENT' }),
      }),
    );
    await expect(tool.execute('id', { filePath: '/tmp/file.ts' }, undefined, undefined, ctx)).rejects.toThrow('ENOENT');
  });

  it('does not wait for editor exit', async () => {
    let resolved = false;
    const tool = createTmuxPopupTool(
      config,
      createDeps({
        launchPopup: async () => {
          resolved = true;
          return { success: true as const };
        },
      }),
    );
    await tool.execute('id', { filePath: '/tmp/file.ts' }, undefined, undefined, ctx);
    expect(resolved).toBe(true);
  });
});
