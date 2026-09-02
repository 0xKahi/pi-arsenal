export const MAX_OUTPUT_LINES = 500;
export const MAX_OUTPUT_BYTES = 16 * 1024;

export interface OutputLimits {
  maxLines: number;
  maxBytes: number;
}

export interface TruncatedOutput {
  content: string;
  truncated: boolean;
  reference?: { sessionFile: string; checkpoint: string | null; totalBytes: number; totalLines: number };
}

/** Bounds model-facing child output while leaving the full text recoverable from its session file. */
export function capOutput(
  text: string,
  sessionFile: string,
  checkpoint: string | null,
  limits: OutputLimits = { maxLines: MAX_OUTPUT_LINES, maxBytes: MAX_OUTPUT_BYTES },
): TruncatedOutput {
  const totalBytes = new TextEncoder().encode(text).length;
  const lines = text.split('\n');
  if (totalBytes <= limits.maxBytes && lines.length <= limits.maxLines) return { content: text, truncated: false };

  const lineCapped = lines.length > limits.maxLines ? lines.slice(0, limits.maxLines).join('\n') : text;
  return {
    content: truncateToByteLimit(lineCapped, limits.maxBytes),
    truncated: true,
    reference: { sessionFile, checkpoint, totalBytes, totalLines: lines.length },
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
