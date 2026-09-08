import { describe, expect, it } from 'bun:test';
import {
  isSpawnManifest,
  recoverSpawnManifests,
  SPAWN_MANIFEST_CUSTOM_TYPE,
  type SpawnManifest,
  SpawnManifestWriter,
  summarizeTelemetry,
  toManifestTask,
} from '../../../../../src/extensions/multiverse/tools/spawn/spawn-manifest.ts';
import { childInteraction } from '../../interaction-fixture.ts';

describe('SpawnManifest', () => {
  it('round-trips task references, terminal states, and telemetry', () => {
    const manifest: SpawnManifest = {
      version: 1,
      outcome: 'completed',
      context: 'shared context',
      tasks: [
        toManifestTask({ action: 'create', agent: 'fixer', task: 'x' }, childInteraction({ body: 'done' })),
        { input: { action: 'continue', childSessionId: 'child', task: 'x' }, error: 'failed' },
      ],
      telemetry: { model: 'model', durationMs: 20, requests: 2, tokensInput: 10, tokensOutput: 5, cost: 0.01 },
      counts: { total: 2, succeeded: 1, failed: 1, aborted: 0 },
    };

    expect(SPAWN_MANIFEST_CUSTOM_TYPE).toBe('arsenal-spawn-manifest');
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it('records references only, never a copy of child output', () => {
    const task = toManifestTask(
      { action: 'create', agent: 'fixer', task: 'x' },
      childInteraction({ body: 'a very large child response', truncation: { totalBytes: 10, totalLines: 2 } }),
    );

    expect(task.childSessionId).toBe('child-1');
    expect(task.status).toBe('success');
    expect(task.checkpointAfter).toBe('leaf');
    expect(task.telemetry?.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(task)).not.toContain('a very large child response');
    expect(Object.keys(task)).not.toContain('body');
    expect(Object.keys(task)).not.toContain('truncation');
  });

  it('still records a task that failed before any child existed', () => {
    const task = toManifestTask({ action: 'continue', childSessionId: 'gone', task: 'x' }, undefined);

    expect(task).toEqual({ input: { action: 'continue', childSessionId: 'gone', task: 'x' } });
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


const completedManifest: SpawnManifest = {
  version: 1,
  outcome: 'completed',
  context: 'shared context',
  tasks: [],
  telemetry: { durationMs: 0, requests: 0, tokensInput: 0, tokensOutput: 0, cost: 0 },
  counts: { total: 0, succeeded: 0, failed: 0, aborted: 0 },
};

describe('SpawnManifestWriter', () => {
  it('appends nothing while preflight rejected before dispatch', () => {
    const writer = new SpawnManifestWriter();
    const appended: string[] = [];

    writer.appendOnce((type: string) => appended.push(type), completedManifest);

    expect(appended).toEqual([]);
    expect(writer.hasAppended()).toBe(false);
  });

  it('appends exactly once on completion', () => {
    const writer = new SpawnManifestWriter();
    const appended: string[] = [];
    writer.markDispatched();

    writer.appendOnce((type: string) => appended.push(type), completedManifest);

    expect(appended).toEqual(['arsenal-spawn-manifest']);
    expect(writer.hasAppended()).toBe(true);
    expect(() => writer.appendOnce((_type: string) => {}, completedManifest)).toThrow('already appended');
  });
});


const abortedManifest: SpawnManifest = {
  version: 1,
  outcome: 'aborted',
  context: 'shared context',
  tasks: [],
  telemetry: { durationMs: 1, requests: 1, tokensInput: 1, tokensOutput: 1, cost: 1 },
  counts: { total: 1, succeeded: 0, failed: 0, aborted: 1 },
};

describe('recoverSpawnManifests', () => {
  it('recovers valid hidden custom entries while ignoring invalid or unrelated entries', () => {
    expect(isSpawnManifest(abortedManifest)).toBe(true);
    expect(isSpawnManifest({ version: 2 })).toBe(false);

    const manifests = recoverSpawnManifests([
      { type: 'message', customType: 'message', data: {} },
      { type: 'custom', customType: SPAWN_MANIFEST_CUSTOM_TYPE, data: abortedManifest },
      { type: 'custom', customType: 'other', data: {} },
      { type: 'custom', customType: SPAWN_MANIFEST_CUSTOM_TYPE, data: { version: 2 } },
    ]);

    expect(manifests).toEqual([abortedManifest]);
  });
});
