import { describe, expect, it } from 'bun:test';
import type { SessionEntry, SessionMessageEntry } from '@earendil-works/pi-coding-agent';
import type { ChildInteraction } from '../../../../src/extensions/multiverse/results/child-interaction.types.ts';
import { latestChildInteraction } from '../../../../src/extensions/multiverse/results/child-interaction-lookup.ts';
import { childInteraction } from '../interaction-fixture.ts';

const spawnDetails = (interactions: unknown[]) => ({ version: 1, kind: 'spawn', interactions });

const resultEntry = (id: string, details: unknown): SessionEntry =>
  ({
    type: 'message',
    id,
    parentId: null,
    timestamp: '2026-01-01T00:00:00.000Z',
    message: { role: 'toolResult', details, isError: false, toolCallId: id, toolName: 'spawn', content: [], timestamp: 0 },
  }) as SessionMessageEntry;

const interaction = (childSessionId: string, checkpointAfter: string | null, status: ChildInteraction['status']) =>
  childInteraction({ childSessionId, checkpointAfter, status, interactionId: `${childSessionId}-interaction` });

describe('latestChildInteraction', () => {
  it('selects the latest valid interaction for that child and ignores unrelated details', () => {
    const entries = [
      resultEntry('a', spawnDetails([interaction('child-1', 'checkpoint-1', 'success')])),
      resultEntry('b', {}),
      resultEntry('c', spawnDetails([{ ...interaction('child-2', 'other', 'success'), agent: 'explorer' }])),
      resultEntry('d', spawnDetails([interaction('child-1', 'checkpoint-2', 'aborted')])),
    ];

    expect(latestChildInteraction(entries, 'child-1')?.checkpointAfter).toBe('checkpoint-2');
    expect(latestChildInteraction(entries, 'child-2')?.checkpointAfter).toBe('other');
  });

  it('returns undefined when the active branch has no usable interaction', () => {
    expect(latestChildInteraction([resultEntry('a', spawnDetails([interaction('other', 'x', 'success')]))], 'child-1')).toBeUndefined();
    expect(latestChildInteraction([resultEntry('x', spawnDetails([{ invalid: true }]))], 'child-1')).toBeUndefined();
    expect(latestChildInteraction([resultEntry('y', { subagentInteractions: [interaction('child-1', 'x', 'success')] })], 'child-1')).toBeUndefined();
  });
});
