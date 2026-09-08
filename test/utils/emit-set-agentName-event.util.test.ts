import { afterEach, describe, expect, it } from 'bun:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { emitSetAgentNameEvent } from '../../src/utils/emit-set-agentName-event.util';

describe('emitSetAgentNameEvent', () => {
  let originalSetTimeout: typeof setTimeout | undefined;

  afterEach(() => {
    if (originalSetTimeout) {
      globalThis.setTimeout = originalSetTimeout;
      originalSetTimeout = undefined;
    }
  });

  it('emits synchronously when delay is omitted or non-positive', () => {
    const events: unknown[] = [];
    const pi = {
      events: { emit: (_event: string, payload: unknown) => events.push(payload) },
    } as unknown as ExtensionAPI;

    emitSetAgentNameEvent(pi, { name: 'default' });
    emitSetAgentNameEvent(pi, { name: 'zero', delay: 0 });
    emitSetAgentNameEvent(pi, { name: 'negative', delay: -1 });

    expect(events).toEqual([{ agentName: 'DEFAULT' }, { agentName: 'ZERO' }, { agentName: 'NEGATIVE' }]);
  });

  it('emits once after a positive delay', () => {
    let scheduledCallback: (() => void) | undefined;
    let scheduledDelay: number | undefined;
    let elapsed = 0;
    originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((callback: unknown, delay?: number) => {
      scheduledCallback = callback as () => void;
      scheduledDelay = delay;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    const events: unknown[] = [];
    const pi = {
      events: { emit: (_event: string, payload: unknown) => events.push(payload) },
    } as unknown as ExtensionAPI;

    emitSetAgentNameEvent(pi, { name: 'delayed', color: 'blue', delay: 100 });

    const advanceTimersByTime = (milliseconds: number): void => {
      elapsed += milliseconds;
      if (scheduledCallback && scheduledDelay !== undefined && elapsed >= scheduledDelay) {
        const callback = scheduledCallback;
        scheduledCallback = undefined;
        callback();
      }
    };

    expect(events).toEqual([]);
    expect(scheduledDelay).toBe(100);
    advanceTimersByTime(99);
    expect(events).toEqual([]);
    advanceTimersByTime(1);
    expect(events).toEqual([{ agentName: 'DELAYED', color: 'blue' }]);
    advanceTimersByTime(100);
    expect(events).toHaveLength(1);
  });
});
