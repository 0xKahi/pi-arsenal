import { dye } from '@0xkahi/cli-dye';
import type { AgentToolResult } from '@earendil-works/pi-agent-core';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type ThemeColor,
  type ToolDefinition,
  truncateHead,
} from '@earendil-works/pi-coding-agent';
import { type Component, Container, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { memberNames, type P2pStateSource, resolveState, textResult } from './tool-helpers';

export const P2pAskToolName = 'p2p_ask';
export const P2P_ASK_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
export const P2P_ASK_SPINNER_INTERVAL_MS = 80;

export interface P2pAskRequest {
  to: string;
  prompt: string;
}

export interface P2pAskPendingEntry {
  to: string;
  state: 'pending';
}

export interface P2pAskSuccessEntry {
  to: string;
  state: 'success';
  from: string;
  reply: string;
  truncated?: boolean;
}

export interface P2pAskFailureEntry {
  to: string;
  state: 'failure';
  error: string;
  message: string;
  elapsed?: string;
}

export type P2pAskEntry = P2pAskPendingEntry | P2pAskSuccessEntry | P2pAskFailureEntry;

export interface P2pAskBatchDetails {
  kind: 'batch';
  entries: P2pAskEntry[];
}

export interface P2pAskValidationDetails {
  kind: 'validation';
  error: 'duplicate_target';
  duplicateTargets: string[];
}

export type P2pAskDetails = P2pAskBatchDetails | P2pAskValidationDetails;

type MutableAskEntry = P2pAskPendingEntry | (Omit<P2pAskSuccessEntry, 'reply' | 'truncated'> & { rawReply: string }) | P2pAskFailureEntry;

type P2pAskTheme = {
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
};

export const p2pAskSchema = Type.Object({
  requests: Type.Array(
    Type.Object({
      to: Type.String({ description: 'Target agent name (see p2p_ls for connected members)' }),
      prompt: Type.String({ description: 'Role-specific prompt to send to this target' }),
    }),
    { minItems: 1, description: 'Ordered requests with one unique target per entry' },
  ),
});

export function normalizeP2pAskArguments(args: unknown): { requests: P2pAskRequest[] } {
  if (!args || typeof args !== 'object') return { requests: [] };
  const input = args as { requests?: unknown; to?: unknown; prompt?: unknown };
  if (Array.isArray(input.requests)) return { requests: input.requests as P2pAskRequest[] };
  if (typeof input.to === 'string' && typeof input.prompt === 'string') {
    return { requests: [{ to: input.to, prompt: input.prompt }] };
  }
  return { requests: [] };
}

export function createP2pAskTool(source: P2pStateSource): ToolDefinition<typeof p2pAskSchema, P2pAskDetails | Record<string, unknown>> {
  return {
    name: P2pAskToolName,
    label: 'p2p ask',
    description:
      'Synchronous RPC: concurrently send prompt(s) to one or more connected p2p-council agent(s) and wait for their actual assistant reply. ' +
      `each remote agent processes the prompt as a new turn. Replies are limited to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: 'p2p_ask({to, prompt}[]): concurrently ask distinct p2p-council agents with specific prompts and receive its assistant(s) reply',
    promptGuidelines: [
      'Only usable while connected to a p2p council. The target(s) must be idle and able to run a turn.',
      'Every p2p_ask target must be unique within one batch.',
      'use when you need immediate answer back from one or more council agent',
      'use when you want to batch multiple synchronous prompts to different agents and receive their replies in one turn',
    ],
    parameters: p2pAskSchema,
    prepareArguments(args) {
      return normalizeP2pAskArguments(args);
    },
    async execute(_toolCallId, params, signal, onUpdate): Promise<AgentToolResult<P2pAskDetails | Record<string, unknown>>> {
      // Direct test/SDK callers can bypass Pi's prepareArguments hook, so normalize here too.
      const requests = normalizeP2pAskArguments(params).requests;
      const duplicates = duplicateTargets(requests);
      if (duplicates.length > 0) {
        const message = `Duplicate p2p_ask target${duplicates.length === 1 ? '' : 's'}: ${duplicates.map(name => `"${name}"`).join(', ')}. No prompts were dispatched.`;
        return textResult(message, { kind: 'validation', error: 'duplicate_target', duplicateTargets: duplicates });
      }

      const state = resolveState(source);
      if (!state?.isConnected()) {
        return batchFailureResult(requests, 'not_connected', 'Not connected to a council. Run /p2p-council to join one.');
      }
      if (signal?.aborted) return batchFailureResult(requests, 'aborted', 'Prompt request aborted');

      const entries: MutableAskEntry[] = requests.map(request => ({ to: request.to, state: 'pending' }));
      publishSnapshot(entries, onUpdate);
      const connected = memberNames(state);

      await Promise.all(
        requests.map(async (request, index) => {
          const result = await state.askPrompt(request.to, request.prompt, signal);
          if (result.error) {
            const error = normalizeAskError(request.to, result.error, connected);
            entries[index] = { to: request.to, state: 'failure', error: error.code, message: error.message, elapsed: error.elapsed };
          } else {
            entries[index] = {
              to: request.to,
              state: 'success',
              from: result.from ?? request.to,
              rawReply: result.response ?? '(no response)',
            };
          }
          publishSnapshot(entries, onUpdate);
        }),
      );

      const details: P2pAskBatchDetails = { kind: 'batch', entries: boundBatchEntries(entries) };
      return { content: [{ type: 'text', text: formatModelContent(details.entries) }], details };
    },
    renderCall() {
      return new Container();
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const requests = normalizeP2pAskArguments(context?.args).requests;
      const details = normalizeP2pAskDetails(result, requests, isPartial);
      const prior = context?.lastComponent;
      const component =
        prior instanceof P2pAskBatchResultComponent ? prior : new P2pAskBatchResultComponent(theme, context?.invalidate ?? (() => {}));
      component.update(details, requests, expanded);
      return component;
    },
  };
}

export class P2pAskBatchResultComponent implements Component {
  private details: P2pAskDetails | undefined;
  private requests: P2pAskRequest[] = [];
  private expanded = false;
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly theme: P2pAskTheme,
    private readonly requestRender: () => void,
  ) {}

  public update(details: P2pAskDetails | undefined, requests: P2pAskRequest[], expanded: boolean): void {
    this.details = details;
    this.requests = requests;
    this.expanded = expanded;
    const hasPending = details?.kind === 'batch' && details.entries.some(entry => entry.state === 'pending');
    if (hasPending && !this.timer) {
      this.timer = setInterval(() => {
        this.frame = (this.frame + 1) % P2P_ASK_SPINNER_FRAMES.length;
        this.requestRender();
      }, P2P_ASK_SPINNER_INTERVAL_MS);
      this.timer.unref?.();
    } else if (!hasPending) {
      this.stopTimer();
    }
  }

  public render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const lines: string[] = [truncateToWidth(this.theme.fg('toolTitle', this.theme.bold('p2p_ask')), safeWidth, '')];
    if (this.details?.kind === 'validation') {
      lines.push(...wrapStyled(this.theme.fg('error', `✗ Duplicate targets: ${this.details.duplicateTargets.join(', ')}`), safeWidth));
      return lines;
    }

    const entries =
      this.details?.kind === 'batch' ? this.details.entries : this.requests.map(request => ({ to: request.to, state: 'pending' as const }));
    entries.forEach((entry, index) => {
      const last = index === entries.length - 1;
      const connector = last ? '└─ ' : '├─ ';
      const symbol = entry.state === 'pending' ? P2P_ASK_SPINNER_FRAMES[this.frame] : entry.state === 'success' ? '✓' : '✗';
      const symbolColor = entry.state === 'pending' ? 'accent' : entry.state === 'success' ? 'success' : 'error';
      lines.push(
        truncateToWidth(
          `${this.theme.fg('dim', connector)}${this.theme.fg(symbolColor, symbol ?? '')} ${this.theme.fg('text', entry.to)}`,
          safeWidth,
          '',
        ),
      );
      if (this.expanded) {
        const prompt = this.requests[index]?.prompt ?? '';
        const continuation = last ? '   ' : '│  ';
        const promptPrefix = `${continuation}  `;
        const promptWidth = Math.max(1, safeWidth - promptPrefix.length);
        for (const promptLine of wrapTextWithAnsi(this.theme.fg('dim', dye.strip(prompt)), promptWidth)) {
          lines.push(truncateToWidth(this.theme.fg('dim', promptPrefix) + promptLine, safeWidth, ''));
        }
      }
    });

    const counts = countEntries(entries);
    const countParts: string[] = [];
    if (counts.success > 0 || (counts.failure === 0 && counts.pending === 0)) countParts.push(plural(counts.success, 'reply', 'replies'));
    if (counts.failure > 0) countParts.push(plural(counts.failure, 'failure', 'failures'));
    if (counts.pending > 0) countParts.push(plural(counts.pending, 'pending request', 'pending requests'));
    lines.push(truncateToWidth(this.theme.fg('success', '↩ ') + this.theme.fg('muted', countParts.join(' · ')), safeWidth, ''));

    if (this.expanded) {
      for (const entry of entries) {
        if (entry.state === 'pending') continue;
        const success = entry.state === 'success';
        const symbol = this.theme.fg(success ? 'success' : 'error', success ? '✓' : '✗');
        lines.push(truncateToWidth(`${symbol} ${this.theme.fg('text', entry.to)}`, safeWidth, ''));
        const body = success ? entry.reply : entry.message;
        const bodyWidth = Math.max(1, safeWidth - 2);
        for (const bodyLine of wrapTextWithAnsi(this.theme.fg(success ? 'muted' : 'error', dye.strip(body)), bodyWidth)) {
          lines.push(truncateToWidth(`  ${bodyLine}`, safeWidth, ''));
        }
      }
    }
    return lines;
  }

  public invalidate(): void {}

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

function normalizeP2pAskDetails(
  result: AgentToolResult<P2pAskDetails | Record<string, unknown>>,
  requests: P2pAskRequest[],
  isPartial: boolean,
): P2pAskDetails | undefined {
  const details = result.details as Record<string, unknown> | undefined;
  if (details?.kind === 'batch' && Array.isArray(details.entries)) return details as unknown as P2pAskBatchDetails;
  if (details?.kind === 'validation' && Array.isArray(details.duplicateTargets)) return details as unknown as P2pAskValidationDetails;
  const request = requests[0];
  if (!request) return undefined;
  if (isPartial) return { kind: 'batch', entries: [{ to: request.to, state: 'pending' }] };
  const content = result.content[0];
  const message = content?.type === 'text' ? content.text : '';
  const legacyTo = typeof details?.to === 'string' ? details.to : request.to;
  const legacyError = typeof details?.error === 'string' ? details.error : undefined;
  if (legacyError) {
    return {
      kind: 'batch',
      entries: [
        {
          to: legacyTo,
          state: 'failure',
          error: legacyError,
          message,
          elapsed: typeof details?.elapsed === 'string' ? details.elapsed : undefined,
        },
      ],
    };
  }
  return {
    kind: 'batch',
    entries: [
      {
        to: legacyTo,
        state: 'success',
        from: typeof details?.from === 'string' ? details.from : legacyTo,
        reply: message,
        truncated: details?.truncated === true || undefined,
      },
    ],
  };
}

function duplicateTargets(requests: P2pAskRequest[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const request of requests) {
    if (seen.has(request.to)) duplicates.add(request.to);
    seen.add(request.to);
  }
  return [...duplicates];
}

function publishSnapshot(
  entries: MutableAskEntry[],
  onUpdate: ((result: AgentToolResult<P2pAskDetails | Record<string, unknown>>) => void) | undefined,
): void {
  if (!onUpdate) return;
  const details: P2pAskBatchDetails = { kind: 'batch', entries: boundBatchEntries(entries) };
  onUpdate({ content: [{ type: 'text', text: formatProgressContent(details.entries) }], details });
}

function batchFailureResult(requests: P2pAskRequest[], code: string, message: string): AgentToolResult<P2pAskDetails> {
  const entries: P2pAskFailureEntry[] = requests.map(request => ({ to: request.to, state: 'failure', error: code, message }));
  return { content: [{ type: 'text', text: formatModelContent(entries) }], details: { kind: 'batch', entries } };
}

function boundBatchEntries(entries: MutableAskEntry[]): P2pAskEntry[] {
  const successEntries = entries.filter((entry): entry is Extract<MutableAskEntry, { state: 'success' }> => entry.state === 'success');
  if (successEntries.length === 0) return entries.map(cloneNonRawEntry);

  const fixedEntries: P2pAskEntry[] = entries.map(entry =>
    entry.state === 'success' ? { to: entry.to, from: entry.from, state: 'success', reply: '' } : cloneNonRawEntry(entry),
  );
  const notices = successEntries.map(entry => `[Reply from "${entry.to}" truncated to fit aggregate tool-output limits.]`);
  const fixedContent = formatModelContent(fixedEntries);
  const byteBudget = Math.max(
    0,
    DEFAULT_MAX_BYTES - Buffer.byteLength(fixedContent) - notices.reduce((sum, notice) => sum + Buffer.byteLength(`\n${notice}`), 0),
  );
  const lineBudget = Math.max(0, DEFAULT_MAX_LINES - countLines(fixedContent) - successEntries.length);
  const byteShares = fairShares(
    successEntries.map(entry => Buffer.byteLength(entry.rawReply)),
    byteBudget,
  );
  const lineShares = fairShares(
    successEntries.map(entry => countLines(entry.rawReply)),
    lineBudget,
  );
  let successIndex = 0;

  return entries.map(entry => {
    if (entry.state !== 'success') return cloneNonRawEntry(entry);
    const index = successIndex++;
    const truncation = truncateHead(entry.rawReply, { maxBytes: byteShares[index] ?? 0, maxLines: lineShares[index] ?? 0 });
    const notice = notices[index] ?? '[Reply truncated to fit aggregate tool-output limits.]';
    const reply = truncation.truncated ? `${truncation.content}${truncation.content ? '\n' : ''}${notice}` : truncation.content;
    return { to: entry.to, state: 'success', from: entry.from, reply, truncated: truncation.truncated || undefined };
  });
}

function fairShares(needs: number[], budget: number): number[] {
  const shares = Array(needs.length).fill(0) as number[];
  let remaining = Math.max(0, Math.floor(budget));
  let active = needs.map((_, index) => index);
  while (active.length > 0 && remaining > 0) {
    const share = Math.max(1, Math.floor(remaining / active.length));
    const next: number[] = [];
    for (const index of active) {
      const requested = needs[index] ?? 0;
      const allocated = shares[index] ?? 0;
      const need = Math.max(0, requested - allocated);
      const grant = Math.min(need, share, remaining);
      shares[index] = allocated + grant;
      remaining -= grant;
      if (shares[index] < requested) next.push(index);
    }
    if (next.length === active.length && share === 0) break;
    active = next;
  }
  return shares;
}

function cloneNonRawEntry(entry: MutableAskEntry): P2pAskEntry {
  if (entry.state === 'success') return { to: entry.to, state: 'success', from: entry.from, reply: entry.rawReply };
  return { ...entry };
}

function formatProgressContent(entries: P2pAskEntry[]): string {
  const counts = countEntries(entries);
  return `p2p_ask: ${counts.success} replies, ${counts.failure} failures, ${counts.pending} pending`;
}

function formatModelContent(entries: P2pAskEntry[]): string {
  return entries
    .filter((entry): entry is Exclude<P2pAskEntry, P2pAskPendingEntry> => entry.state !== 'pending')
    .map(entry => (entry.state === 'success' ? `Reply from "${entry.to}":\n${entry.reply}` : `Failure from "${entry.to}":\n${entry.message}`))
    .join('\n\n');
}

function countEntries(entries: P2pAskEntry[]): { pending: number; success: number; failure: number } {
  return entries.reduce(
    (counts, entry) => {
      counts[entry.state]++;
      return counts;
    },
    { pending: 0, success: 0, failure: 0 },
  );
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function wrapStyled(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width)).map(line => truncateToWidth(line, width, ''));
}

interface NormalizedAskError {
  code: string;
  message: string;
  elapsed?: string;
}

function normalizeAskError(to: string, error: string, connected: string[]): NormalizedAskError {
  if (error === 'not_connected') return { code: 'not_connected', message: 'Not connected to a council' };
  if (error === 'self_target') return { code: 'self_target', message: `Cannot ask yourself ("${to}")` };
  if (error === 'not_found' || error.includes('not found')) {
    return { code: 'not_found', message: `Agent "${to}" not found. Connected: ${connected.join(', ') || '(none)'}` };
  }
  if (error === 'Terminal is busy' || error === 'busy') {
    return { code: 'busy', message: `Agent "${to}" is busy and declined the prompt` };
  }
  if (error.startsWith('inactivity_timeout:')) {
    const [, target, seconds] = error.split(':');
    return {
      code: 'inactivity_timeout',
      message: `Prompt to "${target ?? to}" timed out after ${seconds ?? 'the inactivity limit'} without activity`,
      elapsed: seconds,
    };
  }
  if (error.startsWith('hard_ceiling:')) {
    const [, minutes] = error.split(':');
    return {
      code: 'hard_ceiling',
      message: `Prompt to "${to}" hit the hard ceiling after ${minutes ?? 'the configured limit'}`,
      elapsed: minutes,
    };
  }
  if (error.startsWith('disconnected:')) return { code: 'disconnected', message: `Agent "${to}" disconnected before answering` };
  if (error === 'aborted') return { code: 'aborted', message: `Prompt request to "${to}" aborted` };
  if (error === 'not_delivered') return { code: 'not_delivered', message: `Failed to send prompt to "${to}"` };
  if (error === 'runtime_temporarily_unavailable') {
    return { code: error, message: `Agent "${to}" is temporarily unavailable during a session transition` };
  }
  return { code: 'remote_error', message: `Prompt to "${to}" failed: ${error}` };
}
