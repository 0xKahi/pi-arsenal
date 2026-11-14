import type { AssistantMessage, Usage } from '@earendil-works/pi-ai';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { formatTokens } from '../../../libs/format/tokens.ts';
import { CACHE_GLYPHS } from '../../../libs/tui-glyphs.ts';

export type FindContextWindow = (provider: string, model: string) => number | undefined;

export interface UsageTotals {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  latestCacheHitRate?: number;
}

export interface ChildSessionSummary {
  provider: string;
  model: string;
  thinkingLevel: string;
  totals: UsageTotals;
  contextTokens: number | null;
  contextWindow: number | null;
  contextPercent: number | null;
}

export function calculateUsageTotals(entries: readonly SessionEntry[]): UsageTotals {
  const totals: UsageTotals = { totalInput: 0, totalOutput: 0, totalCacheRead: 0, totalCacheWrite: 0, totalCost: 0 };
  for (const entry of entries) {
    let usage: Usage | undefined;
    if (entry.type === 'message' && entry.message.role === 'assistant') {
      usage = entry.message.usage;
      const prompt = usage ? usage.input + usage.cacheRead + usage.cacheWrite : 0;
      totals.latestCacheHitRate = usage && prompt > 0 ? (usage.cacheRead / prompt) * 100 : undefined;
    } else if (entry.type === 'message' && entry.message.role === 'toolResult') {
      usage = entry.message.usage;
    } else if (entry.type === 'usage' || entry.type === 'compaction' || entry.type === 'branch_summary') {
      usage = entry.usage;
    }
    if (!usage) continue;
    totals.totalInput += usage.input;
    totals.totalOutput += usage.output;
    totals.totalCacheRead += usage.cacheRead;
    totals.totalCacheWrite += usage.cacheWrite;
    totals.totalCost += usage.cost.total;
  }
  return totals;
}

export function buildChildSessionSummary(path: readonly SessionEntry[], findContextWindow: FindContextWindow = () => undefined): ChildSessionSummary {
  let last: AssistantMessage | undefined;
  let context: AssistantMessage | undefined;
  let thinking = '—';
  for (const entry of path) {
    if (entry.type === 'thinking_level_change') thinking = entry.thinkingLevel;
    if (entry.type === 'compaction') context = undefined;
    if (entry.type !== 'message' || entry.message.role !== 'assistant') continue;
    last = entry.message;
    const usage = last.usage;
    if (
      last.stopReason !== 'aborted' &&
      last.stopReason !== 'error' &&
      usage &&
      (usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite) > 0
    )
      context = last;
  }
  const provider = last?.provider ?? '—';
  const model = last?.responseModel ?? last?.model ?? '—';
  const contextModel = context ?? last;
  let window: number | undefined;
  try {
    if (contextModel)
      window =
        findContextWindow(contextModel.provider, contextModel.model) ??
        (contextModel.responseModel ? findContextWindow(contextModel.provider, contextModel.responseModel) : undefined);
  } catch {
    window = undefined;
  }
  const contextWindow = window && Number.isFinite(window) && window > 0 ? window : null;
  const usage = context?.usage;
  const contextTokens = usage ? usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite : null;
  return {
    provider,
    model,
    thinkingLevel: last?.thinkingLevel ?? thinking,
    totals: calculateUsageTotals(path),
    contextTokens,
    contextWindow,
    contextPercent: contextTokens !== null && contextWindow !== null ? (contextTokens / contextWindow) * 100 : null,
  };
}

export interface SpendLineSegment {
  text: string;
  tone: 'dim' | 'warning' | 'error';
}

export function buildSpendLineSegments(summary: ChildSessionSummary): SpendLineSegment[] {
  const { totals, contextPercent, contextWindow } = summary;
  const segments: SpendLineSegment[] = [];
  const dim = (text: string) => segments.push({ text, tone: 'dim' });
  if (totals.totalInput) dim(`↑${formatTokens(totals.totalInput)}`);
  if (totals.totalOutput) dim(`↓${formatTokens(totals.totalOutput)}`);
  if (totals.totalCacheRead || totals.totalCacheWrite) {
    const hit = totals.latestCacheHitRate === undefined ? '' : ` ${totals.latestCacheHitRate.toFixed(1)}%`;
    dim(
      `${CACHE_GLYPHS.cache}[${CACHE_GLYPHS.cacheRead}${formatTokens(totals.totalCacheRead)} ${CACHE_GLYPHS.cacheWrite}${formatTokens(totals.totalCacheWrite)}${hit}]`,
    );
  }
  if (totals.totalCost) dim(`$${totals.totalCost.toFixed(3)}`);
  segments.push({
    text: contextWindow === null ? '?' : `${contextPercent === null ? '?' : `${contextPercent.toFixed(1)}%`}/${formatTokens(contextWindow)}`,
    tone: contextPercent !== null && contextPercent > 90 ? 'error' : contextPercent !== null && contextPercent > 70 ? 'warning' : 'dim',
  });
  return segments;
}
