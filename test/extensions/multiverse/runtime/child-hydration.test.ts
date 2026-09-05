import { describe, expect, it } from 'bun:test';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { type createAgentSession, type DefaultResourceLoader, SessionManager } from '@earendil-works/pi-coding-agent';
import type { SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { type HydrateChildInput, hydrateChildInteraction } from '../../../../src/extensions/multiverse/runtime/child-hydration.ts';
import type { ChildRuntimeFactories } from '../../../../src/extensions/multiverse/runtime/child-runtime.ts';

const definition: SubagentDefinition = {
  name: 'explorer',
  tools: ['read'],
  skills: [],
  metadata: ['Lane: test lane'],
  prompt: 'child prompt',
  filePath: '/tmp/explorer.md',
};

interface RuntimeState {
  listeners: Array<(event: AgentSessionEvent) => void>;
  disposed: boolean;
  aborted: boolean;
  events: AgentSessionEvent[];
  promptText: string[];
  leafAtCreation?: string | null;
  onPrompt?: () => void | Promise<void>;
}

const agentEnd = (texts: string[]): AgentSessionEvent =>
  ({
    type: 'agent_end',
    messages: [{ role: 'assistant', content: texts.map(text => ({ type: 'text', text })) }],
  }) as unknown as AgentSessionEvent;

const makeFactories = (state: RuntimeState, sessionManager: SessionManager): ChildRuntimeFactories => ({
  createResourceLoader: _options => ({ reload: async () => {} }) as DefaultResourceLoader,
  createSession: async _options => {
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
  },
});

const run = () => {
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
  const input: HydrateChildInput = {
    cwd: '/tmp/project',
    definition,
    sessionManager,
    model: { provider: 'provider', id: 'model' } as never,
    thinkingLevel: 'medium',
    prompt: 'follow up',
  };
  return { input, state, sessionManager };
};

describe('hydrateChildInteraction', () => {
  it('subscribes, prompts, records checkpoints and telemetry, unsubscribes, and disposes', async () => {
    const runtime = run();

    const result = await hydrateChildInteraction(runtime.input, makeFactories(runtime.state, runtime.sessionManager));

    expect(result.status).toBe('success');
    expect(result.text).toBe('first\nsecond');
    expect(result.checkpointAfter).toBe(runtime.sessionManager.getLeafId() ?? 'fallback');
    expect(result.telemetry).toMatchObject({ requests: 2, tokensInput: 11, tokensOutput: 7, cost: 0.5, model: 'provider/model' });
    expect(runtime.state.disposed).toBe(true);
    expect(runtime.state.listeners).toEqual([]);
  });

  it('selects the requested checkpoint before the runtime is constructed', async () => {
    const runtime = run();
    const firstEntry = runtime.sessionManager.getEntries()[0]?.id as string;

    const result = await hydrateChildInteraction({ ...runtime.input, checkpoint: firstEntry }, makeFactories(runtime.state, runtime.sessionManager));

    expect(runtime.state.leafAtCreation).toBe(firstEntry);
    expect(result.checkpointBefore).toBe(firstEntry);
  });

  it('rejects a checkpoint that does not exist without creating a runtime', async () => {
    const runtime = run();

    await expect(
      hydrateChildInteraction({ ...runtime.input, checkpoint: 'missing' }, makeFactories(runtime.state, runtime.sessionManager)),
    ).rejects.toThrow('does not exist');
    expect(runtime.state.leafAtCreation).toBeUndefined();
  });

  it('reports a failed turn as a terminal failure instead of empty success', async () => {
    const runtime = run();
    runtime.state.onPrompt = () => {
      throw new Error('prompt failed');
    };

    const result = await hydrateChildInteraction(runtime.input, makeFactories(runtime.state, runtime.sessionManager));

    expect(result.status).toBe('failure');
    expect(result.error).toBe('prompt failed');
    expect(runtime.state.disposed).toBe(true);
    expect(runtime.state.listeners).toEqual([]);
  });

  it('propagates abort to the running child and reports the aborted state', async () => {
    const runtime = run();
    const controller = new AbortController();
    runtime.state.onPrompt = async () => {
      controller.abort();
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    const result = await hydrateChildInteraction(
      { ...runtime.input, signal: controller.signal },
      makeFactories(runtime.state, runtime.sessionManager),
    );

    expect(runtime.state.aborted).toBe(true);
    expect(result.status).toBe('aborted');
    expect(result.checkpointAfter).not.toBeUndefined();
    expect(runtime.state.disposed).toBe(true);
  });

  it('never prompts when the signal is already aborted', async () => {
    const runtime = run();
    const controller = new AbortController();
    controller.abort();

    const result = await hydrateChildInteraction(
      { ...runtime.input, signal: controller.signal },
      makeFactories(runtime.state, runtime.sessionManager),
    );

    expect(runtime.state.promptText).toEqual([]);
    expect(result.status).toBe('aborted');
    expect(runtime.state.disposed).toBe(true);
  });
});
