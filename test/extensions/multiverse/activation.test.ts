import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { JsonValue } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../src/config/config-loader.ts';
import { PI_VIM_KEY_EVENT_ID } from '../../../src/extensions/multiverse/constants.ts';
import { registerMultiverse } from '../../../src/extensions/multiverse/multiverse.extension.ts';
import type { SpawnOrchestratorDependencies } from '../../../src/extensions/multiverse/orchestrator/spawn-orchestrator.ts';
import { SpawnProgress } from '../../../src/extensions/multiverse/tools/spawn/spawn-progress.ts';
import { MultiverseConfigSchema } from '../../../src/schemas/multiverse.config.schema.ts';
import { childInteraction } from './interaction-fixture.ts';

const source = (prompt: string) =>
  `---\nname: researcher\ntools: [read, missing, read]\nskills: [unknown]\nmetadata: ["Research lane"]\n---\n${prompt}`;
const userSource = (name: string, prompt: string, tools = '[read]', skills = '[]', metadata = '["user"]') =>
  `---\nname: ${name}\ntools: ${tools}\nskills: ${skills}\nmetadata: ${metadata}\n---\n${prompt}`;
const rosterNames = (prompt: string | undefined): string[] => {
  const section = prompt?.match(/<available_agents>([\s\S]*?)<\/available_agents>/)?.[1] ?? '';
  return [...section.matchAll(/<name>(.*?)<\/name>/g)].map(match => match[1] ?? '');
};
const identity = (agent = 'researcher', version = 1): SessionEntry => ({
  type: 'custom',
  id: 'identity',
  parentId: null,
  timestamp: '',
  customType: 'arsenal-subagent',
  data: { version, agent, parentSessionId: 'parent' },
});
/** Persisted spawn details are JSON; serialize the typed fixture so the entry carries a genuinely JSON-compatible value. */
const persistedJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));

const reference = (): SessionEntry => ({
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
    details: persistedJson({ version: 1, kind: 'spawn', interactions: [childInteraction({ agent: 'researcher' })] }),
  },
});

