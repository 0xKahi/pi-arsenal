import { dye } from '@0xkahi/cli-dye';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type ToolDefinition, truncateHead } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { formatPreview } from '../communication-presentation';
import { memberNames, notConnectedResult, type P2pStateSource, resolveState, textResult } from './tool-helpers';

export const P2pAskToolName = 'p2p_ask';

export interface P2pAskDetails {
  to: string;
  from?: string;
  error?: string;
  elapsed?: string;
  truncated?: boolean;
}

export const p2pAskSchema = Type.Object({
  to: Type.String({ description: 'Target agent name (see p2p_ls for connected members)' }),
  prompt: Type.String({ description: 'Prompt to send' }),
});

export function createP2pAskTool(source: P2pStateSource): ToolDefinition<typeof p2pAskSchema, P2pAskDetails | Record<string, unknown>> {
  return {
    name: P2pAskToolName,
    label: 'p2p ask',
    description:
      'Synchronous RPC: send a prompt to another connected p2p-council agent and wait for its actual assistant reply. ' +
      `The remote agent processes the prompt as a new turn. Replies are limited to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: 'p2p_ask(to, prompt): send a prompt to another p2p-council agent and receive its assistant reply',
    promptGuidelines: [
      'Only usable while connected to a p2p council. The target must be idle and able to run a turn.',
      'use when you need immediate answer back from council agent',
    ],
    parameters: p2pAskSchema,
    async execute(_toolCallId, params, signal): Promise<AgentToolResult<P2pAskDetails | Record<string, unknown>>> {
      if (signal?.aborted) return textResult('Prompt request aborted', { to: params.to, error: 'aborted' });
      const state = resolveState(source);
      if (!state?.isConnected()) return notConnectedResult();

      if (params.to === state.getSelfName()) {
        return textResult('Cannot ask yourself', { to: params.to, error: 'self_target' });
      }

      const result = await state.askPrompt(params.to, params.prompt, signal);
      if (result.error) {
        const error = normalizeAskError(params.to, result.error, memberNames(state));
        return textResult(error.message, { to: params.to, error: error.code, elapsed: error.elapsed });
      }

      const response = result.response ?? '(no response)';
      const truncation = truncateHead(response, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
      let reply = truncation.content;
      if (truncation.truncated) {
        reply += `\n\n[Reply truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines `;
        reply += `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).]`;
      }
      return textResult(reply, {
        to: params.to,
        from: result.from ?? params.to,
        truncated: truncation.truncated || undefined,
      });
    },
    renderCall(args, theme, context) {
      const body = context.expanded ? dye.strip(args.prompt) : formatPreview(args.prompt);
      let text = theme.fg('toolTitle', theme.bold('p2p_ask '));
      text += theme.fg('accent', args.to);
      text += `\n${theme.fg('dim', body)}`;
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg('warning', 'Waiting for remote reply…'), 0, 0);
      const details = result.details as P2pAskDetails | undefined;
      const content = result.content[0];
      const message = content?.type === 'text' ? content.text : '';
      if (details?.error) return new Text(theme.fg('error', `✗ ${message}`), 0, 0);

      const responder = details?.from ?? details?.to ?? 'remote agent';
      const reply = expanded ? dye.strip(message) : formatPreview(message);
      let text = theme.fg('success', `↩ Reply from ${responder}`);
      if (details?.truncated) text += theme.fg('warning', ' · truncated');
      if (reply) text += `\n${theme.fg('muted', reply)}`;
      return new Text(text, 0, 0);
    },
  };
}

interface NormalizedAskError {
  code: string;
  message: string;
  elapsed?: string;
}

function normalizeAskError(to: string, error: string, connected: string[]): NormalizedAskError {
  if (error === 'not_found') {
    return { code: 'not_found', message: `Agent "${to}" not found. Connected: ${connected.join(', ') || '(none)'}` };
  }
  if (error === 'Terminal is busy' || error === 'busy') {
    return { code: 'busy', message: `Agent "${to}" is busy and declined the prompt` };
  }
  if (error.startsWith('inactivity_timeout:')) {
    const [, target, seconds] = error.split(':');
    return {
      code: 'inactivity_timeout',
      message: `Prompt to "${target ?? to}" timed out after ${seconds ?? 'the inactivity limit'} without activity`,
      elapsed: seconds,
    };
  }
  if (error.startsWith('hard_ceiling:')) {
    const [, minutes] = error.split(':');
    return {
      code: 'hard_ceiling',
      message: `Prompt to "${to}" hit the hard ceiling after ${minutes ?? 'the configured limit'}`,
      elapsed: minutes,
    };
  }
  if (error.startsWith('disconnected:')) return { code: 'disconnected', message: `Agent "${to}" disconnected before answering` };
  if (error === 'aborted') return { code: 'aborted', message: 'Prompt request aborted' };
  if (error === 'not_delivered') return { code: 'not_delivered', message: `Failed to send prompt to "${to}"` };
  if (error === 'runtime_temporarily_unavailable') {
    return { code: error, message: `Agent "${to}" is temporarily unavailable during a session transition` };
  }
  return { code: 'remote_error', message: `Prompt to "${to}" failed: ${error}` };
}
