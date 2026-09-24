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
    isProjectTrusted: () => false,
    cwd: '/tmp/project',
    sessionManager: { getEntries: () => [megamindEntry] },
    ui: { notify: (message: string) => notifications.push(message) },
  } as unknown as ExtensionContext;
  const activation = registerMultiverse(pi, {
    config,
    // Point discovery at absent directories so a developer's real agents folder cannot reach this test.
    projectAgentsDirectory: '/tmp/pi-arsenal-absent-project-agents',
    globalAgentsDirectory: '/tmp/pi-arsenal-absent-global-agents',
  });
  const start = () => handlers.get('session_start')?.[0]?.({ type: 'session_start', reason: 'startup' } as never, ctx);
  const beforeAgentStart = (systemPrompt: string, sections: Record<string, string> = {}) => {
    const event = { systemPrompt, systemPromptOptions: { sections: { ...sections } } };
    const result = handlers.get('before_agent_start')?.[0]?.(event as never, ctx) as { systemPrompt?: string } | undefined;
    return { event, result, contribution: event.systemPromptOptions.sections.orchestrator_role, sections: event.systemPromptOptions.sections };
  };
  return { activation, notifications, agentNameEvents, start, beforeAgentStart };
};

describe('parent persona eligibility', () => {
  it('falls back without rewriting the recorded Megamind preference and restores it in a fresh enabled instance', async () => {
    const disabled = setup(false);
    disabled.start();
    expect(disabled.activation.parentAgentState.getActive()).toBe('default');
    expect(disabled.notifications).toEqual([]);

    const enabled = setup(true);
    enabled.start();
    expect(enabled.activation.parentAgentState.getActive()).toBe('megamind');
    await Bun.sleep(20);
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
    // Additive: the handler must not replace the host prompt, only contribute a section.
    expect(first.result).toBeUndefined();
    expect(first.event.systemPrompt).toBe('HOST\nPROJECT APPEND');
    expect(first.contribution).toContain('You are a workflow manager for coding work.');
    expect(first.contribution).toContain('@explorer');
    expect(first.contribution).toContain('@fixer');
    expect(first.contribution).toContain('@visualizer');
    expect(first.contribution).toContain('<available_agents>');

    // Repeated turns rebuild the section from scratch rather than appending copies.
    const second = runtime.beforeAgentStart('HOST\nPROJECT APPEND');
    expect(second.contribution).toBe(first.contribution);
  });

  it('keeps a Default parent turn free of any Megamind contribution', () => {
    const runtime = setup(true);
    runtime.start();
    runtime.activation.parentAgentState.setActive('default');

    const turn = runtime.beforeAgentStart('HOST', { orchestrator_role: 'STALE' });
    expect(turn.result).toBeUndefined();
    expect(turn.sections.orchestrator_role).toBeUndefined();
  });
});
