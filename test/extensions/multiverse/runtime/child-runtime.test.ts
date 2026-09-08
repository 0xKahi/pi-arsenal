import { describe, expect, it } from 'bun:test';
import type { Api, Model } from '@earendil-works/pi-ai';
import {
  type AgentSessionEvent,
  type createAgentSession,
  type DefaultResourceLoader,
  SessionManager,
  type Skill,
} from '@earendil-works/pi-coding-agent';
import type { SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import {
  ChildRuntime,
  type ModelResolutionRegistry,
  type RunChildInteractionInput,
} from '../../../../src/extensions/multiverse/runtime/child-runtime.ts';

const definition: SubagentDefinition = {
  name: 'explorer',
  tools: ['read'],
  skills: [],
  metadata: ['Lane: test lane'],
  prompt: 'child prompt',
  filePath: '/tmp/explorer.md',
};

const skill = (name: string) => ({ name }) as Skill;

// --- model resolution -------------------------------------------------

const model = (provider: string, id: string) => ({ provider, id, name: id }) as Model<Api>;

const registry = (
  models: Model<Api>[],
  auth: Record<string, { ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string }>,
): ModelResolutionRegistry => ({
  find: (provider, modelId) => models.find(item => item.provider === provider && item.id === modelId),
  getApiKeyAndHeaders: async candidate => auth[`${candidate.provider}/${candidate.id}`] ?? { ok: false, error: 'no auth' },
});

describe('ChildRuntime.resolveModel', () => {
  it('prefers an authenticated configured model', async () => {
    const configured = model('configured-provider', 'configured-model');
    const parent = model('parent-provider', 'parent-model');

    const result = await ChildRuntime.resolveModel({
      configured: { provider: configured.provider, modelId: configured.id },
      parentModel: parent,
      registry: registry([configured], {
        'configured-provider/configured-model': { ok: true, apiKey: 'secret' },
        'parent-provider/parent-model': { ok: true, apiKey: 'parent' },
      }),
    });

    expect(result).toMatchObject({ success: true, model: configured, failures: [] });
  });

  it('accepts header-authenticated and keyless configured providers', async () => {
    const headerModel = model('header-provider', 'header-model');
    const headerResult = await ChildRuntime.resolveModel({
      configured: { provider: headerModel.provider, modelId: headerModel.id },
      registry: registry([headerModel], { 'header-provider/header-model': { ok: true, headers: { Authorization: 'signed' } } }),
    });
    expect(headerResult.success).toBe(true);

    const keylessModel = model('local', 'keyless');
    const keylessResult = await ChildRuntime.resolveModel({
      configured: { provider: keylessModel.provider, modelId: keylessModel.id },
      registry: registry([keylessModel], { 'local/keyless': { ok: true } }),
    });
    expect(keylessResult.success).toBe(true);
  });

  it('falls back to the parent model after configured lookup or authentication failure', async () => {
    const configured = model('configured', 'broken');
    const parent = model('parent', 'working');
    const result = await ChildRuntime.resolveModel({
      configured: { provider: configured.provider, modelId: configured.id },
      parentModel: parent,
      registry: registry([configured], {
        'configured/broken': { ok: false, error: 'expired token' },
        'parent/working': { ok: true, apiKey: 'parent-key' },
      }),
    });

    expect(result).toMatchObject({ success: true, model: parent });
    if (result.success) expect(result.failures.join('\n')).toContain('expired token');
  });

  it('inherits omitted configured fields from the parent model', async () => {
    const configured = model('parent-provider', 'alternate');
    const parent = model('parent-provider', 'parent-model');
    const result = await ChildRuntime.resolveModel({
      configured: { modelId: 'alternate' },
      parentModel: parent,
      registry: registry([configured], { 'parent-provider/alternate': { ok: true } }),
    });

    expect(result).toMatchObject({ success: true, model: configured });
  });

  it('returns accumulated reasons when no candidate works', async () => {
    const parent = model('parent', 'broken');
    const result = await ChildRuntime.resolveModel({
      configured: { provider: 'missing', modelId: 'unknown' },
      parentModel: parent,
      registry: registry([], { 'parent/broken': { ok: false, error: 'missing credential' } }),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('missing/unknown was not found');
      expect(result.error).toContain('parent/broken authentication failed');
      expect(result.error).toContain('missing credential');
    }
  });
});

// --- reasoning resolution ---------------------------------------------

const reasoningModel = (reasoning: boolean, thinkingLevelMap?: Model<Api>['thinkingLevelMap']) => ({ reasoning, thinkingLevelMap }) as Model<Api>;

describe('ChildRuntime.resolveReasoning', () => {
  it('prefers configured reasoning over the parent level', () => {
    expect(ChildRuntime.resolveReasoning(reasoningModel(true), 'low', 'high')).toBe('low');
  });

  it('inherits the parent level when no subagent reasoning is configured', () => {
    expect(ChildRuntime.resolveReasoning(reasoningModel(true), undefined, 'high')).toBe('high');
  });

  it('clamps an unsupported high request instead of failing', () => {
    const selected = reasoningModel(true, { high: null, xhigh: null, max: null });
    expect(ChildRuntime.resolveReasoning(selected, 'max', undefined)).toBe('medium');
  });

  it('uses off for a model without reasoning support', () => {
    expect(ChildRuntime.resolveReasoning(reasoningModel(false), 'max', 'high')).toBe('off');
  });
});

// --- one interaction ---------------------------------------------------

interface RuntimeState {
  listeners: Array<(event: AgentSessionEvent) => void>;
  disposed: boolean;
  aborted: boolean;
  events: AgentSessionEvent[];
  promptText: string[];
  leafAtCreation?: string | null;
  onPrompt?: () => void | Promise<void>;
}

type LoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];
type SessionOptions = NonNullable<Parameters<typeof createAgentSession>[0]>;

const agentEnd = (texts: string[]): AgentSessionEvent =>
  ({
    type: 'agent_end',
    messages: [{ role: 'assistant', content: texts.map(text => ({ type: 'text', text })) }],
  }) as unknown as AgentSessionEvent;

/** Builds a ChildRuntime whose SDK seams are stubbed, plus the records those seams captured. */
const stubbedRuntime = (state: RuntimeState, sessionManager: SessionManager, agentDir = '/tmp/agent') => {
  const trace: string[] = [];
  const loaderOptions: LoaderOptions[] = [];
  const loaders: DefaultResourceLoader[] = [];
  const sessionOptions: SessionOptions[] = [];

  const runtime = new ChildRuntime({
    agentDir,
    createResourceLoader: options => {
      const index = loaderOptions.length;
      loaderOptions.push(options);
      const loader = {
        reload: async () => {
          trace.push(`reload-${index}`);
        },
      } as DefaultResourceLoader;
      loaders.push(loader);
      return loader;
    },
    createSession: (async options => {
      sessionOptions.push(options ?? ({} as SessionOptions));
      trace.push(`create-${sessionOptions.length - 1}`);
      // Recorded at construction time to prove the checkpoint is selected first.
      state.leafAtCreation = sessionManager.getLeafId();
      return {
        session: {
          subscribe(listener: (event: AgentSessionEvent) => void) {
            state.listeners.push(listener);
            return () => {
              state.listeners = state.listeners.filter(candidate => candidate !== listener);
            };
          },
          prompt: async (text: string) => {
            state.promptText.push(text);
            await state.onPrompt?.();
            for (const event of state.events) for (const listener of [...state.listeners]) listener(event);
          },
          abort: async () => {
            state.aborted = true;
          },
          getSessionStats: () => ({ assistantMessages: 2, tokens: { input: 11, output: 7 }, cost: 0.5 }),
          dispose: () => {
            state.disposed = true;
          },
        } as never,
        extensionsResult: {},
      } as unknown as Awaited<ReturnType<typeof createAgentSession>>;
    }) as typeof createAgentSession,
  });

  return { runtime, trace, loaderOptions, loaders, sessionOptions };
};

const scenario = () => {
  const sessionManager = SessionManager.inMemory('/tmp/project');
  sessionManager.appendMessage({ role: 'user', content: 'prior', timestamp: Date.now() });
  sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'prior answer' }],
    api: 'openai-completions',
    provider: 'openai',
    model: 'model',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop',
    timestamp: Date.now(),
  });
  const state: RuntimeState = { listeners: [], disposed: false, aborted: false, promptText: [], events: [agentEnd(['first', 'second'])] };
  const input: RunChildInteractionInput = {
    cwd: '/tmp/project',
    definition,
    sessionManager,
    model: { provider: 'provider', id: 'model' } as never,
    thinkingLevel: 'medium',
    prompt: 'follow up',
  };
  return { input, state, sessionManager };
};

