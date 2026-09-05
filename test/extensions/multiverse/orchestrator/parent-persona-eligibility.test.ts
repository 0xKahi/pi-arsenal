import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../../src/config/config-loader.ts';
import { BUNDLED_SUBAGENT_PROMPTS_DIRECTORY } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { registerMultiverse } from '../../../../src/extensions/multiverse/multiverse.extension.ts';
import { resolveMegamindEligibility } from '../../../../src/extensions/multiverse/orchestrator/megamind.ts';
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

const setup = (initialEnabled: boolean, enabledRoster = true) => {
  let enabled = initialEnabled;
  const handlers = new Map<string, Array<(event: never, ctx: ExtensionContext) => unknown>>();
  const pi = {
    on: (eventName: string, handler: (event: never, ctx: ExtensionContext) => unknown) => {
      const eventHandlers = handlers.get(eventName) ?? [];
      eventHandlers.push(handler);
      handlers.set(eventName, eventHandlers);
    },
    registerTool: () => {},
    setActiveTools: () => {},
    getActiveTools: () => [],
    getAllTools: () => ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'].map(name => ({ name })),
    getCommands: () => [],
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
    megamindPromptIntro: () => 'fixture intro',
  });
  const start = () => handlers.get('session_start')?.[0]?.({ type: 'session_start', reason: 'startup' } as never, ctx);
  const beforeAgentStart = (systemPrompt: string) =>
    handlers.get('before_agent_start')?.[0]?.({ systemPrompt } as never, ctx) as { systemPrompt?: string } | undefined;
  return { activation, notifications, setEnabled: (value: boolean) => (enabled = value), start, beforeAgentStart };
};

describe('parent persona eligibility', () => {
  it('falls back without rewriting the recorded Megamind preference and restores it when eligible', () => {
    const runtime = setup(false);

    runtime.start();
    expect(runtime.activation.parentAgentState.getPreferred()).toBe('megamind');
    expect(runtime.activation.parentAgentState.getActive()).toBe('default');
    expect(runtime.notifications.join('\n')).toContain('Multiverse is disabled');

    runtime.setEnabled(true);
    runtime.start();
    expect(runtime.activation.parentAgentState.getPreferred()).toBe('megamind');
    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');
  });

  it('falls back when no enabled valid subagent is available', () => {
    const runtime = setup(true, false);

    runtime.start();

    expect(runtime.activation.parentAgentState.getActive()).toBe('default');
    expect(runtime.notifications.join('\n')).toContain('No enabled valid Multiverse subagent');
  });

  it('keeps an empty Megamind development placeholder ineligible', () => {
    const result = resolveMegamindEligibility({
      config: MultiverseConfigSchema.parse({ enabled: true }),
      definitionsDirectory: BUNDLED_SUBAGENT_PROMPTS_DIRECTORY,
      availableTools: ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'],
      availableSkills: [],
      promptIntro: '',
    });

    expect(result).toEqual({ eligible: false, reason: 'The Megamind prompt has not been configured.', roster: new Map() });
  });

  it('appends the dynamic Megamind prompt once per turn without accumulating copies', () => {
    const runtime = setup(true);
    runtime.start();
    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');

    const first = runtime.beforeAgentStart('HOST\nPROJECT APPEND');
    expect(first?.systemPrompt).toStartWith('HOST\nPROJECT APPEND');
    expect(first?.systemPrompt).toContain('fixture intro');
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
