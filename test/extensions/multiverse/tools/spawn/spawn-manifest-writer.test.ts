import { describe, expect, it } from 'bun:test';
import type { SpawnManifest } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-manifest.ts';
import { SpawnManifestWriter } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-manifest-writer.ts';

const manifest: SpawnManifest = {
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

    writer.appendOnce((type: string) => appended.push(type), manifest);

    expect(appended).toEqual([]);
    expect(writer.hasAppended()).toBe(false);
  });

  it('appends exactly once on completion', () => {
    const writer = new SpawnManifestWriter();
    const appended: string[] = [];
    writer.markDispatched();

    writer.appendOnce((type: string) => appended.push(type), manifest);

    expect(appended).toEqual(['arsenal-spawn-manifest']);
    expect(writer.hasAppended()).toBe(true);
    expect(() => writer.appendOnce((_type: string) => {}, manifest)).toThrow('already appended');
  });
});