describe('ChildRuntime construction', () => {
  it('creates and reloads a fresh resource loader and SDK session per interaction', async () => {
    const runner = scenario();
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    await stub.runtime.run(runner.input);
    await stub.runtime.run(runner.input);

    expect(stub.trace).toEqual(['reload-0', 'create-0', 'reload-1', 'create-1']);
    expect(stub.loaders[0]).not.toBe(stub.loaders[1]);
    expect(stub.sessionOptions[0]?.resourceLoader).toBe(stub.loaders[0]);
    expect(stub.sessionOptions[1]?.resourceLoader).toBe(stub.loaders[1]);
    expect(stub.sessionOptions[0]).toMatchObject({
      cwd: '/tmp/project',
      agentDir: '/tmp/agent',
      sessionManager: runner.sessionManager,
      thinkingLevel: 'medium',
      tools: ['read'],
    });
    expect(stub.sessionOptions[0]?.model).toBe(runner.input.model);
    expect(stub.loaderOptions[0]?.noExtensions).not.toBe(true);
  });

  it('fully replaces the host prompt and filters ambient skills to the declared subset', async () => {
    const runner = scenario();
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    await stub.runtime.run({ ...runner.input, definition: { ...definition, skills: ['pdf'] } });

    const policy = stub.loaderOptions[0];
    expect(policy?.systemPromptOverride?.('host prompt')).toBe('child prompt');
    expect(policy?.appendSystemPromptOverride?.(['project', 'cli'])).toEqual([]);
    expect(policy?.noContextFiles).toBe(true);
    expect(policy?.skillsOverride?.({ skills: [skill('search'), skill('pdf')], diagnostics: [] })?.skills.map(item => item.name)).toEqual(['pdf']);
    expect(policy?.skillsOverride?.({ skills: [skill('search')], diagnostics: [] })?.skills).toEqual([]);
  });

  it('declares no skills by default, so every ambient skill is filtered out', async () => {
    const runner = scenario();
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    await stub.runtime.run(runner.input);

    expect(stub.loaderOptions[0]?.skillsOverride?.({ skills: [skill('search'), skill('pdf')], diagnostics: [] })?.skills).toEqual([]);
  });
});

