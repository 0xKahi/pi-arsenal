import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Container } from '@earendil-works/pi-tui';
import { CHILD_INTERACTION_VERSION, SPAWN_TOOL_NAME } from '../../constants.ts';
import type { SpawnOrchestratorDependencies, SpawnRunResult } from '../../orchestrator/spawn-orchestrator.ts';
import { runSpawn } from '../../orchestrator/spawn-orchestrator.ts';
import { isSpawnToolDetails, type SpawnToolDetails } from '../../results/child-interaction.types.ts';
import { buildResultEnvelope } from '../../results/result-envelope.ts';
import { renderSpawnPresentation, type TaskPresentation } from './spawn.presenter.ts';
import { describeTask, type SpawnInput, spawnParameters, validateSpawnInput } from './spawn.schema.ts';
import { SPAWN_MANIFEST_VERSION, type SpawnManifest, summarizeTelemetry } from './spawn-manifest.ts';
import { type ManifestSink, SpawnManifestWriter } from './spawn-manifest-writer.ts';

export { SPAWN_TOOL_NAME };

export interface SpawnToolHost {
  /** The tool is only callable while this returns dependencies; Default parents and children return undefined. */
  resolve: (ctx: ExtensionContext) => SpawnOrchestratorDependencies | { error: string } | undefined;
  availableAgents: () => Iterable<string>;
  appendManifest?: ManifestSink;
  run?: typeof runSpawn;
}

export function createSpawnTool(host: SpawnToolHost): ToolDefinition<typeof spawnParameters, SpawnToolDetails> {
  return {
    name: SPAWN_TOOL_NAME,
    label: 'spawn',
    description:
      'concurrently assign task(s) to one or more subagents and wait for their reply.' +
      'each task can either be assigned to a named subagent allocating a new child session for that agent ' +
      'or use a previously spawned subagent childSessionId, to continue on its exsting session context.',
    promptSnippet: 'spawn({context, tasks[]}): run durable subagent tasks concurrently and wait for all of them to settle',
    promptGuidelines: [
      'Put everything shared by the tasks in `context`, and only task-specific instructions in each `task`.',
      'Use action "create" for new work, assigning new session to spawned agent',
      'Use action "continue" with a returned childSessionId to Build on a child\'s existing context. for replying spawned subagents, or clarifying workdone',
      'Every continue target must be unique within one spawn call.',
      'when assigning multiple tasks parallize, use one spawn call with multiple entries, instead of multiple spawn calls; tasks share one concurrency pool. ',
    ],
    parameters: spawnParameters,
    async execute(_toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<SpawnToolDetails>> {
      const host_ = host.resolve(ctx);
      if (!host_) throw new Error('spawn is only available to an eligible Megamind parent session.');
      if ('error' in host_) throw new Error(host_.error);

      // Preflight: reject before dispatch so a bad call leaves no children and no manifest.
      const input: SpawnInput = validateSpawnInput(params, { availableAgents: host.availableAgents() });

      const writer = new SpawnManifestWriter();
      const startedAt = Date.now();
      writer.markDispatched();

      let run: SpawnRunResult;
      try {
        run = await (host.run ?? runSpawn)(input, host_, {
          signal,
          onProgress: progress =>
            onUpdate?.({
              content: [{ type: 'text', text: renderSpawnPresentation({ tasks: toPresentation(progress.snapshot()) }) }],
              details: { version: CHILD_INTERACTION_VERSION, kind: 'spawn', interactions: [] },
            }),
        });
      } catch (error) {
        writeManifest(host, writer, buildManifest(input, [], 'aborted', Date.now() - startedAt));
        throw error;
      }

      const details: SpawnToolDetails = { version: CHILD_INTERACTION_VERSION, kind: 'spawn', interactions: run.interactions };
      writeManifest(host, writer, buildManifest(input, run.interactions, run.aborted ? 'aborted' : 'completed', Date.now() - startedAt));

      return {
        content: [{ type: 'text', text: buildResultEnvelope(run.interactions).content }],
        details,
      };
    },
    renderCall() {
      return new Container();
    },
    renderResult(result, { expanded }) {
      const details = isSpawnToolDetails(result.details) ? result.details : undefined;
      const tasks: TaskPresentation[] = (details?.interactions ?? []).map(interaction => ({
        status: interaction.status,
        label: interaction.name ?? `task ${interaction.taskIndex + 1}`,
        agent: interaction.agent,
        error: interaction.error,
        interaction,
      }));
      const container = new Container();
      container.addChild({
        render: (width: number) =>
          renderSpawnPresentation({ tasks, expanded })
            .split('\n')
            .map(line => line.slice(0, Math.max(1, width))),
        invalidate: () => {},
      });
      return container;
    },
  };
}

function toPresentation(snapshot: ReturnType<import('./spawn-progress.ts').SpawnProgress['snapshot']>): TaskPresentation[] {
  return snapshot.map(task => ({
    status: task.status,
    label: task.label,
    agent: task.agent,
    currentTool: task.currentTool,
    error: task.error,
  }));
}

function buildManifest(
  input: SpawnInput,
  interactions: SpawnRunResult['interactions'],
  outcome: SpawnManifest['outcome'],
  durationMs: number,
): SpawnManifest {
  return {
    version: SPAWN_MANIFEST_VERSION,
    outcome,
    context: input.context,
    tasks: input.tasks.map((task, index) => ({
      input: task,
      interaction: interactions[index],
      error: interactions[index]?.error,
    })),
    telemetry: summarizeTelemetry(interactions, durationMs, interactions[0]?.telemetry.model),
    counts: {
      total: input.tasks.length,
      succeeded: interactions.filter(interaction => interaction.status === 'success').length,
      failed: interactions.filter(interaction => interaction.status === 'failure').length,
      aborted: interactions.filter(interaction => interaction.status === 'aborted').length,
    },
  };
}

function writeManifest(host: SpawnToolHost, writer: SpawnManifestWriter, manifest: SpawnManifest): void {
  if (!host.appendManifest) return;
  try {
    writer.appendOnce(host.appendManifest, manifest);
  } catch {
    // A manifest write failure must never mask the batch outcome.
  }
}

export { describeTask };
