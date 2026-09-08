import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import type { ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Container, Text } from '@earendil-works/pi-tui';
import { CHILD_INTERACTION_VERSION, SPAWN_TOOL_NAME } from '../../constants.ts';
import type { SpawnOrchestratorDependencies, SpawnRunResult } from '../../orchestrator/spawn-orchestrator.ts';
import { runSpawn } from '../../orchestrator/spawn-orchestrator.ts';
import { isSpawnToolDetails, type SpawnToolDetails } from '../../results/child-interaction.ts';
import { buildResultEnvelope, createBoundaryNonce } from '../../results/result-envelope.ts';
import { describeTask, type SpawnInput, spawnParameters, validateSpawnInput } from './spawn.schema.ts';
import {
  type ManifestSink,
  SPAWN_MANIFEST_VERSION,
  type SpawnManifest,
  SpawnManifestWriter,
  summarizeTelemetry,
  toManifestTask,
} from './spawn-manifest.ts';
import { buildSpawnRows, SpawnResultComponent } from './spawn-result.component.ts';

export { SPAWN_TOOL_NAME };

/** Fixed model-facing text for every partial update; carries no per-task progress. */
const PARTIAL_RECEIPT = 'Spawn dispatched; waiting for every task to settle.';

export interface SpawnToolHost {
  /** The tool is only callable while this returns dependencies; Default parents and children return undefined. */
  getExecutionContext: (ctx: ExtensionContext) => SpawnOrchestratorDependencies | { error: string } | undefined;
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
      const execution = host.getExecutionContext(ctx);
      if (!execution) throw new Error('spawn is only available to an eligible Megamind parent session.');
      if ('error' in execution) throw new Error(execution.error);

      // Preflight: reject before dispatch so a bad call leaves no children and no manifest.
      const input: SpawnInput = validateSpawnInput(params, { availableAgents: host.availableAgents() });

      const boundaryNonce = createBoundaryNonce();
      const writer = new SpawnManifestWriter();
      const startedAt = Date.now();
      writer.markDispatched();

      let run: SpawnRunResult;
      try {
        run = await (host.run ?? runSpawn)(input, execution, {
          signal,
          // Partial updates land in model context, so `content` stays a fixed receipt and all
          // live per-task progress goes to `details`, which the model never sees.
          onProgress: progress =>
            onUpdate?.({
              content: [{ type: 'text', text: PARTIAL_RECEIPT }],
              details: { version: CHILD_INTERACTION_VERSION, kind: 'spawn', boundaryNonce, interactions: [], progress: progress.snapshot() },
            }),
        });
      } catch (error) {
        writeManifest(host, writer, buildManifest(input, [], 'aborted', Date.now() - startedAt));
        throw error;
      }

      // The capped progress trail is persisted so the settled row can still be expanded.
      const details: SpawnToolDetails = {
        version: CHILD_INTERACTION_VERSION,
        kind: 'spawn',
        boundaryNonce,
        interactions: run.interactions,
        progress: run.progress.snapshot(),
      };
      writeManifest(host, writer, buildManifest(input, run.interactions, run.aborted ? 'aborted' : 'completed', Date.now() - startedAt));

      return {
        content: [{ type: 'text', text: buildResultEnvelope(run.interactions, boundaryNonce).content }],
        details,
      };
    },
    renderCall() {
      return new Container();
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const details = isSpawnToolDetails(result.details) ? result.details : undefined;
      // Reuse the live component across renders so spinner and timer state survive.
      const prior = context?.lastComponent;
      const component = prior instanceof SpawnResultComponent ? prior : new SpawnResultComponent(theme, context?.invalidate ?? (() => {}));
      if (!details && !isPartial) {
        component.dispose();
        return new Text(
          result.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n'),
          0,
          0,
        );
      }
      component.update(buildSpawnRows({ args: context?.args, details }), expanded, details?.boundaryNonce);
      return component;
    },
  };
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
    // References only: a child's response body lives in that child's own session (D15).
    tasks: input.tasks.map((task, index) => toManifestTask(task, interactions[index])),
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
