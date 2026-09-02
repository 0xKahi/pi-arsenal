import { randomUUID } from 'node:crypto';
import { RESULT_ENVELOPE_PREFIX } from '../constants.ts';
import type { ChildInteraction } from './child-interaction.types.ts';

export interface ResultEnvelope {
  content: string;
  delimiter: string;
}

/**
 * Frame each child body with a per-call unforgeable delimiter.
 *
 * Child output is never trusted: any delimiter-like text it emits belongs to a
 * different random run and therefore cannot terminate or forge a neighbouring entry.
 * Telemetry is deliberately absent so model-facing content stays free of it.
 */
export function buildResultEnvelope(interactions: readonly ChildInteraction[]): ResultEnvelope {
  const delimiter = `${RESULT_ENVELOPE_PREFIX}-${randomUUID()}`;
  const content = interactions
    .map((interaction, index) =>
      [
        `${delimiter}-BEGIN-${index}`,
        `interactionId: ${interaction.interactionId}`,
        `taskIndex: ${interaction.taskIndex}`,
        `status: ${interaction.status}`,
        `agent: ${interaction.agent}`,
        `name: ${interaction.name ?? ''}`,
        `childSessionId: ${interaction.childSessionId}`,
        `checkpointBefore: ${interaction.checkpointBefore ?? 'none'}`,
        `checkpointAfter: ${interaction.checkpointAfter ?? 'none'}`,
        `observedPaths: ${interaction.observedPaths.length > 0 ? interaction.observedPaths.join(', ') : 'none'}`,
        `truncated: ${formatTruncation(interaction)}`,
        `error: ${interaction.error ?? 'none'}`,
        `${delimiter}-BODY-${index}`,
        interaction.body,
        `${delimiter}-END-${index}`,
      ].join('\n'),
    )
    .join('\n');

  return { delimiter, content };
}

function formatTruncation(interaction: ChildInteraction): string {
  const truncation = interaction.truncation;
  if (!truncation) return 'no';
  return `yes; full output in ${truncation.sessionFile} at checkpoint ${truncation.checkpoint ?? 'none'} (${truncation.totalBytes} bytes, ${truncation.totalLines} lines)`;
}
