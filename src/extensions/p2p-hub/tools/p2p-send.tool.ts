import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { P2pHubState } from '../p2p-hub-state';
import { memberNames, notConnectedResult, textResult } from './tool-helpers';

export const P2pSendToolName = 'p2p_send';

export const p2pSendSchema = Type.Object({
  to: Type.String({ description: 'Target agent name (see p2p_ls for connected members)' }),
  message: Type.String({ description: 'Message content' }),
  triggerTurn: Type.Optional(
    Type.Boolean({
      description: 'Whether to start an agent turn on the receiver once it is idle (default: false, delivered as a steer message)',
    }),
  ),
});

export function createP2pSendTool(state: P2pHubState): ToolDefinition<typeof p2pSendSchema, Record<string, unknown>> {
  return {
    name: P2pSendToolName,
    label: 'p2p send',
    description: 'Fire-and-forget message to another connected p2p-hub agent. Optionally trigger an agent turn on the recipient once idle.',
    promptSnippet: 'p2p_send(to, message, triggerTurn?): fire-and-forget message to another p2p-hub agent',
    promptGuidelines: ['Only usable while connected to a p2p hub. Check p2p_ls for valid target names first if unsure.'],
    parameters: p2pSendSchema,
    async execute(_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!state.isConnected()) return notConnectedResult();

      const triggerTurn = params.triggerTurn ?? false;
      const result = state.sendChat(params.to, params.message, triggerTurn);
      if (!result.success) {
        if (result.error === 'self_target') {
          return textResult('Cannot send to yourself', { to: params.to, triggerTurn, error: result.error });
        }
        if (result.error === 'not_found') {
          const available = memberNames(state).filter(name => name !== state.getSelfName());
          return textResult(`Agent "${params.to}" not found. Connected: ${available.join(', ') || '(none)'}`, {
            to: params.to,
            triggerTurn,
            error: result.error,
          });
        }
        return textResult(`Failed to send to "${params.to}"`, { to: params.to, triggerTurn, error: result.error });
      }

      return textResult(`Sent to "${params.to}"${triggerTurn ? ' (will trigger a turn once idle)' : ''}`, {
        to: params.to,
        triggerTurn,
      });
    },
  };
}
