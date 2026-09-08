import { describe, expect, it } from 'bun:test';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import {
  MAX_TOOL_INPUT_CHARS,
  MAX_TOOL_TRAIL_ENTRIES,
  SpawnProgress,
  summarizeToolInput,
} from '../../../../../src/extensions/multiverse/tools/spawn/spawn-progress.ts';

const startEvent = (name: string, args: unknown, id = '1'): AgentSessionEvent =>
  ({ type: 'tool_execution_start', toolCallId: id, toolName: name, args }) as AgentSessionEvent;
const endEvent = (name: string, isError = false, id = '1'): AgentSessionEvent =>
  ({ type: 'tool_execution_end', toolCallId: id, toolName: name, result: {}, isError }) as AgentSessionEvent;

const progressFor = (clock: { value: number }) =>
  new SpawnProgress(
    [
      { label: 'implement', agent: 'fixer', action: 'create' },
      { label: 'inspect', agent: undefined, action: 'continue' },
    ],
    () => clock.value,
  );

describe('SpawnProgress', () => {
  it('distinguishes queued from waiting: only a started task carries a timer', () => {
    const clock = { value: 1_000 };
    const progress = progressFor(clock);

    expect(progress.snapshot()[0]?.phase).toBe('queued');
    expect(progress.snapshot()[0]?.startedAt).toBeUndefined();

    progress.start(0);
    const started = progress.snapshot()[0];
    expect(started?.phase).toBe('waiting');
    expect(started?.startedAt).toBe(1_000);
    // The second task holds no slot yet, so it stays queued with no timer.
    expect(progress.snapshot()[1]?.phase).toBe('queued');
    expect(progress.snapshot()[1]?.startedAt).toBeUndefined();
  });

  it('tracks tool use count, current tool, and last-call outcome without recording tool output', () => {
    const clock = { value: 0 };
    const progress = progressFor(clock);
    progress.start(0);

    progress.observe(0, startEvent('bash', { command: 'git status' }));
    const running = progress.snapshot()[0];
    expect(running?.phase).toBe('running');
    expect(running?.toolRunning).toBe(true);
    expect(running?.toolUses).toBe(1);
    expect(running?.currentTool).toBe('bash');
    expect(running?.currentToolInput).toBe('git status');

    progress.observe(0, endEvent('bash', true));
    const ended = progress.snapshot()[0];
    expect(ended?.toolRunning).toBe(false);
    expect(ended?.lastToolError).toBe(true);
    expect(ended?.trail).toEqual([{ tool: 'bash', input: 'git status', isError: true }]);
    // Tool results are never recorded anywhere in progress state.
    expect(JSON.stringify(ended)).not.toContain('result');
  });

  it('resolves a continuation agent and settles into replied or failed with an outcome', () => {
    const clock = { value: 5 };
    const progress = progressFor(clock);
    progress.start(0);
    progress.start(1);
    progress.resolveAgent(1, 'explorer');

    clock.value = 105;
    progress.settle(0, 'success');
    progress.settle(1, 'aborted', 'stopped');

    const [first, second] = progress.snapshot();
    expect(first?.phase).toBe('replied');
    expect(first?.outcome).toBe('success');
    expect(first?.settledAt).toBe(105);
    expect(second?.agent).toBe('explorer');
    expect(second?.phase).toBe('failed');
    expect(second?.outcome).toBe('aborted');
    expect(second?.error).toBe('stopped');
  });

  it('waits for authoritative settlement after agent_end and ignores unobserved event types', () => {
    const progress = progressFor({ value: 0 });
    progress.start(0);
    progress.observe(0, { type: 'message_end', message: { role: 'assistant', content: 'secret' } } as unknown as AgentSessionEvent);
    expect(JSON.stringify(progress.snapshot())).not.toContain('secret');

    progress.observe(0, { type: 'agent_end', messages: [] } as unknown as AgentSessionEvent);
    expect(progress.snapshot()[0]?.phase).toBe('waiting');
    progress.settle(0, 'failure', 'provider failed');
    expect(progress.snapshot()[0]?.phase).toBe('failed');
  });

  it('matches concurrent tool completions by task and call ID, even after trail eviction', () => {
    const progress = progressFor({ value: 0 });
    progress.start(0);
    progress.start(1);
    progress.observe(0, startEvent('read', { path: 'first' }, 'same'));
    progress.observe(1, startEvent('read', { path: 'other child' }, 'same'));
    for (let call = 0; call < MAX_TOOL_TRAIL_ENTRIES; call++) {
      progress.observe(0, startEvent('read', { path: `file-${call}` }, `${call}`));
    }
    progress.observe(0, endEvent('read', true, 'same'));
    expect(progress.snapshot()[0]?.toolRunning).toBe(true);
    expect(progress.snapshot()[0]?.currentToolInput).toBe(`file-${MAX_TOOL_TRAIL_ENTRIES - 1}`);
    expect(progress.snapshot()[0]?.trail.every(entry => entry.isError === undefined)).toBe(true);
    progress.observe(1, endEvent('read', false, 'same'));
    expect(progress.snapshot()[1]?.trail[0]?.isError).toBe(false);
    expect(progress.snapshot()[1]?.currentToolInput).toBe('other child');
  });

  it('caps the persisted trail and truncates stored tool inputs at store time', () => {
    const progress = progressFor({ value: 0 });
    progress.start(0);
    for (let call = 0; call < MAX_TOOL_TRAIL_ENTRIES + 5; call += 1) {
      progress.observe(0, startEvent('bash', { command: 'x'.repeat(500) }, `call-${call}`));
      progress.observe(0, endEvent('bash', false, `call-${call}`));
    }

    const task = progress.snapshot()[0];
    expect(task?.toolUses).toBe(MAX_TOOL_TRAIL_ENTRIES + 5);
    expect(task?.trail).toHaveLength(MAX_TOOL_TRAIL_ENTRIES);
    for (const entry of task?.trail ?? []) expect((entry.input ?? '').length).toBeLessThanOrEqual(MAX_TOOL_INPUT_CHARS);
  });
});

describe('summarizeToolInput', () => {
  it('prefers a known argument, flattens whitespace, and bounds length', () => {
    expect(summarizeToolInput({ command: 'ls  -la\n/tmp' })).toBe('ls -la /tmp');
    expect(summarizeToolInput({ file_path: '/tmp/a.ts', content: 'x' })).toBe('/tmp/a.ts');
    expect(summarizeToolInput({ unusual: 'fallback value' })).toBe('fallback value');
    expect(summarizeToolInput({})).toBeUndefined();
    expect(summarizeToolInput(undefined)).toBeUndefined();
    expect(summarizeToolInput({ command: 'y'.repeat(200) })).toHaveLength(MAX_TOOL_INPUT_CHARS);
  });
});
