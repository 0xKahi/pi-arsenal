import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { FormatUtil } from '../format.util';
import type { P2pRosterEntry } from '../p2p-hub-state';
import { notConnectedResult, type P2pStateSource, resolveState, textResult } from './tool-helpers';

export const P2pLsToolName = 'p2p_ls';

export const p2pLsSchema = Type.Object({});

export function createP2pLsTool(source: P2pStateSource): ToolDefinition<typeof p2pLsSchema, Record<string, unknown>> {
  return {
    name: P2pLsToolName,
    label: 'p2p ls',
    description: 'List agents connected to the current p2p communication hub with routing-relevant status, description, and cwd.',
    promptSnippet: 'p2p_ls(): list connected p2p-hub agents with status, description, and cwd',
    parameters: p2pLsSchema,
    async execute(): Promise<AgentToolResult<Record<string, unknown>>> {
      const state = resolveState(source);
      if (!state?.isConnected()) return notConnectedResult();

      const roster = state.getRoster();
      const members = roster.map(entry => renderMember(entry));
      const lines = roster.map(entry => renderLine(entry));

      return textResult(`Connected to hub "${state.getHubName()}" (${roster.length} agent${roster.length === 1 ? '' : 's'}):\n${lines.join('\n')}`, {
        hubName: state.getHubName(),
        members,
      });
    },
  };
}

function renderMember(entry: P2pRosterEntry) {
  return {
    name: entry.identity.name,
    isSelf: entry.isSelf,
    status: entry.status ? FormatUtil.formatStatus(entry.status) : undefined,
    description: entry.identity.description,
    cwd: entry.identity.cwd,
  };
}

function renderLine(entry: P2pRosterEntry): string {
  const marker = entry.isSelf ? ' (you)' : '';
  const status = entry.status ? `  ${FormatUtil.formatStatus(entry.status)}` : '';
  let line = `  • ${entry.identity.name}${marker}${status}`;
  if (entry.identity.description) line += `\n    ${entry.identity.description}`;
  if (entry.identity.cwd) line += `\n    cwd: ${entry.identity.cwd}`;
  return line;
}
