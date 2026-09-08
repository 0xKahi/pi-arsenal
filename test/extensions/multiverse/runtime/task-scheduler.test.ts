import { describe, expect, it } from 'bun:test';
import { runWithGlobalConcurrency } from '../../../../src/extensions/multiverse/runtime/task-scheduler.ts';

const withTimeout = async <T>(promise: Promise<T>, ms = 500): Promise<T | 'timed-out'> =>
  await Promise.race([promise, new Promise<'timed-out'>(resolve => setTimeout(() => resolve('timed-out'), ms))]);

describe('runWithGlobalConcurrency', () => {
  it('shares one capacity pool and refills slots as mixed notifiers settle', async () => {
    let active = 0;
    let peak = 0;
    const tasks = ['create', 'continue', 'create', 'continue', 'create', 'continue'];

    const results = await runWithGlobalConcurrency(tasks, 2, async task => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, task === 'create' ? 5 : 1));
      active--;
      return task;
    });

    expect(results).toEqual(tasks.map(task => ({ status: 'fulfilled', value: task })));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('settles immediately on an empty task array instead of hanging', async () => {
    expect(await withTimeout(runWithGlobalConcurrency([], 5, async () => 'unreachable'))).toEqual([]);
  });

  it('prevents queued starts after abort and preserves completed/running entries', async () => {
    const controller = new AbortController();
    const tasks = ['first', 'second', 'third'];
    const started: string[] = [];

    const resultsPromise = runWithGlobalConcurrency(
      tasks,
      2,
      task =>
        new Promise(resolve => {
          started.push(task);
          setTimeout(() => resolve(task), 10);
        }),
      controller.signal,
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();

    expect(await resultsPromise).toEqual([{ status: 'fulfilled', value: 'first' }, { status: 'fulfilled', value: 'second' }, { status: 'aborted' }]);
    expect(started).toEqual(['first', 'second']);
  });

  it('dispatches nothing when the signal is already aborted before dispatch', async () => {
    const controller = new AbortController();
    controller.abort();
    let started = 0;

    const results = await runWithGlobalConcurrency(
      ['first', 'second'],
      5,
      async task => {
        started++;
        return task;
      },
      controller.signal,
    );

    expect(started).toBe(0);
    expect(results).toEqual([{ status: 'aborted' }, { status: 'aborted' }]);
  });

  it('isolates failures and returns all entries in input order', async () => {
    const results = await runWithGlobalConcurrency(['first', 'second', 'third'], 3, async task => {
      if (task === 'second') throw new Error('failed');
      return task;
    });

    expect(results).toEqual([
      { status: 'fulfilled', value: 'first' },
      { status: 'rejected', error: 'failed' },
      { status: 'fulfilled', value: 'third' },
    ]);
  });
});
