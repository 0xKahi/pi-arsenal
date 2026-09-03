import { describe, expect, it } from 'bun:test';
import {
  createInteractionId,
  isChildInteraction,
  isSpawnToolDetails,
  resolveCheckpointAfter,
} from '../../../../src/extensions/multiverse/results/child-interaction.types.ts';
import { childInteraction } from '../interaction-fixture.ts';

describe('ChildInteraction', () => {
  it('serializes branch-scoped interaction and checkpoint correlation', () => {
    const interaction = childInteraction({ checkpointBefore: 'leaf-before', checkpointAfter: 'leaf-after', name: 'implementation' });

    expect(JSON.parse(JSON.stringify(interaction))).toEqual(interaction);
    expect(isChildInteraction(interaction)).toBe(true);
    expect(createInteractionId(2)).toBe('mv-interaction-2');
  });

  it('rejects payloads that are not a complete interaction', () => {
    expect(isChildInteraction({ version: 1 })).toBe(false);
    expect(isChildInteraction(childInteraction({ agent: undefined as never }))).toBe(false);
    expect(isChildInteraction(childInteraction({ status: 'unknown' as never }))).toBe(false);
    expect(isSpawnToolDetails({ version: 1, kind: 'spawn', interactions: [] })).toBe(true);
    expect(isSpawnToolDetails({ version: 1, kind: 'other', interactions: [] })).toBe(false);
  });

  it('retains the newest valid aborted entry or falls back to the prior checkpoint', () => {
    expect(resolveCheckpointAfter('prior', 'newest')).toBe('newest');
    expect(resolveCheckpointAfter('prior', null)).toBe('prior');
    expect(resolveCheckpointAfter('prior', 'missing', id => id !== 'missing')).toBe('prior');
    expect(resolveCheckpointAfter(null, null)).toBeNull();
  });
});