describe('ChildRuntime.run', () => {
  it('subscribes, prompts, records checkpoints and telemetry, unsubscribes, and disposes', async () => {
    const runner = scenario();
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    const result = await stub.runtime.run(runner.input);

    expect(result.status).toBe('success');
    expect(result.text).toBe('first\nsecond');
    expect(result.checkpointAfter).toBe(runner.sessionManager.getLeafId() ?? 'fallback');
    expect(result.telemetry).toMatchObject({ requests: 2, tokensInput: 11, tokensOutput: 7, cost: 0.5, model: 'provider/model' });
    expect(runner.state.disposed).toBe(true);
    expect(runner.state.listeners).toEqual([]);
  });

  it('selects the requested checkpoint before the runtime is constructed', async () => {
    const runner = scenario();
    const stub = stubbedRuntime(runner.state, runner.sessionManager);
    const firstEntry = runner.sessionManager.getEntries()[0]?.id as string;

    const result = await stub.runtime.run({ ...runner.input, checkpoint: firstEntry });

    expect(runner.state.leafAtCreation).toBe(firstEntry);
    expect(result.checkpointBefore).toBe(firstEntry);
  });

  it('rejects a checkpoint that does not exist without creating a runtime', async () => {
    const runner = scenario();
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    await expect(stub.runtime.run({ ...runner.input, checkpoint: 'missing' })).rejects.toThrow('does not exist');
    expect(runner.state.leafAtCreation).toBeUndefined();
    expect(stub.trace).toEqual([]);
  });

  it('reports a failed turn as a terminal failure instead of empty success', async () => {
    const runner = scenario();
    runner.state.onPrompt = () => {
      throw new Error('prompt failed');
    };
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    const result = await stub.runtime.run(runner.input);

    expect(result.status).toBe('failure');
    expect(result.error).toBe('prompt failed');
    expect(runner.state.disposed).toBe(true);
    expect(runner.state.listeners).toEqual([]);
  });

  it('propagates abort to the running child and reports the aborted state', async () => {
    const runner = scenario();
    const controller = new AbortController();
    runner.state.onPrompt = async () => {
      controller.abort();
      await new Promise(resolve => setTimeout(resolve, 0));
    };
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    const result = await stub.runtime.run({ ...runner.input, signal: controller.signal });

    expect(runner.state.aborted).toBe(true);
    expect(result.status).toBe('aborted');
    expect(result.checkpointAfter).not.toBeUndefined();
    expect(runner.state.disposed).toBe(true);
  });

  it('never prompts when the signal is already aborted', async () => {
    const runner = scenario();
    const controller = new AbortController();
    controller.abort();
    const stub = stubbedRuntime(runner.state, runner.sessionManager);

    const result = await stub.runtime.run({ ...runner.input, signal: controller.signal });

    expect(runner.state.promptText).toEqual([]);
    expect(result.status).toBe('aborted');
    expect(runner.state.disposed).toBe(true);
  });
});
