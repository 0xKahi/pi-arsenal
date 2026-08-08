import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import { COMMAND_NAME } from '../constants';
import type { P2pHubState } from '../p2p-hub-state';

/**
 * Tools are registered eagerly at extension load, before the hub state exists, so they
 * resolve their state lazily at call time. A plain state is still accepted for tests.
 */
export type P2pStateSource = P2pHubState | (() => P2pHubState | undefined);

export function resolveState(source: P2pStateSource): P2pHubState | undefined {
  return typeof source === 'function' ? source() : source;
}

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
