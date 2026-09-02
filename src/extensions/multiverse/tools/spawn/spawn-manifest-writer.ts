import { SPAWN_MANIFEST_CUSTOM_TYPE, type SpawnManifest } from './spawn-manifest.ts';

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
