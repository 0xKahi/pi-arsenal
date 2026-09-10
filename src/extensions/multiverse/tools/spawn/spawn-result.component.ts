import { dye } from '@0xkahi/cli-dye';
import type { ThemeColor } from '@earendil-works/pi-coding-agent';
import { type Component, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { SPINNER_INTERVAL_MS, STATUS_SYMBOLS, spinnerFrame, treeConnector, treeContinuation } from '../../../../libs/tui-glyphs.ts';
import type { ChildInteraction, SpawnToolDetails } from '../../results/child-interaction.ts';
import type { SpawnInput, SpawnTask } from './spawn.schema.ts';
import type { TaskPhase, TaskProgress, ToolTrailEntry } from './spawn-progress.ts';

/** Collapsed rows are capped so a large batch cannot eat the editor. */
export const MAX_VISIBLE_TASK_ROWS = 10;
export const MAX_SHARED_CONTEXT_LINES = 10;

/** Minimal structural theme, so the component is renderable in tests without a full Theme. */
export interface SpawnTheme {
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
}

/**
 * Everything one repaint needs: the per-task rows plus the batch-scoped values that are
 * properties of the call rather than of any single task.
 */
export interface SpawnResultUpdateOptions {
  rows: SpawnTaskRow[];
  expanded: boolean;
  boundaryNonce?: string;
  sharedContext?: string;
}

/** One task as the view needs it, merged from live progress, settled interactions, and call args. */
export interface SpawnTaskRow {
  index: number;
  label: string;
  agent: string;
  action: 'create' | 'continue';
  phase: TaskPhase;
  elapsedMs?: number;
  toolUses: number;
  currentTool?: string;
  currentToolInput?: string;
  toolRunning: boolean;
  lastToolError?: boolean;
  trail: ToolTrailEntry[];
  error?: string;
  prompt?: string;
  interaction?: ChildInteraction;
}

const UNSETTLED: ReadonlySet<TaskPhase> = new Set<TaskPhase>(['queued', 'waiting', 'running']);

/**
 * Stateful spawn tool row, reused across renders through `context.lastComponent`.
 *
 * It drives its own repaint interval rather than rendering only on child events, because a
 * child sitting inside one long tool call emits nothing: an event-driven view would freeze
 * its timer and spinner exactly when the user most wants motion.
 *
 * Everything here is presentation only. Nothing rendered reaches model context.
 */
export class SpawnResultComponent implements Component {
  private rows: SpawnTaskRow[] = [];
  private expanded = false;
  private tick = 0;
  private boundaryNonce?: string;
  private sharedContext?: string;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly theme: SpawnTheme,
    private readonly requestRender: () => void,
  ) {}

  public update(options: SpawnResultUpdateOptions): void {
    this.boundaryNonce = options.boundaryNonce;
    this.sharedContext = options.sharedContext;
    this.rows = options.rows;
    this.expanded = options.expanded;
    const unsettled = options.rows.some(row => UNSETTLED.has(row.phase));
    if (unsettled && !this.timer) {
      this.timer = setInterval(() => {
        this.tick += 1;
        this.requestRender();
      }, SPINNER_INTERVAL_MS);
      this.timer.unref?.();
    } else if (!unsettled) {
      this.stopTimer();
    }
  }

  public render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    try {
      return this.renderRows(safeWidth);
    } catch {
      // A render failure must degrade to plain text, never take down the parent TUI.
      return this.rows.map(row => truncateToWidth(plain(`${row.index + 1}. ${row.agent} · ${row.phase}`), safeWidth, ''));
    }
  }

  public invalidate(): void {}

  /** Idempotent; the interval is also stopped whenever every task has settled. */
  public dispose(): void {
    this.stopTimer();
  }

  private renderRows(safeWidth: number): string[] {
    const lines: string[] = [];
    if (this.boundaryNonce)
      lines.push(
        truncateToWidth(
          this.theme.fg('toolTitle', this.theme.bold('spawn')) +
            ' ' +
            this.theme.fg('muted', plain(this.boundaryNonce)) +
            ' ' +
            this.theme.fg('syntaxNumber', `(${this.rows.length})`),
          safeWidth,
          '',
        ),
      );
    if (this.expanded) lines.push(...this.renderSharedContext(safeWidth));
    const visible = this.expanded ? this.rows : this.rows.slice(0, MAX_VISIBLE_TASK_ROWS);
    visible.forEach((row, position) => {
      const isLast = position === this.rows.length - 1;
      lines.push(...this.renderRow(row, isLast, safeWidth));
    });
    const hidden = this.rows.length - visible.length;
    if (hidden > 0) {
      lines.push(truncateToWidth(this.theme.fg('dim', `${treeConnector(true)}… ${hidden} more task${hidden === 1 ? '' : 's'}`), safeWidth, ''));
    }
    const footer = this.renderFooter(safeWidth);
    if (footer) lines.push(footer);
    if (this.expanded) lines.push(...this.renderExpanded(safeWidth));
    return lines;
  }

  private renderSharedContext(safeWidth: number): string[] {
    const indent = treeContinuation(false);
    const lines = [truncateToWidth(this.theme.fg('dim', `${indent}󰦪 shared context:`), safeWidth, '')];
    const body = this.sharedContext?.trim() ? plain(this.sharedContext) : 'none';
    const wrapped = wrapTextWithAnsi(body, Math.max(1, safeWidth - indent.length));
    const visible = wrapped.slice(0, MAX_SHARED_CONTEXT_LINES);
    lines.push(...visible.map(line => truncateToWidth(this.theme.fg('dim', indent + line), safeWidth, '')));
    if (wrapped.length > MAX_SHARED_CONTEXT_LINES) {
      const remaining = wrapped.length - MAX_SHARED_CONTEXT_LINES;
      lines.push(truncateToWidth(this.theme.fg('dim', `${indent}… ${remaining} more line${remaining === 1 ? '' : 's'}`), safeWidth, ''));
    }
    lines.push(this.theme.fg('dim', indent));
    return lines;
  }

  private renderRow(row: SpawnTaskRow, isLast: boolean, safeWidth: number): string[] {
    const connector = this.theme.fg('dim', treeConnector(isLast));
    const number = this.theme.fg('syntaxOperator', `[${row.index + 1}]`);
    const origin = row.action === 'create' ? 'new' : 'resume';
    const separator = this.theme.fg('dim', ' · ');
    const header =
      connector +
      this.theme.fg('text', this.theme.bold(plain(row.agent))) +
      ' ' +
      number +
      separator +
      this.theme.fg('muted', origin) +
      separator +
      this.theme.fg('dim', formatElapsed(row));

    const indent = treeContinuation(isLast);
    const activity =
      this.theme.fg('muted', `${row.toolUses} tool${row.toolUses === 1 ? '' : 's'}`) +
      separator +
      this.theme.fg(activityColor(row), this.activitySymbol(row)) +
      ' ' +
      this.theme.fg(activityColor(row), plain(describeActivity(row)));

    const lines = [truncateToWidth(header, safeWidth, ''), truncateToWidth(this.theme.fg('dim', indent) + activity, safeWidth, '')];
    if (this.expanded) {
      const add = (text: string) => {
        for (const line of wrapTextWithAnsi(plain(text), Math.max(1, safeWidth - indent.length))) {
          lines.push(truncateToWidth(this.theme.fg('dim', indent + line), safeWidth, ''));
        }
      };
      add(' tool logs:');
      if (row.toolUses > row.trail.length) add(`… ${row.toolUses - row.trail.length} earlier calls omitted`);
      for (const entry of row.trail) {
        const symbol =
          entry.isError === undefined
            ? UNSETTLED.has(row.phase)
              ? spinnerFrame(this.tick)
              : STATUS_SYMBOLS.pending
            : entry.isError
              ? STATUS_SYMBOLS.failure
              : STATUS_SYMBOLS.success;
        add(`- ${symbol} ${entry.tool}${entry.input ? ` ${entry.input}` : ''}`);
      }
      add('');
      add('󰻞 prompt:');
      add(row.prompt ?? '');
    }
    return lines;
  }

  private renderFooter(safeWidth: number): string {
    const counts = { replied: 0, failed: 0, running: 0, queued: 0 };
    for (const row of this.rows) {
      if (row.phase === 'replied') counts.replied += 1;
      else if (row.phase === 'failed') counts.failed += 1;
      else if (row.phase === 'queued') counts.queued += 1;
      else counts.running += 1;
    }
    const parts: string[] = [];
    if (counts.replied > 0) parts.push(`${counts.replied} ${counts.replied === 1 ? 'reply' : 'replies'}`);
    if (counts.failed > 0) parts.push(`${counts.failed} failed`);
    if (parts.length === 0) return '';
    return truncateToWidth(this.theme.fg('muted', ` ${parts.join(' · ')}`), safeWidth, '');
  }

  /**
   * The expanded view holds everything 13.2 removed from model context: prompt, activity
   * trail, child session ID, checkpoints, telemetry, and the response itself.
   */
  private renderExpanded(safeWidth: number): string[] {
    const lines: string[] = [];
    for (const row of this.rows) {
      const interaction = row.interaction;
      if (UNSETTLED.has(row.phase)) continue;
      lines.push('');
      const symbolColor: ThemeColor = row.phase === 'failed' ? 'error' : row.phase === 'replied' ? 'success' : 'accent';
      const symbol = row.phase === 'failed' ? STATUS_SYMBOLS.failure : row.phase === 'replied' ? STATUS_SYMBOLS.success : STATUS_SYMBOLS.pending;
      lines.push(
        truncateToWidth(
          `${this.theme.fg(symbolColor, symbol)} ${this.theme.fg('text', plain(row.agent))} ${this.theme.fg('syntaxOperator', `[${row.index + 1}]`)}`,
          safeWidth,
          '',
        ),
      );
      lines.push(truncateToWidth('  ---', safeWidth, ''));
      const child = interaction?.childSessionId || (row.action === 'continue' ? 'unreachable' : 'none');
      lines.push(...this.wrapField(safeWidth, 'childSessionId', child, 'muted'));
      if (interaction) {
        lines.push(...this.wrapField(safeWidth, 'status', interaction.status, 'muted'));
        lines.push(...this.wrapField(safeWidth, 'interactionId', interaction.interactionId, 'muted'));
        lines.push(
          ...this.wrapField(
            safeWidth,
            'checkpoints',
            `${interaction.checkpointBefore ?? 'none'} → ${interaction.checkpointAfter ?? 'none'}`,
            'muted',
          ),
        );
        const telemetry = interaction.telemetry;
        lines.push(
          ...this.wrapField(
            safeWidth,
            'telemetry',
            `${telemetry.model ?? 'unknown'} · ${telemetry.durationMs}ms · ${telemetry.tokensInput}in/${telemetry.tokensOutput}out · $${telemetry.cost.toFixed(4)}`,
            'muted',
          ),
        );
        if (interaction.truncation) {
          lines.push(
            ...this.wrapField(
              safeWidth,
              'truncated',
              `cut from ${interaction.truncation.totalLines} lines / ${interaction.truncation.totalBytes} bytes`,
              'muted',
            ),
          );
        }
      }
      lines.push(truncateToWidth('  ---', safeWidth, ''));
      const body = row.error ?? interaction?.error ?? interaction?.body ?? '';
      if (body) lines.push(...this.wrapBody(safeWidth, body, row.phase === 'failed' ? 'error' : 'toolOutput'));
    }
    return lines;
  }

  private wrapField(safeWidth: number, label: string, value: string, color: ThemeColor): string[] {
    const prefix = `  ${label}: `;
    const bodyWidth = Math.max(1, safeWidth - prefix.length);
    const wrapped = wrapTextWithAnsi(this.theme.fg(color, plain(value)), bodyWidth);
    return wrapped.map((line, index) =>
      truncateToWidth((index === 0 ? this.theme.fg('dim', prefix) : ' '.repeat(prefix.length)) + line, safeWidth, ''),
    );
  }

  private wrapBody(safeWidth: number, body: string, color: ThemeColor): string[] {
    const bodyWidth = Math.max(1, safeWidth - 4);
    return wrapTextWithAnsi(this.theme.fg(color, plain(body)), bodyWidth).map(line => truncateToWidth(`    ${line}`, safeWidth, ''));
  }

  private activitySymbol(row: SpawnTaskRow): string {
    if (row.phase === 'queued') return STATUS_SYMBOLS.pending;
    if (row.phase === 'replied') return STATUS_SYMBOLS.replied;
    if (row.phase === 'failed') return STATUS_SYMBOLS.failure;
    if (row.phase === 'running' && row.currentTool && !row.toolRunning) return row.lastToolError ? STATUS_SYMBOLS.failure : STATUS_SYMBOLS.success;
    return spinnerFrame(this.tick);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

function activityColor(row: SpawnTaskRow): ThemeColor {
  if (row.phase === 'failed') return 'error';
  if (row.phase === 'replied') return 'success';
  if (row.phase === 'queued') return 'dim';
  if (row.currentTool && !row.toolRunning) return row.lastToolError ? 'error' : 'success';
  return 'accent';
}

function describeActivity(row: SpawnTaskRow): string {
  switch (row.phase) {
    case 'queued':
      return 'queued';
    case 'waiting':
      return 'waiting';
    case 'replied':
      return 'replied';
    case 'failed':
      return 'failed';
    default:
      return row.currentTool ? `${row.currentTool}${row.currentToolInput ? ` ${row.currentToolInput}` : ''}` : 'waiting';
  }
}

function formatElapsed(row: SpawnTaskRow): string {
  if (row.phase === 'queued' || row.elapsedMs === undefined) return '—';
  const seconds = Math.max(0, row.elapsedMs) / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
}

/**
 * Child-authored text is untrusted: strip ANSI, then neutralize any remaining control
 * characters, before it is ever styled or measured.
 */
function plain(value: string): string {
  let output = '';
  for (const character of dye.strip(value ?? '')) {
    const code = character.codePointAt(0) ?? 0;
    const isControl = code < 0x20 ? character !== '\n' && character !== '\t' : code === 0x7f;
    output += isControl ? ' ' : character;
  }
  return output;
}

/**
 * Builds view rows from whatever exists yet.
 *
 * Called before any child event arrives, so a batch's tree appears at dispatch with every
 * task's agent, 1-based number, and new/resume origin already correct.
 */
export function buildSpawnRows(options: {
  args: Partial<SpawnInput> | undefined;
  details: SpawnToolDetails | undefined;
  now?: number;
}): SpawnTaskRow[] {
  const now = options.now ?? Date.now();
  const tasks: SpawnTask[] = Array.isArray(options.args?.tasks) ? (options.args?.tasks as SpawnTask[]) : [];
  const progress = options.details?.progress ?? [];
  const interactions = options.details?.interactions ?? [];
  const length = Math.max(tasks.length, progress.length, interactions.length);

  return Array.from({ length }, (_, index) => {
    const task = tasks[index];
    const live = progress[index];
    const interaction = interactions[index];
    return {
      index,
      label: live?.label ?? (task ? describeFallbackLabel(task, index) : `task ${index + 1}`),
      agent: live?.agent ?? interaction?.agent ?? (task?.action === 'create' ? task.agent : 'child'),
      action: live?.action ?? (task?.action === 'continue' || (!task && interaction?.childSessionId && !live) ? 'continue' : 'create'),
      phase: live?.phase ?? phaseFromInteraction(interaction),
      elapsedMs: elapsed(live, interaction, now),
      toolUses: live?.toolUses ?? 0,
      currentTool: live?.currentTool,
      currentToolInput: live?.currentToolInput,
      toolRunning: live?.toolRunning ?? false,
      lastToolError: live?.lastToolError,
      trail: live?.trail ?? [],
      error: live?.error ?? interaction?.error,
      prompt: task?.task,
      interaction,
    } satisfies SpawnTaskRow;
  });
}

function describeFallbackLabel(task: SpawnTask, index: number): string {
  return task.action === 'create' ? `${task.agent} task ${index + 1}` : `continue ${task.childSessionId}`;
}

function phaseFromInteraction(interaction: ChildInteraction | undefined): TaskPhase {
  if (!interaction) return 'queued';
  return interaction.status === 'success' ? 'replied' : 'failed';
}

function elapsed(live: TaskProgress | undefined, interaction: ChildInteraction | undefined, now: number): number | undefined {
  if (live?.startedAt !== undefined) return (live.settledAt ?? now) - live.startedAt;
  return interaction?.telemetry.durationMs;
}
