import { randomBytes } from 'node:crypto';
import { RESULT_BOUNDARY_NONCE_BYTES } from '../constants.ts';
import type { ChildInteraction } from './child-interaction.ts';

export interface ResultEnvelope {
  content: string;
  /** Per-call random boundary component. Never placed in any child's prompt or context. */
  nonce: string;
}

/** States the fact and stops. Offers no remedy, because output this large is a malfunction. */
const TRUNCATION_NOTICE = 'truncated: output exceeded the size cap and was cut';

/**
 * Frame each child body with a per-call boundary nonce.
 *
 * Header fields are computed by the runtime and trustworthy; everything between the
 * RESPONSE and END boundaries is the child's own untrusted report, reproduced
 * byte-for-byte and never reformatted, validated, or repaired. Because the nonce is
 * random per call and never disclosed to a child, delimiter-like text a child emits
 * cannot terminate or forge a neighbouring frame.
 *
 * The frame carries only what the parent model can act on, did not itself write, and can
 * soundly rely on. Interaction IDs, task names, task indices, checkpoints, file paths,
 * session-file paths, and telemetry are deliberately absent; they live in tool details
 * and the durable manifest for the user.
 */
export function buildResultEnvelope(interactions: readonly ChildInteraction[]): ResultEnvelope {
  const nonce = randomBytes(RESULT_BOUNDARY_NONCE_BYTES).toString('hex');
  const frames = interactions.map((interaction, index) => renderFrame(interaction, index + 1, nonce));
  const content = [`Spawn results (${interactions.length}) · boundary ${nonce}`, ...frames].join('\n\n');

  return { nonce, content };
}

/** Boundary task numbers are 1-based; `taskIndex` in tool details stays 0-based. */
function renderFrame(interaction: ChildInteraction, taskNumber: number, nonce: string): string {
  const lines = [
    `--TASK_${taskNumber}_START-${nonce}--`,
    `agent: ${interaction.agent}`,
    `childSessionId: ${interaction.childSessionId}`,
    `status: ${interaction.status}`,
  ];
  // Optional lines are sparse: absent entirely rather than rendered as "none".
  if (interaction.error) lines.push(`error: ${interaction.error}`);
  if (interaction.truncation) lines.push(TRUNCATION_NOTICE);
  lines.push(`--TASK_${taskNumber}_RESPONSE-${nonce}--`);
  if (interaction.body) lines.push(interaction.body);
  lines.push(`--TASK_${taskNumber}_END-${nonce}--`);

  return lines.join('\n');
}
