import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ChildInteractionStatus } from '../../results/child-interaction.ts';

/**
 * Observed lifecycle phase of one task.
 *
 * `queued` and `waiting` are deliberately distinct: a queued task has been admitted but
 * holds no concurrency slot and has no running timer, while a waiting task has started
 * and simply has not called a tool yet.
 */
export type TaskPhase = 'queued' | 'waiting' | 'running' | 'replied' | 'failed';

/** One observed tool call. Tool *outputs* are never recorded, only names and inputs. */
export interface ToolTrailEntry {
  tool: string;
  /** Summarized and length-capped at store time, never at render time. */
  input?: string;
  isError?: boolean;
}

export interface TaskProgress {
  index: number;
  label: string;
  /** Resolved subagent name; a `continue` task has none until its target resolves. */
  agent?: string;
  action: 'create' | 'continue';
  phase: TaskPhase;
  /** Terminal interaction status, once settled. Distinguishes failure from abort. */
  outcome?: ChildInteractionStatus;
  /** Epoch ms when the task acquired a slot. Absent while queued, so no timer runs. */
  startedAt?: number;
  settledAt?: number;
  toolUses: number;
  currentTool?: string;
  currentToolInput?: string;
  /** True between `tool_execution_start` and its matching `tool_execution_end`. */
  toolRunning: boolean;
  /** Terminal outcome of the most recently completed tool call. */
  lastToolError?: boolean;
  trail: ToolTrailEntry[];
  error?: string;
}

/** Bounds on what a spawn call persists into parent tool details. */
export const MAX_TOOL_TRAIL_ENTRIES = 12;
export const MAX_TOOL_INPUT_CHARS = 80;

/**
 * Aggregates child events into per-task progress.
 *
 * Only `agent_start`, `agent_end`, `tool_execution_start`, and `tool_execution_end` are
 * observed, and only tool names plus summarized inputs are recorded: child conversation
 * messages and tool results never leak into the parent through progress updates.
 *
 * This is a live activity display, not an account of record (design D17). The child's own
 * session file remains the single source of truth for what a child actually did.
 */
export class SpawnProgress {
  private readonly tasks: TaskProgress[];
  private readonly runningTools = new Map<string, { index: number; entry: ToolTrailEntry }>();
  private now: () => number;

  constructor(tasks: Array<Pick<TaskProgress, 'label' | 'agent' | 'action'>>, now: () => number = Date.now) {
    this.now = now;
    this.tasks = tasks.map((task, index) => ({
      index,
      label: task.label,
      agent: task.agent,
      action: task.action,
      phase: 'queued',
      toolUses: 0,
      toolRunning: false,
      trail: [],
    }));
  }

  /** A task moves from queued to waiting the moment it acquires a concurrency slot. */
  start(index: number): void {
    const task = this.tasks[index];
    if (!task) return;
    task.phase = 'waiting';
    task.startedAt = this.now();
  }

  /** A `continue` task learns its subagent only after the continuation target resolves. */
  resolveAgent(index: number, agent: string): void {
    const task = this.tasks[index];
    if (task) task.agent = agent;
  }

  observe(index: number, event: AgentSessionEvent): void {
    const task = this.tasks[index];
    if (!task || task.outcome) return;
    if (event.type === 'agent_start') {
      if (task.phase === 'queued') task.startedAt ??= this.now();
      task.phase = task.currentTool ? 'running' : 'waiting';
      task.settledAt = undefined;
      return;
    }
    if (event.type === 'agent_end') {
      // The runtime settles the authoritative outcome after retries and cleanup.
      // Do not briefly advertise a reply for an error/aborted low-level run.
      return;
    }
    if (event.type === 'tool_execution_start') {
      task.phase = 'running';
      task.toolUses += 1;
      task.toolRunning = true;
      task.currentTool = event.toolName;
      task.currentToolInput = summarizeToolInput(event.args);
      task.lastToolError = undefined;
      const entry: ToolTrailEntry = { tool: event.toolName, input: task.currentToolInput };
      task.trail.push(entry);
      // Keep only the newest calls so a long-running child cannot grow parent details.
      if (task.trail.length > MAX_TOOL_TRAIL_ENTRIES) task.trail.shift();
      this.runningTools.set(`${index}:${event.toolCallId}`, { index, entry });
      return;
    }
    if (event.type === 'tool_execution_end') {
      const key = `${index}:${event.toolCallId}`;
      const pending = this.runningTools.get(key);
      this.runningTools.delete(key);
      if (pending) pending.entry.isError = event.isError === true;
      const active = [...this.runningTools.values()].findLast(item => item.index === index);
      const displayed = active?.entry ?? pending?.entry;
      task.toolRunning = active !== undefined;
      task.lastToolError = active ? undefined : event.isError === true;
      task.currentTool = displayed?.tool ?? event.toolName;
      task.currentToolInput = displayed?.input;
    }
  }

  settle(index: number, status: ChildInteractionStatus, error?: string): void {
    const task = this.tasks[index];
    if (!task) return;
    task.outcome = status;
    task.phase = status === 'success' ? 'replied' : 'failed';
    task.error = error;
    task.toolRunning = false;
    task.settledAt = this.now();
    for (const [key, pending] of this.runningTools) {
      if (pending.index === index) this.runningTools.delete(key);
    }
  }

  snapshot(): TaskProgress[] {
    return this.tasks.map(task => ({ ...task, trail: task.trail.map(entry => ({ ...entry })) }));
  }
}

/**
 * Reduces a child-chosen tool argument object to one short display string.
 *
 * Truncation happens here, at store time, so nothing over-long is ever persisted.
 * Sanitization is the renderer's job; this only bounds length.
 */
export function summarizeToolInput(args: unknown): string | undefined {
  const value = pickSummaryValue(args);
  if (value === undefined) return undefined;
  const flattened = value.replace(/\s+/g, ' ').trim();
  if (!flattened) return undefined;
  return flattened.length > MAX_TOOL_INPUT_CHARS ? `${flattened.slice(0, MAX_TOOL_INPUT_CHARS - 1)}…` : flattened;
}

const SUMMARY_KEYS = ['command', 'pattern', 'file_path', 'filePath', 'path', 'query', 'url', 'name', 'description'];

function pickSummaryValue(args: unknown): string | undefined {
  if (typeof args === 'string') return args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined;
  const record = args as Record<string, unknown>;
  for (const key of SUMMARY_KEYS) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  const firstString = Object.values(record).find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return firstString;
}
