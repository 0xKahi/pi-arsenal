import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../../src/config/config-loader.ts';
import { SubagentIdentityHandler, SUBAGENT_IDENTITY_CUSTOM_TYPE } from '../../../../src/extensions/multiverse/agents/session-identity.ts';
import { registerMultiverse } from '../../../../src/extensions/multiverse/multiverse.extension.ts';

const config: ConfigProvider = {
  getP2pCouncil: () => ({ enabled: false, layout: 'inline' }),
  getTmuxPopup: () => ({ enabled: false, width: 50, height: 50, fileCommand: 'nvim' }),
  getMultiverse: () => ({
    enabled: false,
    defaultAgent: 'megamind',
    maxConcurrency: 5,
    subagents: { explorer: { enabled: true }, fixer: { enabled: true }, visualizer: { enabled: true } },
  }),
};

const childEntry = (): SessionEntry => ({
  type: 'custom',
  id: 'marker',
  parentId: null,
  timestamp: '2026-01-01T00:00:00.000Z',
  customType: SUBAGENT_IDENTITY_CUSTOM_TYPE,
  data: SubagentIdentityHandler.create('explorer', 'parent'),
});

describe('child prompt policy', () => {
  const setup = (entries: SessionEntry[]) => {
    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>();
    const activeToolSelections: string[][] = [];
    const pi = {
      on: (eventName: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
        const eventHandlers = handlers.get(eventName) ?? [];
        eventHandlers.push(handler);
        handlers.set(eventName, eventHandlers);
      },
      registerTool: () => {},
      getActiveTools: () => [],
      getAllTools: () => ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write', 'spawn'].map(name => ({ name })),
      setActiveTools: (names: string[]) => activeToolSelections.push(names),
    } as unknown as ExtensionAPI;
    const notifications: string[] = [];
    const ctx = {
      sessionManager: { getEntries: () => entries },
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionContext;
    registerMultiverse(pi, { config, availableSkills: () => [] });
    return { handlers, ctx, notifications, activeToolSelections };
  };

  it('fully replaces host, appended, command-line, and parent persona prompt content', () => {
    const { handlers, ctx, notifications, activeToolSelections } = setup([childEntry()]);
    handlers.get('session_start')?.[0]?.({ type: 'session_start', reason: 'startup' }, ctx);

    const result = handlers.get('before_agent_start')?.[0]?.({ systemPrompt: 'HOST\nPROJECT APPEND\nCLI APPEND\nMEGAMIND' }, ctx) as
      | { systemPrompt?: string }
      | undefined;

    expect(notifications).toEqual([]);
    expect(activeToolSelections).toEqual([['read', 'grep', 'find', 'ls', 'bash']]);
    expect(activeToolSelections[0]).not.toContain('spawn');
    expect(result?.systemPrompt).toStartWith('You are Explorer');
    expect(result?.systemPrompt).not.toContain('HOST');
    expect(result?.systemPrompt).not.toContain('PROJECT APPEND');
    expect(result?.systemPrompt).not.toContain('CLI APPEND');
    expect(result?.systemPrompt).not.toContain('MEGAMIND');
    expect(`${result?.systemPrompt}\nLATER EXTENSION`).toEndWith('LATER EXTENSION');

    handlers.get('session_start')?.[0]?.({ type: 'session_start', reason: 'reload' }, ctx);
    handlers.get('before_agent_start')?.[0]?.({ systemPrompt: 'HOST AGAIN' }, ctx);
    expect(activeToolSelections).toEqual([
      ['read', 'grep', 'find', 'ls', 'bash'],
      ['read', 'grep', 'find', 'ls', 'bash'],
    ]);
  });

  it('does not replace the prompt for an ordinary parent session', () => {
    const { handlers, ctx, activeToolSelections } = setup([]);
    handlers.get('session_start')?.[0]?.({ type: 'session_start', reason: 'startup' }, ctx);

    const result = handlers.get('before_agent_start')?.[0]?.({ systemPrompt: 'HOST' }, ctx);

    expect(result).toBeUndefined();
    // A Default parent keeps its own tools and never receives the spawn tool.
    expect(activeToolSelections.every(selection => !selection.includes('spawn'))).toBe(true);
    expect(handlers.has('tool_call')).toBe(false);
  });
});