describe('Multiverse activation lifecycle', () => {
  let directory: string;
  let globalDirectory: string;
  let projectDirectory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'arsenal-activation-'));
    globalDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-global-'));
    projectDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-project-'));
    writeFileSync(path.join(directory, 'different-name.md'), source('original child prompt'));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    rmSync(globalDirectory, { recursive: true, force: true });
    rmSync(projectDirectory, { recursive: true, force: true });
  });

  const setup = (
    entries: SessionEntry[] = [],
    enabled = true,
    defaultAgent: 'default' | 'megamind' = 'megamind',
    options: { trusted?: boolean; projectAgentsDirectory?: string; globalAgentsDirectory?: string } = {},
  ) => {
    let config = MultiverseConfigSchema.parse({ enabled, defaultAgent });
    let active = ['read', 'external', 'spawn'];
    let branch: SessionEntry[] = [];
    let bound = false;
    const selections: string[][] = [];
    const notifications: string[] = [];
    const agentNameEvents: string[] = [];
    const executions: SpawnOrchestratorDependencies[] = [];
    const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();
    const vimHandlers = new Map<string, () => void>();
    let command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> } | undefined;
    let modalResult: unknown = { action: 'close' };
    let modalOpenCount = 0;
    let tool: { execute: (id: string, input: never, signal: undefined, update: undefined, ctx: ExtensionContext) => Promise<unknown> };
    const pi = {
      on: (name: string, handler: (event: never, ctx: ExtensionContext) => unknown) => handlers.set(name, handler),
      registerCommand: (_name: string, value: typeof command) => {
        command = value;
      },
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
      appendEntry: (customType: string, data: unknown) =>
        entries.push({ type: 'custom', id: `entry-${entries.length}`, parentId: null, timestamp: '', customType, data } as SessionEntry),
      events: {
        emit: (_name: string, payload: { agentName: string }) => agentNameEvents.push(payload.agentName),
        on: (name: string, handler: () => void) => vimHandlers.set(name, handler),
      },
    } as unknown as ExtensionAPI;
    const ctx = {
      mode: 'tui',
      cwd: '/tmp/project',
      model: { provider: 'one', id: 'model' },
      thinkingLevel: 'low',
      modelRegistry: {},
      isProjectTrusted: () => options.trusted ?? true,
      sessionManager: { getEntries: () => entries, getBranch: () => branch, getSessionId: () => 'parent' },
      ui: {
        notify: (message: string) => notifications.push(message),
        custom: () => {
          modalOpenCount++;
          return Promise.resolve(modalResult);
        },
      },
    } as unknown as ExtensionContext;
    const activation = registerMultiverse(pi, {
      config: { getMultiverse: () => config } as ConfigProvider,
      definitionsDirectory: directory,
      // Inject absent paths by default so the real global/project directories never leak into a test.
      projectAgentsDirectory: options.projectAgentsDirectory ?? path.join(directory, 'no-project-agents'),
      globalAgentsDirectory: options.globalAgentsDirectory ?? path.join(directory, 'no-global-agents'),
      spawnRun: async (_input, execution) => {
        executions.push(execution);
        return { interactions: [], progress: new SpawnProgress([]), aborted: false };
      },
    });
    bound = true;
    const start = () => handlers.get('session_start')?.({} as never, ctx);
    const turn = (sections: Record<string, string> = {}) => {
      const event = { systemPrompt: 'HOST', systemPromptOptions: { sections: { ...sections } } };
      const result = handlers.get('before_agent_start')?.(event as never, ctx) as { systemPrompt?: string } | undefined;
      return { result, contribution: event.systemPromptOptions.sections.orchestrator_role, sections: event.systemPromptOptions.sections };
    };
    const spawn = (agent = 'researcher') =>
      tool.execute('call', { context: 'shared', tasks: [{ action: 'create', agent, task: 'work' }] } as never, undefined, undefined, ctx);
    return {
      activation,
      ctx,
      selections,
      notifications,
      agentNameEvents,
      executions,
      entries,
      start,
      turn,
      spawn,
      command: () => command,
      hasHandler: (name: string) => handlers.has(name),
      vimHandlers,
      modalOpenCount: () => modalOpenCount,
      setModalResult: (result: unknown) => {
        modalResult = result;
      },
      active: () => active,
      setConfig: (next: typeof config) => {
        config = next;
      },
      setBranch: (next: SessionEntry[]) => {
        branch = next;
      },
    };
  };

  it('registers without runtime API calls and resolves availability after config initialization', async () => {
    const runtime = setup([], false);
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: true, defaultAgent: 'megamind', maxConcurrency: 2 }));
    runtime.start();
    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');
    expect(runtime.turn().contribution).toContain('<name>researcher</name>');
    await Bun.sleep(20);
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
    expect(first.contribution).toContain('<name>researcher</name>');
    expect(first.contribution).toContain('<tools>read, missing</tools>');
    expect(runtime.turn()).toEqual(first);
    await runtime.spawn();
    expect(runtime.executions[0]?.getSubAgent('researcher')?.agent.prompt).toBe('original child prompt');
    expect(runtime.selections).toHaveLength(mutations);
    expect(runtime.notifications).toHaveLength(1);
  });

  it('resolves available names independently in each fresh instance', () => {
    const available = setup();
    available.start();
    expect(available.activation.parentAgentState.getActive()).toBe('megamind');

    const unavailable = setup();
    unavailable.setConfig(
      MultiverseConfigSchema.parse({ enabled: true, defaultAgent: 'megamind', subagents: { researcher: { enabled: false } } }),
    );
    unavailable.start();
    expect(unavailable.activation.parentAgentState.getActive()).toBe('default');
    expect(unavailable.active()).not.toContain('spawn');
  });

  it('uses the registered child prompt and tool subset without per-turn mutation', () => {
    const runtime = setup([identity()]);
    runtime.start();
    expect(runtime.active()).toEqual(['read']);
    expect(runtime.turn().result).toEqual({ systemPrompt: 'original child prompt' });
    expect(runtime.turn().result).toEqual({ systemPrompt: 'original child prompt' });
    expect(runtime.selections).toHaveLength(1);
  });

  it('adopts updated files in a fresh child instance', () => {
    const old = setup([identity()]);
    old.start();
    writeFileSync(path.join(directory, 'different-name.md'), source('updated child prompt'));
    expect(old.turn().result?.systemPrompt).toBe('original child prompt');
    const fresh = setup([identity()]);
    fresh.start();
    expect(fresh.turn().result?.systemPrompt).toBe('updated child prompt');
  });

  it.each([identity(), identity('missing-agent'), identity('researcher', 2)])('ignores persisted child identity while disabled', async marker => {
    const entries = [marker];
    const runtime = setup(entries, false);
    runtime.start();
    expect(runtime.active()).toEqual(['read', 'external']);
    expect(runtime.turn().result).toBeUndefined();
    expect(runtime.notifications).toEqual([]);
    expect(entries).toEqual([marker]);
    await expect(runtime.spawn()).rejects.toThrow('eligible Megamind parent');
    expect(runtime.executions).toEqual([]);
  });

  it('restores child behavior in a fresh enabled instance', () => {
    const marker = identity();
    const disabled = setup([marker], false);
    disabled.start();
    expect(disabled.turn().result).toBeUndefined();

    const enabled = setup([marker], true);
    enabled.start();
    expect(enabled.active()).toEqual(['read']);
    expect(enabled.turn().result?.systemPrompt).toBe('original child prompt');
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
    expect(runtime.turn().result).toBeUndefined();
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

  it('registers command and Vim event only after enabled session activation', () => {
    const disabled = setup([], false);
    disabled.start();
    expect(disabled.command()).toBeUndefined();
    expect(disabled.hasHandler('before_agent_start')).toBe(false);
    expect(disabled.vimHandlers.has(PI_VIM_KEY_EVENT_ID)).toBe(false);

    const enabled = setup([], true, 'default');
    expect(enabled.command()).toBeUndefined();
    expect(enabled.hasHandler('before_agent_start')).toBe(false);
    enabled.start();
    expect(enabled.command()).toBeDefined();
    expect(enabled.hasHandler('before_agent_start')).toBe(true);
    expect(enabled.vimHandlers.has(PI_VIM_KEY_EVENT_ID)).toBe(true);
  });

  it('opens the same modal from the command and Vim key event', async () => {
    const runtime = setup([], true, 'default');
    runtime.start();
    await runtime.command()?.handler('', runtime.ctx);
    runtime.vimHandlers.get(PI_VIM_KEY_EVENT_ID)?.();
    await Bun.sleep(0);
    expect(runtime.modalOpenCount()).toBe(2);
  });

  it('applies a modal persona selection immediately for the next turn and persists it', async () => {
    const runtime = setup([], true, 'default');
    runtime.start();
    runtime.setModalResult({ action: 'select', agent: 'megamind' });
    await runtime.command()?.handler('', runtime.ctx);

    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');
    expect(runtime.active()).toContain('spawn');
    expect(runtime.turn().contribution).toContain('<name>researcher</name>');
    expect(runtime.entries.at(-1)).toMatchObject({
      customType: 'arsenal-parent-agent',
      data: { version: 1, agent: 'megamind' },
    });
    expect(runtime.agentNameEvents.at(-1)).toBe('MEGAMIND');

    runtime.setModalResult({ action: 'select', agent: 'default' });
    await runtime.command()?.handler('', runtime.ctx);
    expect(runtime.activation.parentAgentState.getActive()).toBe('default');
    expect(runtime.active()).not.toContain('spawn');
    const defaultTurn = runtime.turn({ orchestrator_role: 'STALE' });
    expect(defaultTurn.result).toBeUndefined();
    expect(defaultTurn.sections.orchestrator_role).toBeUndefined();
  });

  it('selects presets independently of persona, snapshots them per spawn call, and resets on session start', async () => {
    const runtime = setup([], true, 'megamind');
    const settings = MultiverseConfigSchema.parse({
      enabled: true,
      defaultAgent: 'megamind',
      subagents: { researcher: { model: { provider: 'base', modelId: 'base-model', reasoning: 'low' } } },
    });
    Object.assign(settings, {
      defaultPreset: 'smart',
      presets: { smart: { researcher: { modelId: 'smart-model', reasoning: 'high' } } },
    });
    runtime.setConfig(settings);
    runtime.start();

    await runtime.spawn();
    expect(runtime.executions[0]?.subagentModel('researcher')).toEqual({ provider: 'base', modelId: 'smart-model', reasoning: 'high' });

    const entriesBefore = runtime.entries.length;
    runtime.setModalResult({ action: 'select-preset', selection: { kind: 'baseline' } });
    await runtime.command()?.handler('', runtime.ctx);
    expect(runtime.activation.parentAgentState.getActive()).toBe('megamind');
    expect(runtime.entries).toHaveLength(entriesBefore);
    await runtime.spawn();
    expect(runtime.executions[1]?.subagentModel('researcher')).toEqual({ provider: 'base', modelId: 'base-model', reasoning: 'low' });
    // The first call retains its composed settings after the selection changes.
    expect(runtime.executions[0]?.subagentModel('researcher')?.modelId).toBe('smart-model');

    runtime.start();
    await runtime.spawn();
    expect(runtime.executions[2]?.subagentModel('researcher')?.modelId).toBe('smart-model');

    // A selection whose configured entry disappears resolves to baseline, not defaultPreset.
    Object.assign(settings, {
      presets: {
        smart: { researcher: { modelId: 'smart-model', reasoning: 'high' } },
        fast: { researcher: { modelId: 'fast-model' } },
      },
    });
    runtime.setModalResult({ action: 'select-preset', selection: { kind: 'named', name: 'fast' } });
    await runtime.command()?.handler('', runtime.ctx);
    Object.assign(settings, { presets: { smart: { researcher: { modelId: 'smart-model', reasoning: 'high' } } } });
    await runtime.spawn();
    expect(runtime.executions[3]?.subagentModel('researcher')).toEqual({ provider: 'base', modelId: 'base-model', reasoning: 'low' });
  });

  it('uses the provider directly for the spawn execution guard', async () => {
    const runtime = setup();
    runtime.start();
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: false }));
    await expect(runtime.spawn()).rejects.toThrow('eligible Megamind parent');
  });

  it('registers a definition discovered in the global agents directory', async () => {
    writeFileSync(path.join(globalDirectory, 'reviewer.md'), userSource('reviewer', 'GLOBAL REVIEWER PROMPT'));
    const runtime = setup([], true, 'megamind', { globalAgentsDirectory: globalDirectory });
    runtime.start();

    expect(rosterNames(runtime.turn().contribution)).toContain('reviewer');
    await runtime.spawn('reviewer');
    expect(runtime.executions[0]?.getSubAgent('reviewer')?.agent.prompt).toBe('GLOBAL REVIEWER PROMPT');
  });

  it('registers a project definition only when the project is trusted', () => {
    writeFileSync(path.join(projectDirectory, 'projector.md'), userSource('projector', 'PROJECT PROMPT'));

    const trusted = setup([], true, 'megamind', { trusted: true, projectAgentsDirectory: projectDirectory });
    trusted.start();
    expect(rosterNames(trusted.turn().contribution)).toContain('projector');

    const untrusted = setup([], true, 'megamind', { trusted: false, projectAgentsDirectory: projectDirectory });
    untrusted.start();
    expect(rosterNames(untrusted.turn().contribution)).not.toContain('projector');
  });

  it('registers global agents while an untrusted project contributes nothing', () => {
    writeFileSync(path.join(globalDirectory, 'reviewer.md'), userSource('reviewer', 'GLOBAL PROMPT'));
    writeFileSync(path.join(projectDirectory, 'projector.md'), userSource('projector', 'PROJECT PROMPT'));
    const runtime = setup([], true, 'megamind', {
      trusted: false,
      projectAgentsDirectory: projectDirectory,
      globalAgentsDirectory: globalDirectory,
    });
    runtime.start();

    const names = rosterNames(runtime.turn().contribution);
    expect(names).toContain('reviewer');
    expect(names).not.toContain('projector');
  });

  it('registers exactly the bundled roster with no warning when both user directories are absent', () => {
    const runtime = setup();
    runtime.start();
    expect(rosterNames(runtime.turn().contribution)).toEqual(['researcher']);
    // The only diagnostic is the bundled definition's unknown tool; absent directories stay silent.
    expect(runtime.notifications.join('\n')).not.toContain('unable to discover');
  });

  it('reports a discovery problem once and never repeats it per turn or spawn call', async () => {
    writeFileSync(path.join(globalDirectory, 'broken.md'), 'not a definition');
    const runtime = setup([], true, 'megamind', { globalAgentsDirectory: globalDirectory });
    runtime.start();
    const problems = () => runtime.notifications.filter(message => message.includes('broken.md'));
    expect(problems()).toHaveLength(1);

    runtime.turn();
    runtime.turn();
    await runtime.spawn('researcher');
    // A later session_start reuses the already-activated instance and must not re-report either.
    runtime.start();
    runtime.turn();
    expect(problems()).toHaveLength(1);
  });

  it('offers a registered global agent to the parent roster and to spawn validation', async () => {
    writeFileSync(
      path.join(globalDirectory, 'reviewer.md'),
      userSource('reviewer', 'REVIEWER PROMPT', '[read, external]', '[review]', '["Lane: review", "Reviews diffs"]'),
    );
    const runtime = setup([], true, 'megamind', { globalAgentsDirectory: globalDirectory });
    runtime.start();

    const prompt = runtime.turn().contribution ?? '';
    expect(prompt).toContain('<name>reviewer</name>');
    expect(prompt).toContain('     - Lane: review');
    expect(prompt).toContain('     - Reviews diffs');
    expect(prompt).toContain('<tools>read, external</tools>');
    expect(prompt).toContain('<skills>review</skills>');

    await runtime.spawn('reviewer');
    expect(runtime.executions[0]?.getSubAgent('reviewer')?.agent.prompt).toBe('REVIEWER PROMPT');
    // The roster, not a hardcoded enum, gates creation.
    await expect(runtime.spawn('ghost')).rejects.toThrow('unavailable agent');
  });

  it('governs a user agent through the settings map without deleting its file', () => {
    const reviewerFile = path.join(globalDirectory, 'reviewer.md');
    writeFileSync(reviewerFile, userSource('reviewer', 'REVIEWER PROMPT'));
    const runtime = setup([], true, 'megamind', { globalAgentsDirectory: globalDirectory });
    runtime.setConfig(MultiverseConfigSchema.parse({ enabled: true, defaultAgent: 'megamind', subagents: { reviewer: { enabled: false } } }));
    runtime.start();

    const names = rosterNames(runtime.turn().contribution);
    expect(names).toContain('researcher');
    expect(names).not.toContain('reviewer');
    expect(existsSync(reviewerFile)).toBe(true);
  });
});
