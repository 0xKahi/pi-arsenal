import { describe, expect, it } from 'bun:test';
import {
  SPAWN_MANIFEST_CUSTOM_TYPE,
  type SpawnManifest,
  summarizeTelemetry,
} from '../../../../../src/extensions/multiverse/tools/spawn/spawn-manifest.ts';
import { childInteraction } from '../../interaction-fixture.ts';

describe('SpawnManifest', () => {
  it('round-trips task interactions, terminal states, and telemetry', () => {
    const manifest: SpawnManifest = {
      version: 1,
      outcome: 'completed',
      context: 'shared context',
      tasks: [
        {
          input: { action: 'create', agent: 'fixer', task: 'x' },
          interaction: childInteraction({ body: 'done' }),
        },
        { input: { action: 'continue', childSessionId: 'child', task: 'x' }, interaction: undefined, error: 'failed' },
      ],
      telemetry: { model: 'model', durationMs: 20, requests: 2, tokensInput: 10, tokensOutput: 5, cost: 0.01 },
      counts: { total: 2, succeeded: 1, failed: 1, aborted: 0 },
    };

    expect(SPAWN_MANIFEST_CUSTOM_TYPE).toBe('arsenal-spawn-manifest');
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it('aggregates per-interaction telemetry for the whole call', () => {
    const totals = summarizeTelemetry(
      [
        childInteraction({ telemetry: { durationMs: 1, requests: 1, tokensInput: 10, tokensOutput: 2, cost: 0.5 } }),
        childInteraction({ telemetry: { durationMs: 1, requests: 2, tokensInput: 5, tokensOutput: 3, cost: 0.25 } }),
      ],
      99,
      'anthropic/model',
    );

    expect(totals).toEqual({ model: 'anthropic/model', durationMs: 99, requests: 3, tokensInput: 15, tokensOutput: 5, cost: 0.75 });
  });
});
