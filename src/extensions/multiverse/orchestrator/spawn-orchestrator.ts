import type { Api, Model } from '@earendil-works/pi-ai';
import type { CurrentSubagentResult } from '../agents/current-subagent.ts';
import type { BundledSubagentName } from '../agents/subagent-definition.ts';
import { CHILD_INTERACTION_VERSION } from '../constants.ts';
import { type ChildInteraction, createInteractionId, resolveCheckpointAfter } from '../results/child-interaction.types.ts';
import { capOutput } from '../results/output-cap.ts';
import type { ChildAdmissionRegistry } from '../runtime/child-admission.ts';
import { hydrateChildInteraction } from '../runtime/child-hydration.ts';
import { resolveChildReasoning } from '../runtime/child-reasoning.ts';
import type { ChildThinkingLevel } from '../runtime/child-runtime.ts';
import type { ChildSessionHandle, ChildSessionRepository } from '../runtime/child-session-repository.ts';
import { type ModelResolutionRegistry, resolveSubagentModel, type SubagentModelConfig } from '../runtime/model-resolution.ts';
import { runWithGlobalConcurrency } from '../runtime/task-scheduler.ts';
import { buildChildPrompt, describeTask, type SpawnInput, type SpawnTask } from '../tools/spawn/spawn.schema.ts';
import { SpawnProgress } from '../tools/spawn/spawn-progress.ts';

export interface SpawnOrchestratorDependencies {
  cwd: string;
  parentSessionId: string;
  repository: ChildSessionRepository;
  admission: ChildAdmissionRegistry;
  maxConcurrency: number;
  /** Parent model and reasoning, used whenever a subagent has no usable configured model. */
  model: Model<Api>;
  thinkingLevel: ChildThinkingLevel;
  registry: ModelResolutionRegistry;
  subagentModel: (name: BundledSubagentName) => SubagentModelConfig | undefined;
  subagentReasoning: (name: BundledSubagentName) => ChildThinkingLevel | undefined;
  resolveSubagent: (name: BundledSubagentName) => CurrentSubagentResult;
  /** Resolves a continuation target from the active parent branch only. */
  resolveContinuation: (childSessionId: string) => ChildInteraction | undefined;
  hydrate?: typeof hydrateChildInteraction;
}

export interface SpawnRunResult {
  interactions: ChildInteraction[];
  progress: SpawnProgress;
  aborted: boolean;
}

/**
 * Runs one blocking spawn call.
 *
 * All tasks share a single capacity pool, every task settles, failures are isolated, and
 * results are returned in input order regardless of completion order.
 */
export async function runSpawn(
  input: SpawnInput,
  dependencies: SpawnOrchestratorDependencies,
  options: { signal?: AbortSignal; onProgress?: (progress: SpawnProgress) => void } = {},
): Promise<SpawnRunResult> {
  const hydrate = dependencies.hydrate ?? hydrateChildInteraction;
  const progress = new SpawnProgress(
    input.tasks.map((task, index) => ({
      label: describeTask(task, index),
      // A continuation's subagent is unknown until its target resolves.
      agent: task.action === 'create' ? task.agent : undefined,
      action: task.action,
    })),
  );
  const publish = () => options.onProgress?.(progress);
  publish();

  const settled = await runWithGlobalConcurrency(
    input.tasks,
    dependencies.maxConcurrency,
    async (task, index) => {
      progress.start(index);
      publish();
      const interaction = await runTask({ task, index, input, dependencies, hydrate, signal: options.signal, progress, publish });
      progress.settle(index, interaction.status, interaction.error);
      publish();
      return interaction;
    },
    options.signal,
  );

  const interactions = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const task = input.tasks[index] as SpawnTask;
    const status = result.status === 'aborted' ? 'aborted' : 'failure';
    progress.settle(index, status, result.status === 'rejected' ? result.error : undefined);
    return placeholderInteraction(task, index, status, result.status === 'rejected' ? result.error : 'Aborted before dispatch.');
  });
  publish();

  return { interactions, progress, aborted: options.signal?.aborted === true };
}

