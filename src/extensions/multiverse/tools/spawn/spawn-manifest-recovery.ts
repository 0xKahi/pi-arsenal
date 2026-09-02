import { SPAWN_MANIFEST_CUSTOM_TYPE, SPAWN_MANIFEST_VERSION, type SpawnManifest } from './spawn-manifest.ts';

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
