import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { P2pHubState } from '../p2p-hub-state';
import { memberNames, notConnectedResult, textResult } from './tool-helpers';

export const P2pAskToolName = 'p2p_ask';

export const p2pAskSchema = Type.Object({
  to: Type.String({ description: 'Target agent name (see p2p_ls for connected members)' }),
  prompt: Type.String({ description: 'Prompt to send' }),
});

export function createP2pAskTool(state: P2pHubState): ToolDefinition<typeof p2pAskSchema, Record<string, unknown>> {
  return {
    name: P2pAskToolName,
    label: 'p2p ask',
    description:
      'Synchronous RPC: send a prompt to another connected p2p-hub agent and wait for its actual assistant reply. ' +
      'The remote agent processes the prompt as a new turn, then returns its response. Times out after inactivity.',
    promptSnippet: 'p2p_ask(to, prompt): send a prompt to another p2p-hub agent and receive its assistant reply',
    promptGuidelines: ['Only usable while connected to a p2p hub. The target must be idle and able to run a turn.'],
    parameters: p2pAskSchema,
    async execute(_toolCallId, params, signal): Promise<AgentToolResult<Record<string, unknown>>> {
      if (signal?.aborted) return textResult('Prompt request aborted', { to: params.to, error: 'aborted' });
      if (!state.isConnected()) return notConnectedResult();

      if (params.to === state.getSelfName()) {
        return textResult('Cannot ask yourself', { to: params.to, error: 'self_target' });
      }

      const result = await state.askPrompt(params.to, params.prompt, signal);
      if (result.error) {
        return textResult(describeAskError(params.to, result.error, memberNames(state)), {
          to: params.to,
          error: result.error,
        });
      }
      return textResult(result.response ?? '(no response)', { to: params.to, from: result.from });
    },
  };
}

function describeAskError(to: string, error: string, connected: string[]): string {
  if (error === 'not_found') return `Agent "${to}" not found. Connected: ${connected.join(', ') || '(none)'}`;
  if (error === 'Terminal is busy') return `Agent "${to}" is busy and declined the prompt`;
  if (error.startsWith('inactivity_timeout:')) {
    const [, target, seconds] = error.split(':');
    return `Prompt to "${target}" timed out (no activity for ${seconds})`;
  }
  if (error.startsWith('hard_ceiling:')) {
    const [, minutes] = error.split(':');
    return `Prompt to "${to}" hit the hard ceiling (${minutes})`;
  }
  if (error.startsWith('disconnected:')) return `Agent "${to}" disconnected before answering`;
  if (error === 'aborted') return 'Prompt request aborted';
  if (error === 'not_delivered') return `Failed to deliver prompt to "${to}"`;
  return `Prompt to "${to}" failed: ${error}`;
}