interface RunTaskInput {
  task: SpawnTask;
  index: number;
  input: SpawnInput;
  dependencies: SpawnOrchestratorDependencies;
  hydrate: typeof hydrateChildInteraction;
  signal?: AbortSignal;
  progress: SpawnProgress;
  publish: () => void;
}

async function runTask(context: RunTaskInput): Promise<ChildInteraction> {
  const { task, index, dependencies } = context;
  const agent = task.action === 'create' ? task.agent : (dependencies.resolveContinuation(task.childSessionId)?.agent ?? undefined);
  if (!agent) return placeholderInteraction(task, index, 'failure', unreachableChild((task as { childSessionId: string }).childSessionId));
  context.progress.resolveAgent(index, agent);

  const resolved = dependencies.resolveSubagent(agent);
  if (!resolved.success) return placeholderInteraction(task, index, 'failure', resolved.error, agent);

  const model = await resolveSubagentModel({
    configured: dependencies.subagentModel(agent),
    parentModel: dependencies.model,
    registry: dependencies.registry,
  });
  if (!model.success) return placeholderInteraction(task, index, 'failure', model.error, agent);
  const thinkingLevel = resolveChildReasoning(model.model, dependencies.subagentReasoning(agent), dependencies.thinkingLevel);

  let handle: ChildSessionHandle;
  let checkpoint: string | null | undefined;
  if (task.action === 'create') {
    handle = dependencies.repository.create(dependencies.cwd, dependencies.parentSessionId, agent);
    checkpoint = undefined;
  } else {
    const previous = dependencies.resolveContinuation(task.childSessionId);
    if (!previous) return placeholderInteraction(task, index, 'failure', unreachableChild(task.childSessionId), agent);
    handle = dependencies.repository.open(dependencies.cwd, dependencies.parentSessionId, task.childSessionId);
    checkpoint = previous.checkpointAfter;
  }

  // One managed writer per child for the whole interaction.
  const release = dependencies.admission.acquire(handle.sessionId);
  try {
    const outcome = await context.hydrate({
      cwd: dependencies.cwd,
      definition: resolved.definition,
      sessionManager: handle.sessionManager,
      model: model.model,
      thinkingLevel,
      prompt: buildChildPrompt(context.input.context, task),
      checkpoint,
      signal: context.signal,
      onEvent: event => {
        context.progress.observe(index, event);
        context.publish();
      },
    });

    const capped = capOutput(outcome.text);
    return {
      version: CHILD_INTERACTION_VERSION,
      interactionId: createInteractionId(index),
      taskIndex: index,
      agent,
      name: task.name,
      status: outcome.status,
      childSessionId: handle.sessionId,
      childSessionFile: handle.sessionFile,
      checkpointBefore: outcome.checkpointBefore,
      checkpointAfter: resolveCheckpointAfter(outcome.checkpointBefore, outcome.checkpointAfter, id => Boolean(handle.sessionManager.getEntry(id))),
      body: capped.content,
      error: outcome.error,
      truncation: capped.reference,
      telemetry: outcome.telemetry,
    };
  } finally {
    release();
  }
}

function unreachableChild(childSessionId: string): string {
  return `Child "${childSessionId}" is not reachable on this branch; no usable reference exists here.`;
}

function placeholderInteraction(
  task: SpawnTask,
  index: number,
  status: 'failure' | 'aborted',
  error?: string,
  agent: BundledSubagentName = 'explorer',
): ChildInteraction {
  return {
    version: CHILD_INTERACTION_VERSION,
    interactionId: createInteractionId(index),
    taskIndex: index,
    agent: task.action === 'create' ? task.agent : agent,
    name: task.name,
    status,
    childSessionId: task.action === 'continue' ? task.childSessionId : '',
    childSessionFile: '',
    checkpointBefore: null,
    checkpointAfter: null,
    body: '',
    error,
    telemetry: { durationMs: 0, requests: 0, tokensInput: 0, tokensOutput: 0, cost: 0 },
  };
}
