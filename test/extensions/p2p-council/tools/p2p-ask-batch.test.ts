import { describe, expect, test } from 'bun:test';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, type Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import {
  createP2pAskTool,
  P2P_ASK_SPINNER_FRAMES,
  P2P_ASK_SPINNER_INTERVAL_MS,
  P2pAskBatchResultComponent,
} from '../../../../src/extensions/p2p-council/tools/p2p-ask.tool';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function stateWith(askPrompt: (to: string, prompt: string, signal?: AbortSignal) => Promise<{ response?: string; error?: string; from?: string }>) {
  return {
    isConnected: () => true,
    getSelfName: () => 'caller',
    getRoster: () => [
      { identity: { name: 'caller' } },
      { identity: { name: 'alpha' } },
      { identity: { name: 'beta' } },
      { identity: { name: 'gamma' } },
    ],
    askPrompt,
  } as never;
}

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

describe('p2p_ask batch execution', () => {
  test('dispatches distinct prompts concurrently and keeps every snapshot in request order', async () => {
    const pending = new Map<string, Deferred<{ response?: string; error?: string; from?: string }>>();
    const calls: Array<{ to: string; prompt: string }> = [];
    const updates: Array<{ entries: Array<{ to: string; state: string }> }> = [];
    const tool = createP2pAskTool(
      stateWith((to, prompt) => {
        calls.push({ to, prompt });
        const item = deferred<{ response?: string; error?: string; from?: string }>();
        pending.set(to, item);
        return item.promise;
      }),
    );

    const execution = tool.execute(
      'id',
      {
        requests: [
          { to: 'alpha', prompt: 'review API' },
          { to: 'beta', prompt: 'review tests' },
        ],
      },
      undefined,
      update => updates.push(update.details as never),
      undefined as never,
    );
    await Promise.resolve();
    expect(calls).toEqual([
      { to: 'alpha', prompt: 'review API' },
      { to: 'beta', prompt: 'review tests' },
    ]);
    expect(updates[0]?.entries.map(entry => entry.state)).toEqual(['pending', 'pending']);

    pending.get('beta')?.resolve({ response: 'beta reply', from: 'beta' });
    await Promise.resolve();
    expect(updates.at(-1)?.entries.map(entry => `${entry.to}:${entry.state}`)).toEqual(['alpha:pending', 'beta:success']);
    pending.get('alpha')?.resolve({ response: 'alpha reply', from: 'alpha' });

    const result = await execution;
    const details = result.details as { entries: Array<{ to: string; state: string }> };
    expect(details.entries.map(entry => entry.to)).toEqual(['alpha', 'beta']);
    expect(text(result)).toBe('Reply from "alpha":\nalpha reply\n\nReply from "beta":\nbeta reply');
  });

  test('normalizes sibling failures independently without losing successes', async () => {
    const outcomes: Record<string, { response?: string; error?: string; from?: string }> = {
      alpha: { response: 'usable answer', from: 'alpha' },
      beta: { error: 'Terminal is busy' },
      missing: { error: 'not_found' },
      timeout: { error: 'inactivity_timeout:timeout:90s' },
      gone: { error: 'disconnected:gone' },
    };
    const tool = createP2pAskTool(stateWith(async to => outcomes[to] ?? { error: 'unknown' }));
    const result = await tool.execute(
      'id',
      { requests: Object.keys(outcomes).map(to => ({ to, prompt: `prompt ${to}` })) },
      undefined,
      undefined,
      undefined as never,
    );
    const entries = (result.details as { entries: Array<{ state: string; error?: string; reply?: string }> }).entries;
    expect(entries[0]).toMatchObject({ state: 'success', reply: 'usable answer' });
    expect(entries.slice(1).map(entry => entry.error)).toEqual(['busy', 'not_found', 'inactivity_timeout', 'disconnected']);
    expect(text(result)).toContain('usable answer');
    expect(text(result)).toContain('Failure from "beta"');
  });

  test('rejects case-sensitive duplicate targets atomically', async () => {
    let calls = 0;
    const tool = createP2pAskTool(
      stateWith(async () => {
        calls++;
        return { response: 'unexpected' };
      }),
    );
    const duplicate = await tool.execute(
      'id',
      {
        requests: [
          { to: 'alpha', prompt: 'one' },
          { to: 'alpha', prompt: 'two' },
        ],
      },
      undefined,
      undefined,
      undefined as never,
    );
    expect(calls).toBe(0);
    expect(duplicate.details).toMatchObject({ kind: 'validation', error: 'duplicate_target', duplicateTargets: ['alpha'] });

    const caseDistinct = await tool.execute(
      'id',
      {
        requests: [
          { to: 'alpha', prompt: 'one' },
          { to: 'Alpha', prompt: 'two' },
        ],
      },
      undefined,
      undefined,
      undefined as never,
    );
    expect((caseDistinct.details as { kind: string }).kind).toBe('batch');
    expect(calls).toBe(2);
  });

  test('normalizes legacy calls for preparation, direct execution, and rendering', async () => {
    const tool = createP2pAskTool(stateWith(async (to, prompt) => ({ response: `${to}:${prompt}`, from: to })));
    expect(tool.prepareArguments?.({ to: 'alpha', prompt: 'legacy' })).toEqual({ requests: [{ to: 'alpha', prompt: 'legacy' }] });
    const result = await tool.execute('id', { to: 'alpha', prompt: 'legacy' } as never, undefined, undefined, undefined as never);
    expect(text(result)).toContain('alpha:legacy');

    const component = tool.renderResult!(result, { expanded: true, isPartial: false }, plainTheme, {
      args: { to: 'alpha', prompt: 'legacy' },
      invalidate: () => {},
    } as never);
    expect(component.render(80).join('\n')).toContain('legacy');
  });

  test('propagates abort to outstanding requests while retaining settled replies', async () => {
    const controller = new AbortController();
    const tool = createP2pAskTool(
      stateWith((to, _prompt, signal) => {
        if (to === 'alpha') return Promise.resolve({ response: 'already done', from: to });
        return new Promise(resolve => signal?.addEventListener('abort', () => resolve({ error: 'aborted' }), { once: true }));
      }),
    );
    const execution = tool.execute(
      'id',
      {
        requests: [
          { to: 'alpha', prompt: 'quick' },
          { to: 'beta', prompt: 'slow' },
        ],
      },
      controller.signal,
      undefined,
      undefined as never,
    );
    await Promise.resolve();
    controller.abort();
    const result = await execution;
    const entries = (result.details as { entries: Array<{ state: string; error?: string; reply?: string }> }).entries;
    expect(entries).toEqual([
      expect.objectContaining({ state: 'success', reply: 'already done' }),
      expect.objectContaining({ state: 'failure', error: 'aborted' }),
    ]);
  });

  test('fairly bounds several oversized replies in both model content and retained details', async () => {
    const huge = (letter: string) => Array.from({ length: DEFAULT_MAX_LINES + 50 }, () => letter.repeat(100)).join('\n');
    const tool = createP2pAskTool(stateWith(async to => ({ response: huge(to[0] ?? 'x'), from: to })));
    const result = await tool.execute(
      'id',
      { requests: ['alpha', 'beta', 'gamma'].map(to => ({ to, prompt: to })) },
      undefined,
      undefined,
      undefined as never,
    );
    const output = text(result);
    const entries = (result.details as { entries: Array<{ reply: string; truncated?: boolean }> }).entries;
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
    expect(output.split('\n').length).toBeLessThanOrEqual(DEFAULT_MAX_LINES);
    expect(entries.every(entry => entry.truncated && entry.reply.includes('truncated to fit aggregate'))).toBe(true);
    expect(entries.every(entry => Buffer.byteLength(entry.reply) < DEFAULT_MAX_BYTES / 2)).toBe(true);
    for (const target of ['alpha', 'beta', 'gamma']) expect(output).toContain(`Reply from "${target}"`);
  });
});

