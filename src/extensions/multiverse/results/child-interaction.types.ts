import type { BundledSubagentName } from '../agents/subagent-definition.ts';
import { CHILD_INTERACTION_VERSION, INTERACTION_ID_PREFIX } from '../constants.ts';

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

export interface OutputTruncation {
  sessionFile: string;
  checkpoint: string | null;
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
  agent: BundledSubagentName;
  name?: string;
  status: ChildInteractionStatus;
  childSessionId: string;
  childSessionFile: string;
  checkpointBefore: string | null;
  checkpointAfter: string | null;
  observedPaths: string[];
  body: string;
  error?: string;
  truncation?: OutputTruncation;
  telemetry: ChildTelemetry;
}

/** Details attached to the spawn tool result. Persisted with the parent tool-result entry. */
export interface SpawnToolDetails {
  version: typeof CHILD_INTERACTION_VERSION;
  kind: 'spawn';
  interactions: ChildInteraction[];
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
    Array.isArray(candidate.observedPaths) &&
    (candidate.status === 'success' || candidate.status === 'failure' || candidate.status === 'aborted')
  );
}

export function isSpawnToolDetails(value: unknown): value is SpawnToolDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as SpawnToolDetails;
  return candidate.kind === 'spawn' && candidate.version === CHILD_INTERACTION_VERSION && Array.isArray(candidate.interactions);
}
