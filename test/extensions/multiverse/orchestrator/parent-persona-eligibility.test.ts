import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../../src/config/config-loader.ts';
import { registerMultiverse } from '../../../../src/extensions/multiverse/multiverse.extension.ts';
import { PARENT_AGENT_CUSTOM_TYPE } from '../../../../src/extensions/multiverse/orchestrator/parent-agent.ts';
import { MultiverseConfigSchema } from '../../../../src/schemas/multiverse.config.schema.ts';

const megamindEntry: SessionEntry = {
  type: 'custom',
  id: 'persona',
  parentId: 'abandoned-branch',
  timestamp: '2026-01-01T00:00:00.000Z',
  customType: PARENT_AGENT_CUSTOM_TYPE,
  data: { version: 1, agent: 'megamind' },
};

const setup = (enabled: boolean, enabledRoster = true) => {
  const agentNameEvents: string[] = [];
  const handlers = new Map<string, Array<(event: never, ctx: ExtensionContext) => unknown>>();
  const pi = {
    on: (eventName: string, handler: (event: never, ctx: ExtensionContext) => unknown) => {
      const eventHandlers = handlers.get(eventName) ?? [];
      eventHandlers.push(handler);
      handlers.set(eventName, eventHandlers);
    },
    registerTool: () => {},
    registerCommand: () => {},
    setActiveTools: () => {},
    getActiveTools: () => [],
    getAllTools: () => ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'].map(name => ({ name })),
    getCommands: () => [],
    events: { emit: (_name: string, payload: { agentName: string }) => agentNameEvents.push(payload.agentName), on: () => {} },
  } as unknown as ExtensionAPI;
  const config: ConfigProvider = {
    getP2pCouncil: () => ({ enabled: false, layout: 'inline' }),
    getTmuxPopup: () => ({ enabled: false, width: 50, height: 50, fileCommand: 'nvim' }),
    getMultiverse: () =>
      MultiverseConfigSchema.parse({
        enabled,
        subagents: enabledRoster ? undefined : { explorer: { enabled: false }, fixer: { enabled: false }, visualizer: { enabled: false } },
      }),
  };
  const notifications: string[] = [];
  const ctx = {
    sessionManager: { getEntries: () => [megamindEntry] },
    ui: { notify: (message: string) => notifications.push(message) },
  } as unknown as ExtensionContext;
  const activation = registerMultiverse(pi, {
    config,
  });
  const start = () => handlers.get('session_start')?.[0]?.({ type: 'session_start', reason: 'startup' } as never, ctx);
  const beforeAgentStart = (systemPrompt: string) =>
    handlers.get('before_agent_start')?.[0]?.({ systemPrompt } as never, ctx) as { systemPrompt?: string } | undefined;
  return { activation, notifications, agentNameEvents, start, beforeAgentStart };
};

describe('parent persona eligibility', () => {
  it('falls back without rewriting the recorded Megamind preference and restores it in a fresh enabled instance', () => {
    const disabled = setup(false);
    disabled.start();
    expect(disabled.activation.parentAgentState.getActive()).toBe('default');
    expect(disabled.notifications).toEqual([]);

    const enabled = setup(true);
    enabled.start();
    expect(enabled.activation.parentAgentState.getPreferred()).toBe('megamind');
    expect(enabled.activation.parentAgentState.getActive()).toBe('megamind');
    expect(enabled.agentNameEvents).toEqual(['MEGAMIND']);
  });

  it('falls back when no enabled valid subagent is available', () => {
    const runtime = setup(true, false);

    runtime.start();

    expect(runtime.activation.parentAgentState.getActive()).toBe('default');
    expect(runtime.notifications.join('\n')).toContain('No enabled valid Multiverse subagent');
  });

  it('appends the dynamic Megamind prompt once per turn without accumulating copies', () => {
    const runtime = setup(true);
    runtime.start();
    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');

    const first = runtime.beforeAgentStart('HOST\nPROJECT APPEND');
    expect(first?.systemPrompt).toStartWith('HOST\nPROJECT APPEND');
    expect(first?.systemPrompt).toContain('<Role>');
    expect(first?.systemPrompt).toContain('@explorer');
    expect(first?.systemPrompt).toContain('@fixer');
    expect(first?.systemPrompt).toContain('@visualizer');
    expect(`${first?.systemPrompt}\nLATER EXTENSION`).toEndWith('LATER EXTENSION');

    const second = runtime.beforeAgentStart('HOST\nPROJECT APPEND');
    expect(second).toEqual(first);
  });

  it('keeps a Default parent turn free of any Megamind contribution', () => {
    const runtime = setup(true);
    runtime.start();
    runtime.activation.parentAgentState.setActive('default');

    expect(runtime.beforeAgentStart('HOST')).toBeUndefined();
  });
});
