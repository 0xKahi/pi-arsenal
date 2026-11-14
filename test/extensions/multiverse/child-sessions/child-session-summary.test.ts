import { expect, test } from 'bun:test';
import { buildChildSessionSnapshots } from '../../../../src/extensions/multiverse/child-sessions/child-session-projection.ts';
import {
  buildChildSessionSummary,
  buildSpendLineSegments,
  calculateUsageTotals,
} from '../../../../src/extensions/multiverse/child-sessions/child-session-summary.ts';
import { CACHE_GLYPHS } from '../../../../src/libs/tui-glyphs.ts';
import { assistant, entry, spawn, transcriptFixture, usage } from './fixtures.ts';

test('usage totals include assistant, tool result, usage, compaction and branch summary', () => {
  const path = [...transcriptFixture(), entry('usage', 'branch', { type: 'usage', kind: 'aux', provider: 'p', model: 'm', usage: usage() })];
  expect(calculateUsageTotals(path)).toEqual({
    totalInput: 60,
    totalOutput: 30,
    totalCacheRead: 120,
    totalCacheWrite: 30,
    totalCost: 6,
    latestCacheHitRate: (20 / 35) * 100,
  });
});

test('last reply metadata, response model and thinking fallbacks', () => {
  const path = [
    entry('thinking', null, { type: 'thinking_level_change', thinkingLevel: 'low' }),
    entry('reply', 'thinking', { message: assistant({ responseModel: 'resolved', thinkingLevel: 'medium' }) }),
  ];
  expect(buildChildSessionSummary(path)).toMatchObject({ provider: 'anthropic', model: 'resolved', thinkingLevel: 'medium' });
  expect(
    buildChildSessionSummary([
      entry('thinking', null, { type: 'thinking_level_change', thinkingLevel: 'low' }),
      entry('reply', 'thinking', { message: assistant() }),
    ]).thinkingLevel,
  ).toBe('low');
  expect(buildChildSessionSummary([])).toMatchObject({ provider: '—', model: '—', thinkingLevel: '—', contextPercent: null });
});

test('context is last valid reply after latest compaction; unknown model renders ?', () => {
  const reply = entry('reply', null, { message: assistant({ usage: usage(70, 0, 0, 0) }) });
  const compact = entry('compact', 'reply', { type: 'compaction', summary: '', firstKeptEntryId: 'reply', tokensBefore: 70 });
  expect(buildChildSessionSummary([reply], () => 100).contextPercent).toBe(70);
  expect(buildChildSessionSummary([reply, compact], () => 100).contextPercent).toBeNull();
  for (const stopReason of ['aborted', 'error'] as const) {
    expect(
      buildChildSessionSummary([reply, compact, entry('bad', 'compact', { message: assistant({ stopReason }) })], () => 100).contextPercent,
    ).toBeNull();
  }
  expect(buildChildSessionSummary([reply, entry('bad', 'reply', { message: assistant({ stopReason: 'error' }) })], () => 100).contextPercent).toBe(
    70,
  );
  expect(buildSpendLineSegments(buildChildSessionSummary([reply])).at(-1)?.text).toBe('?');
  expect(
    buildChildSessionSummary([entry('fallback', null, { message: assistant({ usage: { ...usage(), totalTokens: 0 } }) })], () => 100).contextTokens,
  ).toBe(40);
});

test('zero-token replies do not replace a qualifying context source', () => {
  const reply = entry('reply', null, { message: assistant({ usage: usage(70, 0, 0, 0) }) });
  const zero = entry('zero', 'reply', { message: assistant({ usage: usage(0, 0, 0, 0) }) });
  expect(buildChildSessionSummary([reply, zero], () => 100)).toMatchObject({ contextTokens: 70, contextPercent: 70 });
  expect(buildChildSessionSummary([zero], () => 100)).toMatchObject({ contextTokens: null, contextPercent: null });
});

test('context window prefers requested model and falls back to response model', () => {
  const path = [entry('reply', null, { message: assistant({ model: 'requested', responseModel: 'resolved' }) })];
  const calls: string[] = [];
  expect(
    buildChildSessionSummary(path, (_provider, model) => {
      calls.push(model);
      return model === 'requested' ? 100 : 200;
    }),
  ).toMatchObject({ model: 'resolved', contextWindow: 100, contextPercent: 40 });
  expect(calls).toEqual(['requested']);
  calls.length = 0;
  expect(
    buildChildSessionSummary(path, (_provider, model) => {
      calls.push(model);
      return model === 'resolved' ? 200 : undefined;
    }),
  ).toMatchObject({ model: 'resolved', contextWindow: 200, contextPercent: 20 });
  expect(calls).toEqual(['requested', 'resolved']);
});

test('throwing context window lookup leaves usage available with an unknown window', () => {
  expect(
    buildChildSessionSummary([entry('reply', null, { message: assistant() })], () => {
      throw new Error('registry unavailable');
    }),
  ).toMatchObject({ contextTokens: 40, contextWindow: null, contextPercent: null });
});

test('spend uses exact strict pressure thresholds, abbreviated tokens, cache and cost', () => {
  const summary = buildChildSessionSummary([entry('reply', null, { message: assistant({ usage: usage(12400, 3412) }) })]);
  const text = buildSpendLineSegments(summary)
    .map(s => s.text)
    .join(' ');
  expect(text).toContain('↑12k ↓3.4k');
  expect(text).toContain(`${CACHE_GLYPHS.cache}[${CACHE_GLYPHS.cacheRead}20 ${CACHE_GLYPHS.cacheWrite}5 0.2%]`);
  expect(text).toContain('$1.000');
  expect(buildSpendLineSegments({ ...summary, contextPercent: null, contextWindow: 100000 }).at(-1)).toEqual({ text: '?/100k', tone: 'dim' });
  expect(buildSpendLineSegments(buildChildSessionSummary([]))).toEqual([{ text: '?', tone: 'dim' }]);
  expect(CACHE_GLYPHS).toEqual({ cache: '\uf49b ', cacheRead: '\uea70 ', cacheWrite: '\uf448 ' });
  for (const [percent, tone] of [
    [70, 'dim'],
    [70.1, 'warning'],
    [70.001, 'warning'],
    [90, 'warning'],
    [90.1, 'error'],
    [90.001, 'error'],
  ] as const) {
    expect(buildSpendLineSegments({ ...summary, contextPercent: percent, contextWindow: 100000 }).at(-1)).toEqual({
      text: `${percent.toFixed(1)}%/100k`,
      tone,
    });
  }
});

test('off-path usage and metadata are excluded by projection', () => {
  const [snapshot] = buildChildSessionSnapshots([spawn([{ checkpointAfter: 'active' }])], {
    readEntries: () => [
      entry('active', null, { message: assistant() }),
      entry('off-path', null, { message: assistant({ model: 'wrong', usage: usage(99999) }) }),
    ],
  });
  if (snapshot?.status !== 'available') throw new Error('expected available');
  expect(snapshot.summary.model).toBe('model');
  expect(snapshot.summary.totals.totalInput).toBe(10);
});
