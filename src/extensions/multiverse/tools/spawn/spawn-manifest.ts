import { SPAWN_MANIFEST_CUSTOM_TYPE, SPAWN_MANIFEST_VERSION } from '../../constants.ts';
import type { ChildInteraction, ChildInteractionStatus, ChildTelemetry } from '../../results/child-interaction.types.ts';
import type { SpawnTask } from './spawn.schema.ts';

export { SPAWN_MANIFEST_CUSTOM_TYPE, SPAWN_MANIFEST_VERSION };

/**
 * A reference to one child interaction, never a copy of its output.
 *
 * The manifest is a batch-level index (design D15): it records which children one call
 * dispatched and in what order, plus tasks that failed before any child existed. A child's
 * response body lives uncapped in that child's own session, reachable from
 * `childSessionId`, so duplicating it here would be a third copy of the same prose.
 */
export interface SpawnManifestTask {
  input: SpawnTask;
  /** Absent when the task failed before a child was created. */
  childSessionId?: string;
  agent?: string;
  status?: ChildInteractionStatus;
  checkpointBefore?: string | null;
  checkpointAfter?: string | null;
  error?: string;
  telemetry?: ChildTelemetry;
}

/** Projects one interaction to its manifest reference, dropping body and truncation. */
export function toManifestTask(input: SpawnTask, interaction: ChildInteraction | undefined): SpawnManifestTask {
  if (!interaction) return { input };
  return {
    input,
    childSessionId: interaction.childSessionId || undefined,
    agent: interaction.agent,
    status: interaction.status,
    checkpointBefore: interaction.checkpointBefore,
    checkpointAfter: interaction.checkpointAfter,
    error: interaction.error,
    telemetry: interaction.telemetry,
  };
}

/** Durable record of one spawn call, kept outside model context. */
export interface SpawnManifest {
  version: typeof SPAWN_MANIFEST_VERSION;
  outcome: 'completed' | 'aborted';
  context: string;
  tasks: SpawnManifestTask[];
  telemetry: ChildTelemetry;
  counts: {
    total: number;
    succeeded: number;
    failed: number;
    aborted: number;
  };
}

export function summarizeTelemetry(interactions: readonly ChildInteraction[], durationMs: number, model?: string): ChildTelemetry {
  return interactions.reduce<ChildTelemetry>(
    (total, interaction) => ({
      model: total.model,
      durationMs: total.durationMs,
      requests: total.requests + interaction.telemetry.requests,
      tokensInput: total.tokensInput + interaction.telemetry.tokensInput,
      tokensOutput: total.tokensOutput + interaction.telemetry.tokensOutput,
      cost: total.cost + interaction.telemetry.cost,
    }),
    { model, durationMs, requests: 0, tokensInput: 0, tokensOutput: 0, cost: 0 },
  );
}
