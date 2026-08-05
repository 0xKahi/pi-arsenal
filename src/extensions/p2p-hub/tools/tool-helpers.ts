import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { COMMAND_NAME } from '../constants';
import type { P2pHubState } from '../p2p-hub-state';

export function textResult(text: string, details: Record<string, unknown> = {}): AgentToolResult<Record<string, unknown>> {
  return { content: [{ type: 'text', text }], details };
}

export function notConnectedResult(): AgentToolResult<Record<string, unknown>> {
  return textResult(`Not connected to a hub. Run /${COMMAND_NAME} to join one.`, { error: 'not_connected' });
}

export function memberNames(state: P2pHubState): string[] {
  return state.getRoster().map(entry => entry.identity.name);
}

export function truncatePreview(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
