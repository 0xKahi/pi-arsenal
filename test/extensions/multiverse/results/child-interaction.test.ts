import { describe, expect, it } from 'bun:test';
import type { SessionEntry, SessionMessageEntry } from '@earendil-works/pi-coding-agent';
import { MAX_OUTPUT_BYTES as CONSTANT_BYTES, MAX_OUTPUT_LINES as CONSTANT_LINES } from '../../../../src/extensions/multiverse/constants.ts';
import {
  type ChildInteraction,
  capOutput,
  createInteractionId,
  isChildInteraction,
  isSpawnToolDetails,
  latestChildInteraction,
  MAX_OUTPUT_BYTES,
  MAX_OUTPUT_LINES,
  resolveCheckpointAfter,
  TRUNCATION_MARKER,
} from '../../../../src/extensions/multiverse/results/child-interaction.ts';
import { childInteraction } from '../interaction-fixture.ts';

const byteLength = (value: string) => new TextEncoder().encode(value).length;

describe('ChildInteraction', () => {
  it('serializes branch-scoped interaction and checkpoint correlation', () => {
    const interaction = childInteraction({ checkpointBefore: 'leaf-before', checkpointAfter: 'leaf-after' });

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

describe('capOutput', () => {
  it('declares its thresholds in one place', () => {
    expect(MAX_OUTPUT_LINES).toBe(CONSTANT_LINES);
    expect(MAX_OUTPUT_BYTES).toBe(CONSTANT_BYTES);
  });

  it('marks the cut point and reports the full size without any file reference', () => {
    const input = Array.from({ length: MAX_OUTPUT_LINES + 1 }, (_, index) => `line-${index}`).join('\n');

    const result = capOutput(input, { maxLines: MAX_OUTPUT_LINES, maxBytes: Number.POSITIVE_INFINITY });

    expect(result.truncated).toBe(true);
    expect(result.content).toContain('line-0');
    expect(result.content).not.toContain(`line-${MAX_OUTPUT_LINES}`);
    expect(result.content.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(result.reference).toEqual({ totalBytes: input.length, totalLines: MAX_OUTPUT_LINES + 1 });
  });

  it('leaves routine verbose output whole', () => {
    const routine = Array.from({ length: 300 }, (_, index) => `a fairly wordy report line ${index}`).join('\n');

    expect(capOutput('short').truncated).toBe(false);
    expect(capOutput(routine).truncated).toBe(false);
    expect(capOutput(routine).content).toBe(routine);
  });

  it('honours the byte cap on multi-byte content without splitting a code point', () => {
    const input = '★'.repeat(20_000);

    const result = capOutput(input, { maxLines: MAX_OUTPUT_LINES, maxBytes: 100 });
    const body = result.content.slice(0, -TRUNCATION_MARKER.length);

    expect(result.truncated).toBe(true);
    expect(byteLength(body)).toBeLessThanOrEqual(100);
    expect(body).toBe('★'.repeat(33));
    expect(body).not.toContain('\uFFFD');
    expect(result.reference?.totalBytes).toBe(byteLength(input));
  });

  it('applies the byte cap after line capping for oversized single-line output', () => {
    const result = capOutput('a'.repeat(MAX_OUTPUT_BYTES * 2));

    expect(result.truncated).toBe(true);
    expect(byteLength(result.content.slice(0, -TRUNCATION_MARKER.length))).toBe(MAX_OUTPUT_BYTES);
  });
});

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
