import { describe, expect, it } from 'bun:test';
import type { SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import type { SpawnOrchestratorDependencies } from '../../../../src/extensions/multiverse/orchestrator/spawn-orchestrator.ts';
import { runSpawn } from '../../../../src/extensions/multiverse/orchestrator/spawn-orchestrator.ts';
import { ChildAdmissionRegistry } from '../../../../src/extensions/multiverse/runtime/child-admission.ts';
import type { ChildInteractionOutcome } from '../../../../src/extensions/multiverse/runtime/child-hydration.ts';
import type { ChildSessionRepository } from '../../../../src/extensions/multiverse/runtime/child-session-repository.ts';
import { childInteraction } from '../interaction-fixture.ts';

const definition: SubagentDefinition = { name: 'fixer', tools: ['read'], skills: [], prompt: 'fixer prompt', filePath: '/tmp/fixer.md' };
const model = { provider: 'anthropic', id: 'model' } as never;

const outcome = (overrides: Partial<ChildInteractionOutcome> = {}): ChildInteractionOutcome => ({
  status: 'success',
  text: 'child output',
  checkpointBefore: null,
  checkpointAfter: 'leaf',
  observedPaths: [],
  telemetry: { durationMs: 1, requests: 1, tokensInput: 1, tokensOutput: 1, cost: 0 },
  ...overrides,
});

interface Harness {
  created: string[];
  opened: string[];
  prompts: string[];
  peak: number;
}

const makeDependencies = (
  harness: Harness,
  overrides: Partial<SpawnOrchestratorDependencies> = {},
  hydrateImpl?: (input: { prompt: string; checkpoint?: string | null; signal?: AbortSignal }) => Promise<ChildInteractionOutcome>,
): SpawnOrchestratorDependencies => {
  let active = 0;
  let nextChild = 0;
  const repository = {
    create: () => {
      const sessionId = `child-${++nextChild}`;
      harness.created.push(sessionId);
      return { sessionId, sessionFile: `/sessions/${sessionId}.jsonl`, sessionManager: { getEntry: () => ({}) } as never };
    },
    open: (_cwd: string, _parent: string, childSessionId: string) => {
      harness.opened.push(childSessionId);
      return { sessionId: childSessionId, sessionFile: `/sessions/${childSessionId}.jsonl`, sessionManager: { getEntry: () => ({}) } as never };
    },
  } as unknown as ChildSessionRepository;

  return {
    cwd: '/tmp/project',
    parentSessionId: 'parent-1',
    repository,
    admission: new ChildAdmissionRegistry(),
    maxConcurrency: 2,
    model,
    thinkingLevel: 'medium',
    registry: { find: () => model, getApiKeyAndHeaders: async () => ({ ok: true }) },
    subagentModel: () => undefined,
    subagentReasoning: () => undefined,
    resolveSubagent: () => ({ success: true, definition }),
    resolveContinuation: () => childInteraction({ checkpointAfter: 'prior-leaf' }),
    hydrate: (async input => {
      active++;
      harness.peak = Math.max(harness.peak, active);
      harness.prompts.push(input.prompt);
      try {
        return hydrateImpl ? await hydrateImpl(input) : outcome();
      } finally {
        active--;
      }
    }) as SpawnOrchestratorDependencies['hydrate'],
    ...overrides,
  };
};

const harness = (): Harness => ({ created: [], opened: [], prompts: [], peak: 0 });

describe('runSpawn', () => {
  it('creates children, passes shared context plus task text, and returns input order', async () => {
    const state = harness();

    const result = await runSpawn(
      {
        context: 'shared context',
        tasks: [
          { action: 'create', agent: 'fixer', task: 'first' },
          { action: 'create', agent: 'fixer', task: 'second' },
        ],
      },
      makeDependencies(state),
    );

    expect(state.created).toEqual(['child-1', 'child-2']);
    expect(state.prompts).toEqual(['shared context\n\nfirst', 'shared context\n\nsecond']);
    expect(result.interactions.map(interaction => interaction.taskIndex)).toEqual([0, 1]);
    expect(result.interactions.map(interaction => interaction.status)).toEqual(['success', 'success']);
    expect(result.interactions[0]?.body).toBe('child output');
  });

  it('continues an existing child from its latest branch checkpoint', async () => {
    const state = harness();
    const checkpoints: Array<string | null | undefined> = [];

    await runSpawn(
      { context: 'shared context', tasks: [{ action: 'continue', childSessionId: 'child-9', task: 'follow up' }] },
      makeDependencies(state, {}, async input => {
        checkpoints.push(input.checkpoint);
        return outcome();
      }),
    );

    expect(state.opened).toEqual(['child-9']);
    expect(checkpoints).toEqual(['prior-leaf']);
  });

  it('fails a continuation that is unreachable on the active branch without creating a child', async () => {
    const state = harness();

    const result = await runSpawn(
      { context: 'shared context', tasks: [{ action: 'continue', childSessionId: 'child-9', task: 'follow up' }] },
      makeDependencies(state, { resolveContinuation: () => undefined }),
    );

    expect(state.created).toEqual([]);
    expect(state.opened).toEqual([]);
    expect(result.interactions[0]).toMatchObject({ status: 'failure' });
    expect(result.interactions[0]?.error).toContain('not reachable on this branch');
  });

  it('shares one capacity pool across create and continue tasks', async () => {
    const state = harness();

    await runSpawn(
      {
        context: 'shared context',
        tasks: [
          { action: 'create', agent: 'fixer', task: 'a' },
          { action: 'continue', childSessionId: 'child-a', task: 'b' },
          { action: 'create', agent: 'fixer', task: 'c' },
          { action: 'continue', childSessionId: 'child-b', task: 'd' },
        ],
      },
      makeDependencies(state, { maxConcurrency: 2 }, async () => {
        await new Promise(resolve => setTimeout(resolve, 2));
        return outcome();
      }),
    );

    expect(state.peak).toBeLessThanOrEqual(2);
  });

  it('isolates a failing task and still settles every other task', async () => {
    const state = harness();

    const result = await runSpawn(
      {
        context: 'shared context',
        tasks: [
          { action: 'create', agent: 'fixer', task: 'ok' },
          { action: 'create', agent: 'fixer', task: 'boom' },
          { action: 'create', agent: 'fixer', task: 'ok too' },
        ],
      },
      makeDependencies(state, {}, async input => {
        if (input.prompt.endsWith('boom')) throw new Error('child exploded');
        return outcome();
      }),
    );

    expect(result.interactions.map(interaction => interaction.status)).toEqual(['success', 'failure', 'success']);
    expect(result.interactions[1]?.error).toBe('child exploded');
  });

  it('reports a subagent that is disabled or invalid without dispatching it', async () => {
    const state = harness();

    const result = await runSpawn(
      { context: 'shared context', tasks: [{ action: 'create', agent: 'fixer', task: 'x' }] },
      makeDependencies(state, { resolveSubagent: () => ({ success: false, error: 'Subagent "fixer" is currently disabled.' }) }),
    );

    expect(state.created).toEqual([]);
    expect(result.interactions[0]).toMatchObject({ status: 'failure', error: 'Subagent "fixer" is currently disabled.' });
  });

  it('fails a task whose model cannot be resolved instead of falling back silently', async () => {
    const state = harness();

    const result = await runSpawn(
      { context: 'shared context', tasks: [{ action: 'create', agent: 'fixer', task: 'x' }] },
      makeDependencies(state, {
        registry: { find: () => undefined, getApiKeyAndHeaders: async () => ({ ok: false, error: 'no key' }) },
      }),
    );

    expect(result.interactions[0]?.status).toBe('failure');
    expect(result.interactions[0]?.error).toContain('No usable model candidate');
  });

  it('marks queued tasks aborted while preserving already completed entries', async () => {
    const state = harness();
    const controller = new AbortController();

    const result = await runSpawn(
      {
        context: 'shared context',
        tasks: [
          { action: 'create', agent: 'fixer', task: 'first' },
          { action: 'create', agent: 'fixer', task: 'second' },
          { action: 'create', agent: 'fixer', task: 'third' },
        ],
      },
      makeDependencies(state, { maxConcurrency: 1 }, async () => {
        controller.abort();
        return outcome();
      }),
      { signal: controller.signal },
    );

    expect(result.aborted).toBe(true);
    expect(result.interactions.map(interaction => interaction.status)).toEqual(['success', 'aborted', 'aborted']);
  });

  it('publishes progress transitions without child body content', async () => {
    const state = harness();
    const snapshots: string[] = [];

    await runSpawn(
      { context: 'shared context', tasks: [{ action: 'create', agent: 'fixer', task: 'x', name: 'labelled' }] },
      makeDependencies(state),
      {
        onProgress: progress =>
          snapshots.push(
            progress
              .snapshot()
              .map(task => `${task.label}:${task.status}`)
              .join(','),
          ),
      },
    );

    expect(snapshots[0]).toBe('labelled:pending');
    expect(snapshots).toContain('labelled:running');
    expect(snapshots.at(-1)).toBe('labelled:success');
  });

  it('allows only one managed writer per child within a call', async () => {
    const state = harness();
    const admission = new ChildAdmissionRegistry();

    const result = await runSpawn(
      {
        context: 'shared context',
        tasks: [
          { action: 'continue', childSessionId: 'child-9', task: 'a' },
          { action: 'continue', childSessionId: 'child-9', task: 'b' },
        ],
      },
      makeDependencies(state, { admission, maxConcurrency: 2 }, async () => {
        await new Promise(resolve => setTimeout(resolve, 2));
        return outcome();
      }),
    );

    const failures = result.interactions.filter(interaction => interaction.status === 'failure');
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toContain('already has an active Multiverse writer');
  });
});
