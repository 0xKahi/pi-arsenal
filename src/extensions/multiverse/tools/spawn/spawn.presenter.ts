import type { ChildInteraction } from '../../results/child-interaction.types.ts';
import type { TaskProgress } from './spawn-progress.ts';

export interface TaskPresentation {
  status: TaskProgress['status'];
  label: string;
  agent: string;
  currentTool?: string;
  error?: string;
  interaction?: ChildInteraction;
}

const MARKERS: Record<TaskProgress['status'], string> = {
  success: '✓',
  failure: '✗',
  aborted: '⚠',
  running: '…',
  pending: '○',
};

/** Renders spawn state for the user. Never emits raw result-envelope markup. */
export function renderSpawnPresentation(input: { tasks: TaskPresentation[]; expanded?: boolean }): string {
  return input.tasks.map((task, index) => renderTask(task, index, input.expanded === true)).join('\n');
}

function renderTask(task: TaskPresentation, index: number, expanded: boolean): string {
  const suffix = [task.currentTool ? `tool=${task.currentTool}` : '', task.error ? `error=${task.error}` : ''].filter(Boolean).join(' ');
  const header = `${MARKERS[task.status]} ${index + 1}. ${task.label} (${task.agent})${suffix ? ` ${suffix}` : ''}`;
  if (!expanded) return header;

  const interaction = task.interaction;
  const details = [
    `child=${interaction?.childSessionId ?? 'pending'}`,
    `checkpoint=${interaction?.checkpointAfter ?? 'none'}`,
    `paths=${interaction && interaction.observedPaths.length > 0 ? interaction.observedPaths.join(', ') : 'none'}`,
  ];
  if (interaction?.truncation) details.push(`full output: ${interaction.truncation.sessionFile}`);
  // Telemetry is user-only and deliberately absent from model-facing content.
  if (interaction) {
    details.push(
      `model=${interaction.telemetry.model ?? 'unknown'} ${interaction.telemetry.durationMs}ms ${interaction.telemetry.tokensInput}in/${interaction.telemetry.tokensOutput}out $${interaction.telemetry.cost.toFixed(4)}`,
    );
  }
  const body = interaction?.body ? `\n${interaction.body}` : '';
  return `${header}\n${details.join(' ')}${body}`;
}
