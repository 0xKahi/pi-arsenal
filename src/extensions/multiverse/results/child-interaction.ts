import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { CHILD_INTERACTION_VERSION, INTERACTION_ID_PREFIX, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES } from '../constants.ts';
import type { TaskProgress } from '../tools/spawn/spawn-progress.ts';

// Re-exported, never redeclared: the thresholds have one declared source in constants.ts.
export { MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES };

export type ChildInteractionStatus = 'success' | 'failure' | 'aborted';

/** User-only telemetry. Never placed in model-facing content. */
export interface ChildTelemetry {
  model?: string;
  durationMs: number;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
}

/**
 * Recorded when a body tripped the output cap.
 *
 * Deliberately carries no session-file path or checkpoint: the remedy is continuing the
 * child session, which still holds its full output, not navigating to a file.
 */
export interface OutputTruncation {
  totalBytes: number;
  totalLines: number;
}

/**
 * The single durable record of one child interaction.
 *
 * This is the only shape used by the result envelope, the tool details, the spawn
 * manifest, and the TUI presenter, so a continuation always resolves the same fields
 * the model was shown.
 */
export interface ChildInteraction {
  version: typeof CHILD_INTERACTION_VERSION;
  interactionId: string;
  taskIndex: number;
  agent: string;
  status: ChildInteractionStatus;
  childSessionId: string;
  childSessionFile: string;
  checkpointBefore: string | null;
  checkpointAfter: string | null;
  body: string;
  error?: string;
  truncation?: OutputTruncation;
  telemetry: ChildTelemetry;
}

/**
 * Details attached to the spawn tool result. Persisted with the parent tool-result entry.
 *
 * Details never enter model context, so live progress is carried here while a call is
 * pending rather than in the tool's `content`.
 */
export interface SpawnToolDetails {
  version: typeof CHILD_INTERACTION_VERSION;
  kind: 'spawn';
  /** Result-envelope boundary nonce, also displayed in the live batch header. */
  boundaryNonce?: string;
  interactions: ChildInteraction[];
  progress?: TaskProgress[];
}

export function createInteractionId(taskIndex: number): string {
  return `${INTERACTION_ID_PREFIX}-${taskIndex}`;
}

/**
 * An aborted interaction keeps its newest valid persisted entry, or falls back to the
 * checkpoint it started from when no new entry was written.
 */
export function resolveCheckpointAfter(before: string | null, after: string | null, exists: (id: string) => boolean = () => true): string | null {
  return after && exists(after) ? after : before;
}

export function isChildInteraction(value: unknown): value is ChildInteraction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as ChildInteraction;
  return (
    candidate.version === CHILD_INTERACTION_VERSION &&
    typeof candidate.interactionId === 'string' &&
    typeof candidate.childSessionId === 'string' &&
    typeof candidate.childSessionFile === 'string' &&
    (candidate.checkpointBefore === null || typeof candidate.checkpointBefore === 'string') &&
    (candidate.checkpointAfter === null || typeof candidate.checkpointAfter === 'string') &&
    typeof candidate.agent === 'string' &&
    (candidate.status === 'success' || candidate.status === 'failure' || candidate.status === 'aborted')
  );
}

export function isSpawnToolDetails(value: unknown): value is SpawnToolDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as SpawnToolDetails;
  return candidate.kind === 'spawn' && candidate.version === CHILD_INTERACTION_VERSION && Array.isArray(candidate.interactions);
}

// --- branch-scoped lookup ---------------------------------------------

/**
 * Resolve the newest interaction for a child on the active parent branch.
 *
 * Continuation is deliberately branch-scoped: a child created only on an abandoned
 * branch is not reachable, so no implicit cross-branch import can occur.
 */
export function latestChildInteraction(entries: readonly SessionEntry[], childSessionId: string): ChildInteraction | undefined {
  for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex--) {
    const entry = entries[entryIndex];
    if (entry?.type !== 'message' || entry.message.role !== 'toolResult') continue;
    const details = 'details' in entry.message ? entry.message.details : undefined;
    if (!isSpawnToolDetails(details)) continue;

    for (let index = details.interactions.length - 1; index >= 0; index--) {
      const candidate = details.interactions[index];
      if (isChildInteraction(candidate) && candidate.childSessionId === childSessionId) return candidate;
    }
  }
  return undefined;
}

// --- output cap --------------------------------------------------------

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
