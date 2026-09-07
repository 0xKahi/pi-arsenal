import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext, SessionEntry, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../src/config/config-loader.ts';
import { SUBAGENT_IDENTITY_CUSTOM_TYPE } from '../../../src/extensions/multiverse/agents/session-identity.ts';
import { registerMultiverse } from '../../../src/extensions/multiverse/multiverse.extension.ts';
import { PARENT_AGENT_CUSTOM_TYPE } from '../../../src/extensions/multiverse/orchestrator/parent-agent.ts';
import { recoverSpawnManifests } from '../../../src/extensions/multiverse/tools/spawn/spawn-manifest.ts';
import { SpawnProgress } from '../../../src/extensions/multiverse/tools/spawn/spawn-progress.ts';
import { MultiverseConfigSchema } from '../../../src/schemas/multiverse.config.schema.ts';
import { childInteraction } from './interaction-fixture.ts';

const customEntry = (customType: string, data: unknown): SessionEntry =>
  ({ type: 'custom', id: `${customType}-1`, parentId: null, timestamp: '2026-01-01T00:00:00.000Z', customType, data }) as SessionEntry;

const childIdentityEntry = customEntry(SUBAGENT_IDENTITY_CUSTOM_TYPE, { version: 1, agent: 'fixer', parentSessionId: 'parent-1' });

const setup = (initialEntries: SessionEntry[] = [], persona: 'default' | 'megamind' = 'default') => {
  // The session JSONL as pi would hold it: appended custom entries land here.
  const entries: SessionEntry[] = [...initialEntries];
  const handlers = new Map<string, Array<(event: never, ctx: ExtensionContext) => unknown>>();
  const tools: Array<ToolDefinition<never, never>> = [];
  let activeTools: string[] = ['read', 'bash'];
  const renderers: string[] = [];

  const pi = {
    on: (eventName: string, handler: (event: never, ctx: ExtensionContext) => unknown) => {
      handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
    },
    registerTool: (tool: ToolDefinition<never, never>) => tools.push(tool),
    registerCustomEntryRenderer: (customType: string) => renderers.push(customType),
    appendEntry: (customType: string, data: unknown) => entries.push(customEntry(customType, data)),
    setActiveTools: (names: string[]) => (activeTools = names),
    getActiveTools: () => activeTools,
    getAllTools: () => ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write', 'spawn'].map(name => ({ name })),
    getCommands: () => [],
    events: { emit: () => {} },
  } as unknown as ExtensionAPI;

  const config: ConfigProvider = {
    getP2pCouncil: () => ({ enabled: false, layout: 'inline' }),
    getTmuxPopup: () => ({ enabled: false, width: 50, height: 50, fileCommand: 'nvim' }),
    getMultiverse: () => MultiverseConfigSchema.parse({ enabled: true, defaultAgent: persona }),
  };

  const notifications: string[] = [];
  const ctx = {
    isIdle: () => true,
    cwd: '/tmp/project',
    model: { provider: 'anthropic', id: 'model' },
    modelRegistry: {},
    sessionManager: { getEntries: () => entries, getBranch: () => entries, getSessionId: () => 'parent-1' },
    ui: { notify: (message: string) => notifications.push(message) },
  } as unknown as ExtensionContext;

  const activation = registerMultiverse(pi, {
    config,
    // Only manifest/activation wiring is under test; no child is really dispatched.
    spawnRun: async () => ({ interactions: [childInteraction({ body: 'child output' })], progress: new SpawnProgress([]), aborted: false }),
  });
  handlers.get('session_start')?.[0]?.({ type: 'session_start', reason: 'startup' } as never, ctx);

  return { activation, entries, ctx, tools, renderers, notifications, activeTools: () => activeTools };
};

describe('spawn manifest persistence', () => {
  it('writes exactly one recoverable manifest entry per dispatched batch', async () => {
    const runtime = setup([], 'megamind');
    const tool = runtime.tools[0] as unknown as {
      execute: (id: string, params: unknown, signal: undefined, onUpdate: undefined, ctx: ExtensionContext) => Promise<unknown>;
    };

    await tool.execute(
      'call-1',
      { context: 'shared', tasks: [{ action: 'create', agent: 'fixer', task: 'implement' }] },
      undefined,
      undefined,
      runtime.ctx,
    );

    const manifests = recoverSpawnManifests(runtime.entries as never);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]?.outcome).toBe('completed');
    expect(manifests[0]?.tasks[0]?.childSessionId).toBe('child-1');
    // The manifest indexes children by reference; response bodies stay in the child session.
    expect(JSON.stringify(manifests[0])).not.toContain('body');
    expect(runtime.entries.filter(entry => entry.type === 'custom' && entry.customType === 'arsenal-spawn-manifest')).toHaveLength(1);
    // Custom entries stay out of LLM context, and no renderer is registered for them.
    expect(runtime.renderers).toEqual([]);
  });
});

describe('parent agent restoration', () => {
  it('restores a saved preference without appending another entry', () => {
    const selection = customEntry(PARENT_AGENT_CUSTOM_TYPE, { version: 1, agent: 'megamind' });
    const runtime = setup([selection]);
    expect(runtime.activation.parentAgentState.getPreferred()).toBe('megamind');
    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');
    expect(runtime.activeTools()).toContain('spawn');
    expect(runtime.entries).toEqual([selection]);
  });

  it('ignores parent-agent entries that exist inside a child session', () => {
    const runtime = setup([childIdentityEntry, customEntry(PARENT_AGENT_CUSTOM_TYPE, { version: 1, agent: 'megamind' })]);

    expect(runtime.activation.roleState.get().kind).toBe('child');
    expect(runtime.activation.parentAgentState.getPreferred()).toBe('default');
    expect(runtime.activation.parentAgentState.getActive()).toBe('default');
    expect(runtime.activeTools()).not.toContain('spawn');
  });
});
