import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ExtensionAPI, ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../src/config/config-loader.ts';
import { registerMultiverse } from '../../../src/extensions/multiverse/multiverse.extension.ts';
import type { SpawnOrchestratorDependencies } from '../../../src/extensions/multiverse/orchestrator/spawn-orchestrator.ts';
import { SpawnProgress } from '../../../src/extensions/multiverse/tools/spawn/spawn-progress.ts';
import { MultiverseConfigSchema } from '../../../src/schemas/multiverse.config.schema.ts';
import { childInteraction } from './interaction-fixture.ts';

const source = (prompt: string) =>
  `---\nname: researcher\ntools: [read, missing, read]\nskills: [unknown]\nmetadata: ["Research lane"]\n---\n${prompt}`;
const identity = (agent = 'researcher', version = 1): SessionEntry => ({
  type: 'custom',
  id: 'identity',
  parentId: null,
  timestamp: '',
  customType: 'arsenal-subagent',
  data: { version, agent, parentSessionId: 'parent' },
});
const reference = (): SessionEntry =>
  ({
    type: 'message',
    id: 'result',
    parentId: null,
    timestamp: '',
    message: {
      role: 'toolResult',
      toolName: 'spawn',
      toolCallId: 'call',
      content: [],
      isError: false,
      timestamp: 0,
      details: { version: 1, kind: 'spawn', interactions: [childInteraction({ agent: 'researcher' })] },
    },
  }) as SessionEntry;

