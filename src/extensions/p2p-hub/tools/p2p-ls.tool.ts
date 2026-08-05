import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { FormatUtil } from '../format.util';
import type { P2pHubState, P2pRosterEntry } from '../p2p-hub-state';
import { notConnectedResult, textResult } from './tool-helpers';

export const P2pLsToolName = 'p2p_ls';

export const p2pLsSchema = Type.Object({});

export function createP2pLsTool(state: P2pHubState): ToolDefinition<typeof p2pLsSchema, Record<string, unknown>> {
  return {
    name: P2pLsToolName,
    label: 'p2p ls',
    description: 'List agents connected to the current p2p hub, with role, model, status, cwd, description, and context usage.',
    promptSnippet: 'p2p_ls(): list connected p2p-hub agents with role, status, cwd, and context usage',
    parameters: p2pLsSchema,
    async execute(): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!state.isConnected()) return notConnectedResult();

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
    role: entry.role,
    isSelf: entry.isSelf,
    model: entry.identity.model,
    status: entry.status ? FormatUtil.formatStatus(entry.status) : undefined,
    cwd: entry.identity.cwd,
    description: entry.identity.description,
    context: entry.identity.context ? FormatUtil.formatContextNumeric(entry.identity.context) : undefined,
  };
}

function renderLine(entry: P2pRosterEntry): string {
  const marker = entry.isSelf ? ' (you)' : '';
  const model = entry.identity.model ? `  ${entry.identity.model}` : '';
  const status = entry.status ? `  ${FormatUtil.formatStatus(entry.status)}` : '';
  const contextNumeric = entry.identity.context ? FormatUtil.formatContextNumeric(entry.identity.context) : '';
  const contextBar = entry.identity.context ? FormatUtil.formatContextBar(entry.identity.context) : '';
  const context = contextNumeric ? `  ${contextNumeric} ${contextBar}` : '';
  let line = `  • ${entry.identity.name}${marker} [${entry.role}]${model}${status}${context}`;
  if (entry.identity.description) line += `\n    ${entry.identity.description}`;
  if (entry.identity.cwd) line += `\n    cwd: ${entry.identity.cwd}`;
  return line;
}
