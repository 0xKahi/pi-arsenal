import { describe, expect, it } from 'bun:test';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { SpawnProgress } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-progress.ts';

const toolEvent = (name: string): AgentSessionEvent => ({ type: 'tool_execution_end', toolCallId: '1', toolName: name, result: {}, isError: false });

describe('SpawnProgress', () => {
  it('tracks pending/running/current-tool/terminal state without leaking messages', () => {
    const progress = new SpawnProgress([
      { label: 'implement', agent: 'fixer' },
      { label: 'inspect', agent: 'explorer' },
    ]);

    expect(progress.snapshot()[0]?.status).toBe('pending');
    progress.start(0);
    progress.observe(0, toolEvent('edit'));
    expect(progress.snapshot()[0]?.status).toBe('running');
    progress.settle(0, 'success');
    progress.settle(1, 'failure', 'model error');

    expect(progress.snapshot()[0]?.status).toBe('success');
    expect(progress.snapshot()[1]?.error).toBe('model error');
    expect(progress.snapshot()).not.toContain({ currentTool: 'edit' });
  });
});