describe('p2p_ask batch renderer', () => {
  test('renders ordered trees, counts, collapsed omission, expanded alignment, wrapping, and width bounds', () => {
    const component = new P2pAskBatchResultComponent(plainTheme, () => {});
    const details = {
      kind: 'batch' as const,
      entries: [
        { to: 'alpha', state: 'success' as const, from: 'alpha', reply: 'first reply body' },
        { to: 'beta', state: 'failure' as const, error: 'busy', message: 'busy error body' },
      ],
    };
    const requests = [
      { to: 'alpha', prompt: 'a very long complete prompt that needs to wrap across terminal rows' },
      { to: 'beta', prompt: 'second prompt' },
    ];
    component.update(details, requests, false);
    const collapsed = component.render(36);
    expect(collapsed.join('\n')).toContain('├─ ✓ alpha');
    expect(collapsed.join('\n')).toContain('└─ ✗ beta');
    expect(collapsed.join('\n')).toContain('1 reply · 1 failure');
    expect(collapsed.join('\n')).not.toContain('prompt');
    expect(collapsed.join('\n')).not.toContain('reply body');

    component.update(details, requests, true);
    const expanded = component.render(36);
    const aggregate = expanded.findIndex(line => line.startsWith('↩ '));
    expect(expanded[aggregate + 1]).toBe('✓ alpha');
    expect(expanded[aggregate + 2]).toStartWith('  ');
    expect(expanded.join('\n')).toContain('busy error body');
    expect(expanded.every(line => visibleWidth(line) <= 36)).toBe(true);
  });

  test('animates the exact frame sequence at 80ms and stops invalidating after settlement', async () => {
    let invalidations = 0;
    const component = new P2pAskBatchResultComponent(plainTheme, () => invalidations++);
    component.update({ kind: 'batch', entries: [{ to: 'alpha', state: 'pending' }] }, [{ to: 'alpha', prompt: 'wait' }], false);
    expect(component.render(80).join('\n')).toContain(`${P2P_ASK_SPINNER_FRAMES[0]} alpha`);
    await Bun.sleep(P2P_ASK_SPINNER_INTERVAL_MS + 20);
    expect(invalidations).toBeGreaterThanOrEqual(1);
    expect(component.render(80).join('\n')).toContain(`${P2P_ASK_SPINNER_FRAMES[1]} alpha`);

    component.update(
      { kind: 'batch', entries: [{ to: 'alpha', state: 'success', from: 'alpha', reply: 'done' }] },
      [{ to: 'alpha', prompt: 'wait' }],
      false,
    );
    const stoppedAt = invalidations;
    await Bun.sleep(P2P_ASK_SPINNER_INTERVAL_MS + 20);
    expect(invalidations).toBe(stoppedAt);
  });
});
