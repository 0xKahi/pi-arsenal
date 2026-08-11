import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ThemeColor, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Component, Container, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { FormatUtil } from '../format.util';
import type { P2pRosterEntry } from '../p2p-council-state';
import { notConnectedResult, type P2pStateSource, resolveState, textResult } from './tool-helpers';

export const P2pLsToolName = 'p2p_ls';

export const p2pLsSchema = Type.Object({});

export interface P2pLsMember {
  name: string;
  isSelf: boolean;
  status?: string;
  description?: string;
  cwd?: string;
}

export interface P2pLsDetails {
  councilName: string;
  members: P2pLsMember[];
}

type P2pLsTheme = {
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
};

export function createP2pLsTool(source: P2pStateSource): ToolDefinition<typeof p2pLsSchema, Record<string, unknown>> {
  return {
    name: P2pLsToolName,
    label: 'p2p ls',
    description: 'List agents connected to the current p2p communication council with routing-relevant status, description, and cwd.',
    promptSnippet: 'p2p_ls(): list connected p2p-council agents with status, description, and cwd',
    promptGuidelines: ['use p2p_ls to list all connected council members'],
    parameters: p2pLsSchema,
    async execute(): Promise<AgentToolResult<Record<string, unknown>>> {
      const state = resolveState(source);
      if (!state?.isConnected()) return notConnectedResult();

      const roster = state.getRoster();
      const members = roster.map(entry => renderMember(entry));
      const lines = roster.map(entry => renderLine(entry));

      return textResult(
        `Connected to council "${state.getCouncilName()}" (${roster.length} agent${roster.length === 1 ? '' : 's'}):\n${lines.join('\n')}`,
        {
          councilName: state.getCouncilName(),
          members,
        },
      );
    },
    renderCall() {
      return new Container();
    },
    renderResult(result, { expanded }, theme) {
      const content = result.content[0];
      const output = content?.type === 'text' ? content.text : '';
      return new P2pLsResultComponent(theme, membersFromDetails(result.details), output, expanded);
    },
  };
}

export class P2pLsResultComponent implements Component {
  public constructor(
    private readonly theme: P2pLsTheme,
    private readonly members: P2pLsMember[],
    private readonly output: string,
    private readonly expanded: boolean,
  ) {}

  public render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const lines = [truncateToWidth(this.theme.fg('toolTitle', this.theme.bold('p2p_ls')), safeWidth, '')];

    if (this.members.length === 0) {
      // A restored or failed call may not have roster details; keep its result visible.
      lines.push(...wrapOutput(this.output, safeWidth).map(line => this.theme.fg('toolOutput', line)));
      return lines;
    }

    this.members.forEach((member, index) => {
      const connector = index === this.members.length - 1 ? '└─ ' : '├─ ';
      let line = this.theme.fg('dim', connector) + this.theme.fg('text', member.name);
      if (member.status) line += ` ${this.theme.fg('warning', `(${member.status})`)}`;
      if (member.isSelf) line += ` ${this.theme.fg('accent', '(you)')}`;
      lines.push(truncateToWidth(line, safeWidth, ''));
    });

    if (this.expanded && this.output) {
      lines.push('');
      lines.push(...wrapOutput(this.output, safeWidth).map(line => this.theme.fg('toolOutput', line)));
    }
    return lines;
  }

  public invalidate(): void {}
}

function membersFromDetails(details: unknown): P2pLsMember[] {
  if (!details || typeof details !== 'object' || !Array.isArray((details as P2pLsDetails).members)) return [];
  return (details as P2pLsDetails).members.filter(
    (member): member is P2pLsMember =>
      !!member &&
      typeof member.name === 'string' &&
      typeof member.isSelf === 'boolean' &&
      (member.status === undefined || typeof member.status === 'string'),
  );
}

function wrapOutput(output: string, width: number): string[] {
  return output.split('\n').flatMap(line => wrapTextWithAnsi(line, width).map(wrapped => truncateToWidth(wrapped, width, '')));
}

function renderMember(entry: P2pRosterEntry): P2pLsMember {
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
