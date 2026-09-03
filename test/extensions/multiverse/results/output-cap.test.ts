import { describe, expect, it } from 'bun:test';
import { MAX_OUTPUT_BYTES as CONSTANT_BYTES, MAX_OUTPUT_LINES as CONSTANT_LINES } from '../../../../src/extensions/multiverse/constants.ts';
import { capOutput, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES, TRUNCATION_MARKER } from '../../../../src/extensions/multiverse/results/output-cap.ts';

const byteLength = (value: string) => new TextEncoder().encode(value).length;

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
