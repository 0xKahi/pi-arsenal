import { describe, expect, it } from 'bun:test';
import type { SpawnManifest } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-manifest.ts';
import { SPAWN_MANIFEST_CUSTOM_TYPE } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-manifest.ts';
import { isSpawnManifest, recoverSpawnManifests } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-manifest-recovery.ts';

const manifest: SpawnManifest = {
  version: 1,
  outcome: 'aborted',
  context: 'shared context',
  tasks: [],
  telemetry: { durationMs: 1, requests: 1, tokensInput: 1, tokensOutput: 1, cost: 1 },
  counts: { total: 1, succeeded: 0, failed: 0, aborted: 1 },
};

describe('recoverSpawnManifests', () => {
  it('recovers valid hidden custom entries while ignoring invalid or unrelated entries', () => {
    expect(isSpawnManifest(manifest)).toBe(true);
    expect(isSpawnManifest({ version: 2 })).toBe(false);

    const manifests = recoverSpawnManifests([
      { type: 'message', customType: 'message', data: {} },
      { type: 'custom', customType: SPAWN_MANIFEST_CUSTOM_TYPE, data: manifest },
      { type: 'custom', customType: 'other', data: {} },
      { type: 'custom', customType: SPAWN_MANIFEST_CUSTOM_TYPE, data: { version: 2 } },
    ]);

    expect(manifests).toEqual([manifest]);
  });
});
