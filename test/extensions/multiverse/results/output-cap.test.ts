import { describe, expect, it } from 'bun:test';
import { capOutput, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES } from '../../../../src/extensions/multiverse/results/output-cap.ts';

const byteLength = (value: string) => new TextEncoder().encode(value).length;

describe('capOutput', () => {
  it('preserves successful status while giving a recoverable full-output reference', () => {
    const input = Array.from({ length: MAX_OUTPUT_LINES + 1 }, (_, index) => `line-${index}`).join('\n');

    const result = capOutput(input, '/session/file.jsonl', 'checkpoint-42', { maxLines: MAX_OUTPUT_LINES, maxBytes: Number.POSITIVE_INFINITY });

    expect(result.truncated).toBe(true);
    expect(result.content).toContain('line-0');
    expect(result.content).not.toContain(`line-${MAX_OUTPUT_LINES}`);
    expect(result.reference).toEqual({
      sessionFile: '/session/file.jsonl',
      checkpoint: 'checkpoint-42',
      totalBytes: input.length,
      totalLines: MAX_OUTPUT_LINES + 1,
    });
  });

  it('does not mark normal output truncated', () => {
    expect(capOutput('short', '/file', null).truncated).toBe(false);
  });

  it('honours the byte cap on multi-byte content without splitting a code point', () => {
    const input = '★'.repeat(20_000);

    const result = capOutput(input, '/session/file.jsonl', null, { maxLines: MAX_OUTPUT_LINES, maxBytes: 100 });

    expect(result.truncated).toBe(true);
    expect(byteLength(result.content)).toBeLessThanOrEqual(100);
    expect(result.content).toBe('★'.repeat(33));
    expect(result.content).not.toContain('\uFFFD');
    expect(result.reference?.totalBytes).toBe(byteLength(input));
  });

  it('applies the byte cap after line capping for oversized single-line output', () => {
    const result = capOutput('a'.repeat(MAX_OUTPUT_BYTES * 2), '/session/file.jsonl', 'checkpoint-1');

    expect(result.truncated).toBe(true);
    expect(byteLength(result.content)).toBe(MAX_OUTPUT_BYTES);
  });
});
