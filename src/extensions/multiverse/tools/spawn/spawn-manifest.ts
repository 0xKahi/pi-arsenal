import { SPAWN_MANIFEST_CUSTOM_TYPE, SPAWN_MANIFEST_VERSION } from '../../constants.ts';
import type { ChildInteraction, ChildTelemetry } from '../../results/child-interaction.types.ts';
import type { SpawnTask } from './spawn.schema.ts';

export { SPAWN_MANIFEST_CUSTOM_TYPE, SPAWN_MANIFEST_VERSION };

export interface SpawnManifestTask {
  input: SpawnTask;
  interaction?: ChildInteraction;
  error?: string;
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
