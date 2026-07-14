import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { TmuxPopupConfig } from '../../schemas/tmux-popup.config.schema';
import { escapeShellArg } from '../../utils/shell.util';
import { normalizeTmuxPopupPath, validateExistingFile } from './popup-path.util';
import { launchTmuxPopup } from './popup-process.util';

export const TmuxPopupToolName = 'tmux_popup';

export interface TmuxPopupToolDetails {
  filePath: string;
  popupCommand: string;
}

export interface TmuxPopupDependencies {
  normalizePath: typeof normalizeTmuxPopupPath;
  validateFile: typeof validateExistingFile;
  launchPopup: typeof launchTmuxPopup;
}

export const defaultTmuxPopupDependencies: TmuxPopupDependencies = {
  normalizePath: normalizeTmuxPopupPath,
  validateFile: validateExistingFile,
  launchPopup: launchTmuxPopup,
};

export const tmuxPopupSchema = Type.Object({
  filePath: Type.String({
    description: 'Absolute path to an existing file to open in the tmux popup. Supports optional leading @ and current-user ~ expansion.',
  }),
});

export type TmuxPopupToolInput = {
  filePath: string;
};

export function createTmuxPopupTool(
  config: TmuxPopupConfig,
  deps: TmuxPopupDependencies = defaultTmuxPopupDependencies,
): ToolDefinition<typeof tmuxPopupSchema, TmuxPopupToolDetails> {
  return {
    name: TmuxPopupToolName,
    label: 'tmux popup',
    description: 'Open an existing file in a tmux popup use when user request to open file in tmux popup',
    promptSnippet: 'tmux_popup(filePath): open an existing file in a tmux popup editor',
    promptGuidelines: [
      'Only use this tool if user explictly requests to open a file in a tmux popup.',
      'Only call tmux_popup with absolute file paths. Use ~ for the current user home directory if needed.',
    ],
    parameters: tmuxPopupSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx): Promise<AgentToolResult<TmuxPopupToolDetails>> {
      if (!process.env.TMUX || process.env.TMUX.trim() === '') {
        throw new Error('tmux_popup can only be used within a tmux session.');
      }

      const pathResult = deps.normalizePath(params.filePath);
      if (!pathResult.success) {
        throw new Error(pathResult.error);
      }

      const fileResult = deps.validateFile(pathResult.normalizedPath);
      if (!fileResult.success) {
        throw new Error(fileResult.error);
      }

      const escapedPath = escapeShellArg(fileResult.normalizedPath);
      const popupCommand = `${config.fileCommand} ${escapedPath}`;

      const launchResult = await deps.launchPopup(config.width, config.height, popupCommand);
      if (!launchResult.success) {
        throw new Error(launchResult.error);
      }

      return {
        content: [{ type: 'text', text: `Opened tmux popup for ${fileResult.normalizedPath}` }],
        details: {
          filePath: fileResult.normalizedPath,
          popupCommand,
        },
      };
    },
  };
}
