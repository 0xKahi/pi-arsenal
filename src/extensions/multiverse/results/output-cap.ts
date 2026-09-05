import { MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES } from '../constants.ts';

// Re-exported, never redeclared: the thresholds have one declared source in constants.ts.
export { MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES };

/** Inline marker written at the cut point so a severed sentence is not read as a complete one. */
export const TRUNCATION_MARKER = '\n[... output truncated at the size cap ...]';

export interface OutputLimits {
  maxLines: number;
  maxBytes: number;
}

export interface TruncatedOutput {
  content: string;
  truncated: boolean;
  reference?: { totalBytes: number; totalLines: number };
}

/**
 * Circuit breaker on runaway child output.
 *
 * The cut is final and offers no remedy. The threshold is set so far above honest output
 * that anything tripping it is a loop or a file dump, where the severed tail has no value
 * worth a second round trip to retrieve.
 */
export function capOutput(text: string, limits: OutputLimits = { maxLines: MAX_OUTPUT_LINES, maxBytes: MAX_OUTPUT_BYTES }): TruncatedOutput {
  const totalBytes = new TextEncoder().encode(text).length;
  const lines = text.split('\n');
  if (totalBytes <= limits.maxBytes && lines.length <= limits.maxLines) return { content: text, truncated: false };

  const lineCapped = lines.length > limits.maxLines ? lines.slice(0, limits.maxLines).join('\n') : text;
  return {
    content: `${truncateToByteLimit(lineCapped, limits.maxBytes)}${TRUNCATION_MARKER}`,
    truncated: true,
    reference: { totalBytes, totalLines: lines.length },
  };
}

/** Truncates on a UTF-8 code point boundary so the capped text is never larger than the limit. */
function truncateToByteLimit(text: string, maxBytes: number): string {
  if (!Number.isFinite(maxBytes)) return text;
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;

  let end = Math.max(0, Math.floor(maxBytes));
  // Walk back off any continuation byte so a multi-byte code point is never split.
  while (end > 0 && ((bytes[end] as number) & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.subarray(0, end));
}
