import { SPAWN_MANIFEST_CUSTOM_TYPE, SPAWN_MANIFEST_VERSION } from '../../constants.ts';
import type { ChildInteraction, ChildInteractionStatus, ChildTelemetry } from '../../results/child-interaction.ts';
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

// --- write-once guard --------------------------------------------------

export type ManifestSink = (customType: string, manifest: SpawnManifest) => void;

/**
 * Guarantees exactly one manifest per spawn call.
 *
 * Nothing is written when the call is rejected before dispatch, and every post-dispatch
 * terminal path (completion, failure, abort) writes once and only once.
 */
export class SpawnManifestWriter {
  private appended = false;
  private dispatched = false;

  markDispatched(): void {
    this.dispatched = true;
  }

  hasAppended(): boolean {
    return this.appended;
  }

  appendOnce(sink: ManifestSink, manifest: SpawnManifest): void {
    if (!this.dispatched) return;
    if (this.appended) throw new Error(`Spawn already appended its ${SPAWN_MANIFEST_CUSTOM_TYPE} manifest.`);
    this.appended = true;
    sink(SPAWN_MANIFEST_CUSTOM_TYPE, manifest);
  }
}

// --- recovery ----------------------------------------------------------

export function isSpawnManifest(value: unknown): value is SpawnManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as SpawnManifest;
  return (
    candidate.version === SPAWN_MANIFEST_VERSION &&
    (candidate.outcome === 'completed' || candidate.outcome === 'aborted') &&
    Array.isArray(candidate.tasks)
  );
}

/** Manifests stay out of model context but remain recoverable from stored session entries. */
export function recoverSpawnManifests(entries: ReadonlyArray<{ type?: string; customType?: string; data?: unknown }>): SpawnManifest[] {
  return entries
    .filter(entry => entry.type === 'custom' && entry.customType === SPAWN_MANIFEST_CUSTOM_TYPE && isSpawnManifest(entry.data))
    .map(entry => entry.data as SpawnManifest);
}
