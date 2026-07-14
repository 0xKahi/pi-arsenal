import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import { launchTmuxPopup } from '../../../src/extensions/tmux-popup/popup-process.util';

const createMockChild = (): ChildProcess & { emitSpawn: () => void; emitError: (error: Error) => void } => {
  const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const child = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers[event] = eventHandlers[event] ?? [];
      eventHandlers[event].push(handler);
      return child;
    },
    unref: mock(() => {}),
  } as unknown as ChildProcess & { emitSpawn: () => void; emitError: (error: Error) => void };

  (child as any).emitSpawn = () => {
    const handlers = eventHandlers.spawn ?? [];
    handlers.forEach(handler => {
      handler();
    });
  };
  (child as any).emitError = (error: Error) => {
    const handlers = eventHandlers.error ?? [];
    handlers.forEach(handler => {
      handler(error);
    });
  };

  return child;
};

describe('launchTmuxPopup', () => {
  let spawnCalls: { command: string; args: string[] }[] = [];
  let lastChild: ReturnType<typeof createMockChild> | undefined;

  beforeEach(() => {
    spawnCalls = [];
    lastChild = undefined;
    mock.module('node:child_process', () => ({
      spawn: (command: string, args: string[]) => {
        spawnCalls.push({ command, args });
        lastChild = createMockChild();
        queueMicrotask(() => lastChild?.emitSpawn());
        return lastChild;
      },
    }));
  });

  it('spawns tmux display-popup with percentage dimensions and -E', async () => {
    const result = await launchTmuxPopup(50, 50, "nvim '/tmp/file.ts'");
    expect(result.success).toBe(true);
    expect(spawnCalls).toHaveLength(1);
    const call = spawnCalls[0];
    if (call) {
      expect(call.command).toBe('tmux');
      expect(call.args).toEqual(['display-popup', '-w', '50%', '-h', '50%', '-E', "nvim '/tmp/file.ts'"]);
    }
  });

  it('unrefs the child after spawn', async () => {
    await launchTmuxPopup(50, 50, "nvim '/tmp/file.ts'");
    expect(lastChild?.unref).toHaveBeenCalled();
  });

  it('reports spawn errors', async () => {
    mock.module('node:child_process', () => ({
      spawn: () => {
        lastChild = createMockChild();
        queueMicrotask(() => lastChild?.emitError(new Error('ENOENT')));
        return lastChild;
      },
    }));

    const result = await launchTmuxPopup(50, 50, "nvim '/tmp/file.ts'");
    expect(result.success).toBe(false);
  });
});
