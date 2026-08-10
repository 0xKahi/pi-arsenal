import { dye } from '@0xkahi/cli-dye';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { formatPreview } from '../communication-presentation';
import { memberNames, notConnectedResult, type P2pStateSource, resolveState, textResult } from './tool-helpers';

export interface P2pSendDetails {
  to: string;
  triggerTurn: boolean;
  error?: string;
}

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

export function createP2pSendTool(source: P2pStateSource): ToolDefinition<typeof p2pSendSchema, P2pSendDetails | Record<string, unknown>> {
  return {
    name: P2pSendToolName,
    label: 'p2p send',
    description: 'Fire-and-forget message to another connected p2p-council agent. Optionally trigger an agent turn on the recipient once idle.',
    promptSnippet: 'p2p_send(to, message, triggerTurn?): fire-and-forget message to another p2p-council agent',
    promptGuidelines: [
      'Only usable while connected to a p2p council. Check p2p_ls for valid target names first if unsure.',
      'Need autonomous work done? → `p2p_send(triggerTurn: true)`',
      'Need to notify only? → `p2p_send(triggerTurn: false)`',
    ],
    parameters: p2pSendSchema,
    async execute(_toolCallId, params): Promise<AgentToolResult<Record<string, unknown>>> {
      const state = resolveState(source);
      if (!state?.isConnected()) return notConnectedResult();

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

      const confirmation = triggerTurn
        ? `Accepted message for transport to "${params.to}"; a turn was requested once the recipient is idle.`
        : `Accepted message for transport to "${params.to}" as a steer; no turn was requested.`;
      return textResult(confirmation, { to: params.to, triggerTurn });
    },
    renderCall(args, theme, context) {
      const triggerTurn = args.triggerTurn ?? false;
      const mode = triggerTurn ? 'trigger when idle' : 'steer';
      const body = context.expanded ? dye.strip(args.message) : formatPreview(args.message);
      let text = theme.fg('toolTitle', theme.bold('p2p_send '));
      text += theme.fg('text', args.to);
      text += theme.fg('muted', ` · ${mode}`);
      text += `\n${theme.fg('dim', body)}`;
      return new Text(text, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg('warning', 'Sending…'), 0, 0);
      const details = result.details as P2pSendDetails | undefined;
      const content = result.content[0];
      const message = content?.type === 'text' ? content.text : '';
      if (details?.error) return new Text(theme.fg('error', `✗ ${message}`), 0, 0);
      const delivery = details?.triggerTurn ? 'trigger when idle' : 'steer (no turn)';
      return new Text(theme.fg('success', '✓ Accepted for transport') + theme.fg('muted', ` · ${details?.to ?? ''} · ${delivery}`), 0, 0);
    },
  };
}