describe('Multiverse activation lifecycle', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'arsenal-activation-'));
    writeFileSync(path.join(directory, 'different-name.md'), source('original child prompt'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const setup = (entries: SessionEntry[] = [], enabled = true, defaultAgent: 'default' | 'megamind' = 'megamind') => {
    let config = MultiverseConfigSchema.parse({ enabled, defaultAgent });
    let active = ['read', 'external', 'spawn'];
    let branch: SessionEntry[] = [];
    let bound = false;
    const selections: string[][] = [];
    const notifications: string[] = [];
    const agentNameEvents: string[] = [];
    const executions: SpawnOrchestratorDependencies[] = [];
    const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
    let tool: { execute: (id: string, input: never, signal: undefined, update: undefined, ctx: ExtensionContext) => Promise<unknown> };
    const pi = {
      on: (name: string, handler: (event: never, ctx: ExtensionContext) => unknown) => handlers.set(name, handler),
      registerTool: (value: typeof tool) => {
        tool = value;
      },
      getAllTools: () => {
        if (!bound) throw new Error('runtime API called during factory load');
        return ['read', 'external', 'spawn'].map(name => ({ name }));
      },
      getActiveTools: () => active,
      setActiveTools: (names: string[]) => {
        active = names;
        selections.push(names);
      },
      appendEntry: () => {},
      events: { emit: (_name: string, payload: { agentName: string }) => agentNameEvents.push(payload.agentName) },
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: '/tmp/project',
      model: { provider: 'one', id: 'model' },
      thinkingLevel: 'low',
      modelRegistry: {},
      sessionManager: { getEntries: () => entries, getBranch: () => branch, getSessionId: () => 'parent' },
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionContext;
    const activation = registerMultiverse(pi, {
      config: { getMultiverse: () => config } as ConfigProvider,
      definitionsDirectory: directory,
      spawnRun: async (_input, execution) => {
        executions.push(execution);
        return { interactions: [], progress: new SpawnProgress([]), aborted: false };
      },
    });
    bound = true;
    const start = () => handlers.get('session_start')?.({} as never, ctx);
    const turn = () => handlers.get('before_agent_start')?.({ systemPrompt: 'HOST' } as never, ctx) as { systemPrompt: string } | undefined;
    const spawn = (agent = 'researcher') =>
      tool.execute('call', { context: 'shared', tasks: [{ action: 'create', agent, task: 'work' }] } as never, undefined, undefined, ctx);
    return {
      activation,
      ctx,
      selections,
      notifications,
      agentNameEvents,
      executions,
      start,
      turn,
      spawn,
      active: () => active,
      setConfig: (next: typeof config) => {
        config = next;
      },
      setBranch: (next: SessionEntry[]) => {
        branch = next;
      },
    };
  };

  it('registers without runtime API calls and resolves availability after config initialization', () => {
    const runtime = setup([], false);
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: true, defaultAgent: 'megamind', maxConcurrency: 2 }));
    runtime.start();
    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');
    expect(runtime.turn()?.systemPrompt).toContain('runs 2 of them at a time');
    expect(runtime.agentNameEvents).toEqual(['MEGAMIND']);
  });

  it('warns once about unknown tools, ignores unknown skills, and reuses definitions for turns/spawn', async () => {
    const runtime = setup();
    runtime.start();
    expect(runtime.notifications).toHaveLength(1);
    expect(runtime.notifications[0]).toContain('unknown tools: missing');
    expect(runtime.notifications[0]).toContain('different-name.md');
    writeFileSync(path.join(directory, 'different-name.md'), 'now invalid');
    const mutations = runtime.selections.length;
    const first = runtime.turn();
    expect(first?.systemPrompt).toContain('@researcher');
    expect(first?.systemPrompt).not.toContain('- Tools:');
    expect(runtime.turn()).toEqual(first);
    await runtime.spawn();
    expect(runtime.executions[0]?.getSubAgent('researcher')?.agent.prompt).toBe('original child prompt');
    expect(runtime.selections).toHaveLength(mutations);
    expect(runtime.notifications).toHaveLength(1);
  });

  it('resets available names only at session start without rereading definitions', () => {
    const runtime = setup();
    runtime.start();
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: true, defaultAgent: 'megamind', subagents: { researcher: { enabled: false } } }));
    runtime.start();
    expect(runtime.activation.parentAgentState.getActive()).toBe('default');
    expect(runtime.active()).not.toContain('spawn');
  });

  it('uses the registered child prompt and tool subset without per-turn mutation', () => {
    const runtime = setup([identity()]);
    runtime.start();
    expect(runtime.active()).toEqual(['read']);
    expect(runtime.turn()).toEqual({ systemPrompt: 'original child prompt' });
    expect(runtime.turn()).toEqual({ systemPrompt: 'original child prompt' });
    expect(runtime.selections).toHaveLength(1);
  });

  it('adopts updated files in a fresh child instance', () => {
    const old = setup([identity()]);
    old.start();
    writeFileSync(path.join(directory, 'different-name.md'), source('updated child prompt'));
    expect(old.turn()?.systemPrompt).toBe('original child prompt');
    const fresh = setup([identity()]);
    fresh.start();
    expect(fresh.turn()?.systemPrompt).toBe('updated child prompt');
  });

  it.each([identity(), identity('missing-agent'), identity('researcher', 2)])('ignores persisted child identity while disabled', async marker => {
    const entries = [marker];
    const runtime = setup(entries, false);
    runtime.start();
    expect(runtime.active()).toEqual(['read', 'external']);
    expect(runtime.turn()).toBeUndefined();
    expect(runtime.notifications).toEqual([]);
    expect(entries).toEqual([marker]);
    await expect(runtime.spawn()).rejects.toThrow('eligible Megamind parent');
    expect(runtime.executions).toEqual([]);
  });

  it('restores child behavior on an enabled activation', () => {
    const runtime = setup([identity()], false);
    runtime.start();
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: true }));
    runtime.start();
    expect(runtime.active()).toEqual(['read']);
    expect(runtime.turn()?.systemPrompt).toBe('original child prompt');
  });

  it.each([identity('unregistered'), identity('researcher', 2)])('reports invalid/unavailable children during activation', marker => {
    const runtime = setup([marker]);
    runtime.start();
    expect(runtime.active()).toEqual([]);
    const notifications = runtime.notifications.length;
    expect(notifications).toBeGreaterThan(1);
    runtime.turn();
    expect(runtime.notifications).toHaveLength(notifications);
  });

  it('rejects disabled registered children without activating parent behavior', () => {
    const runtime = setup([identity()]);
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: true, subagents: { researcher: { enabled: false } } }));
    runtime.start();
    expect(runtime.active()).toEqual([]);
    expect(runtime.notifications.join('\n')).toContain('disabled');
    expect(runtime.turn()).toBeUndefined();
  });

  it('refuses spawn from Default parents and enabled children', async () => {
    for (const runtime of [setup([], true, 'default'), setup([identity()])]) {
      runtime.start();
      await expect(runtime.spawn()).rejects.toThrow('eligible Megamind parent');
      expect(runtime.executions).toEqual([]);
    }
  });

  it('reads current config/model/reasoning and active branch at execution, not activation', async () => {
    const runtime = setup([reference()]);
    runtime.start();
    Object.assign(runtime.ctx, { model: { provider: 'two', id: 'changed' }, thinkingLevel: 'high' });
    runtime.setConfig(
      MultiverseConfigSchema.parse({ enabled: true, maxConcurrency: 3, subagents: { researcher: { model: { modelId: 'custom' } } } }),
    );
    expect(runtime.turn()?.systemPrompt).toContain('runs 3 of them at a time');
    await runtime.spawn();
    const execution = runtime.executions[0]!;
    expect(execution.model.provider).toBe('two');
    expect(execution.thinkingLevel).toBe('high');
    expect(execution.maxConcurrency).toBe(3);
    expect(execution.subagentModel('researcher')?.modelId).toBe('custom');
    expect(execution.resolveContinuation('child-1')).toBeUndefined();
    runtime.setBranch([reference()]);
    await runtime.spawn();
    expect(runtime.executions[1]?.resolveContinuation('child-1')?.agent).toBe('researcher');
  });

  it('uses the provider directly for disabled guards after activation', async () => {
    const runtime = setup();
    runtime.start();
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: false }));
    expect(runtime.turn()).toBeUndefined();
    await expect(runtime.spawn()).rejects.toThrow('eligible Megamind parent');
  });
});
