import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

export type TaskProgressStatus = 'pending' | 'running' | 'success' | 'failure' | 'aborted';

export interface TaskProgress {
  index: number;
  label: string;
  agent: string;
  status: TaskProgressStatus;
  currentTool?: string;
  error?: string;
}

/**
 * Aggregates child events into per-task progress.
 *
 * Only tool names and terminal states are surfaced: child conversation messages never
 * leak into the parent's history through progress updates.
 */
export class SpawnProgress {
  private readonly tasks: TaskProgress[];

  constructor(tasks: Array<Pick<TaskProgress, 'label' | 'agent'>>) {
    this.tasks = tasks.map((task, index) => ({ index, ...task, status: 'pending' }));
  }

  start(index: number): void {
    const task = this.tasks[index];
    if (task) task.status = 'running';
  }

  observe(index: number, event: AgentSessionEvent): void {
    const task = this.tasks[index];
    if (!task) return;
    if (event.type === 'tool_execution_start') task.currentTool = event.toolName;
    if (event.type === 'tool_execution_end') task.currentTool = undefined;
  }

  settle(index: number, status: Exclude<TaskProgressStatus, 'pending' | 'running'>, error?: string): void {
    const task = this.tasks[index];
    if (!task) return;
    task.status = status;
    task.error = error;
    task.currentTool = undefined;
  }

  snapshot(): TaskProgress[] {
    return this.tasks.map(task => ({ ...task }));
  }
}
