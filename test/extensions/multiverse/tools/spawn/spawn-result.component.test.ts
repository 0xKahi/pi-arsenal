import { describe, expect, it } from 'bun:test';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { SpawnToolDetails } from '../../../../../src/extensions/multiverse/results/child-interaction.ts';
import { createSpawnTool, type SpawnToolHost } from '../../../../../src/extensions/multiverse/tools/spawn/spawn.tool.ts';
import { SpawnProgress } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-progress.ts';
import {
  buildSpawnRows,
  MAX_VISIBLE_TASK_ROWS,
  SpawnResultComponent,
  type SpawnTaskRow,
  type SpawnTheme,
} from '../../../../../src/extensions/multiverse/tools/spawn/spawn-result.component.ts';
import { childInteraction } from '../../interaction-fixture.ts';

/** Identity theme: assertions read the rendered text, not escape sequences. */
const theme: SpawnTheme = { fg: (_color, text) => text, bold: text => text };

const render = (rows: SpawnTaskRow[], expanded = false, width = 120): string => {
  const component = new SpawnResultComponent(theme, () => {});
  component.update(rows, expanded);
  const output = component.render(width).join('\n');
  component.dispose();
  return output;
};

const args = {
  context: 'shared',
  tasks: [
    { action: 'create' as const, agent: 'fixer' as const, task: 'implement the fix' },
    { action: 'continue' as const, childSessionId: 'child-1', task: 'clarify the report' },
  ],
};

describe('buildSpawnRows', () => {
  it('renders the first frame from call arguments before any child event arrives', () => {
    const rows = buildSpawnRows({ args, details: undefined });
    const output = render(rows);

    expect(rows).toHaveLength(2);
    expect(output).toContain('fixer (1)');
    expect(output).toContain('new');
    expect(output).toContain('(2)');
    expect(output).toContain('resume');
    expect(output).toContain('queued');
  });

  it('keeps a queued task visually distinct from a started one and runs no timer for it', () => {
    const progress = new SpawnProgress(
      [
        { label: 'implement', agent: 'fixer', action: 'create' },
        { label: 'inspect', agent: 'explorer', action: 'create' },
      ],
      () => 1_000,
    );
    progress.start(0);

    const rows = buildSpawnRows({ args, details: details(progress), now: 3_500 });

    expect(rows[0]?.phase).toBe('waiting');
    expect(rows[0]?.elapsedMs).toBe(2_500);
    expect(rows[1]?.phase).toBe('queued');
    expect(rows[1]?.elapsedMs).toBeUndefined();
    const output = render(rows);
    expect(output).toContain('waiting');
    expect(output).toContain('queued');
    expect(output).toContain('2.5s');
    // A queued task holds no slot, so it shows no elapsed time.
    expect(output).toContain('—');
  });

  it('advances the timer while a child sits inside one long tool call emitting no events', () => {
    const clock = { value: 0 };
    const progress = new SpawnProgress([{ label: 'implement', agent: 'fixer', action: 'create' }], () => clock.value);
    progress.start(0);
    progress.observe(0, { type: 'tool_execution_start', toolCallId: '1', toolName: 'bash', args: { command: 'sleep 90' } } as never);

    const early = render(buildSpawnRows({ args, details: details(progress), now: 1_000 }));
    const later = render(buildSpawnRows({ args, details: details(progress), now: 61_000 }));

    expect(early).toContain('1.0s');
    expect(later).toContain('1m01s');
    expect(later).toContain('bash sleep 90');
    expect(later).toContain('1 tool');
  });
});

describe('SpawnResultComponent', () => {
  it('renders two lines per task plus a counts footer across mixed terminal states', () => {
    const clock = { value: 0 };
    const progress = new SpawnProgress(
      [
        { label: 'implement', agent: 'fixer', action: 'create' },
        { label: 'inspect', agent: 'explorer', action: 'continue' },
      ],
      () => clock.value,
    );
    progress.start(0);
    progress.start(1);
    progress.observe(0, { type: 'tool_execution_start', toolCallId: '1', toolName: 'edit', args: { file_path: 'src/a.ts' } } as never);
    progress.observe(0, { type: 'tool_execution_end', toolCallId: '1', toolName: 'edit', result: {}, isError: false } as never);
    progress.settle(0, 'success');
    progress.settle(1, 'failure', 'model error');

    const lines = renderLines(buildSpawnRows({ args, details: details(progress) }));

    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('fixer (1)');
    expect(lines[1]).toContain('↩ replied');
    expect(lines[3]).toContain('✗ failed · model error');
    expect(lines[4]).toContain('1 replied · 1 failed');
  });

  it('shows the completed tool outcome from isError while a task is still running', () => {
    const progress = new SpawnProgress([{ label: 'implement', agent: 'fixer', action: 'create' }], () => 0);
    progress.start(0);
    progress.observe(0, { type: 'tool_execution_start', toolCallId: '1', toolName: 'bash', args: { command: 'bun test' } } as never);
    progress.observe(0, { type: 'tool_execution_end', toolCallId: '1', toolName: 'bash', result: {}, isError: true } as never);

    expect(render(buildSpawnRows({ args, details: details(progress) }))).toContain('✗ bash bun test');
  });

  it('expands to the activity trail, prompt, child session ID, checkpoints, telemetry, and response', () => {
    const progress = new SpawnProgress([{ label: 'implement', agent: 'fixer', action: 'create' }], () => 0);
    progress.start(0);
    progress.observe(0, { type: 'tool_execution_start', toolCallId: '1', toolName: 'bash', args: { command: 'git status' } } as never);
    progress.observe(0, { type: 'tool_execution_end', toolCallId: '1', toolName: 'bash', result: {}, isError: false } as never);
    progress.settle(0, 'success');
    const settled: SpawnToolDetails = {
      version: 1,
      kind: 'spawn',
      interactions: [childInteraction({ body: 'the child response', truncation: { totalBytes: 99, totalLines: 9 } })],
      progress: progress.snapshot(),
    };

    const output = render(buildSpawnRows({ args, details: settled }), true);

    expect(output).toContain('prompt: implement the fix');
    expect(output).toContain('activity: bash(git status) ✓');
    expect(output).toContain('child: child-1');
    expect(output).toContain('checkpoints: none → leaf');
    expect(output).toContain('telemetry: anthropic/model');
    expect(output).toContain('truncated: cut from 9 lines / 99 bytes');
    expect(output).toContain('the child response');
    // Envelope boundary markup is model-facing only and never rendered to the user.
    expect(output).not.toContain('TASK_1_RESPONSE');
    expect(output).not.toContain('boundary');
  });

  it('sanitizes child-authored tool arguments and bounds every line to the width', () => {
    const progress = new SpawnProgress([{ label: 'implement', agent: 'fixer', action: 'create' }], () => 0);
    progress.start(0);
    progress.observe(0, {
      type: 'tool_execution_start',
      toolCallId: '1',
      toolName: 'grep',
      args: { pattern: '\u001b[2J\u001b[31mHIJACK\u0007' },
    } as never);
    const hostile = childInteraction({ body: `\u001b[2J${'w'.repeat(400)}` });
    const rows = buildSpawnRows({
      args,
      details: { version: 1, kind: 'spawn', interactions: [hostile], progress: progress.snapshot() },
    });

    for (const line of renderLines(rows, true, 40)) {
      expect(line).not.toContain('\u001b');
      expect(line).not.toContain('\u0007');
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('caps visible rows with an overflow indicator', () => {
    const rows = Array.from({ length: MAX_VISIBLE_TASK_ROWS + 4 }, (_, index) => ({
      index,
      label: `task ${index}`,
      agent: 'fixer',
      action: 'create' as const,
      phase: 'queued' as const,
      toolUses: 0,
      toolRunning: false,
      trail: [],
    }));

    const lines = renderLines(rows);

    expect(lines).toHaveLength(MAX_VISIBLE_TASK_ROWS * 2 + 2);
    expect(lines.at(-2)).toContain('… 4 more tasks');
  });

  it('degrades to plain text instead of throwing when rendering fails', () => {
    const brokenTheme: SpawnTheme = {
      fg: (_color, text) => {
        if (text.includes('fixer')) throw new Error('theme exploded');
        return text;
      },
      bold: text => text,
    };
    const component = new SpawnResultComponent(brokenTheme, () => {});
    component.update(buildSpawnRows({ args, details: undefined }), false);

    expect(component.render(80).join('\n')).toContain('1. fixer · queued');
    component.dispose();
  });
});

describe('spawn renderResult', () => {
  it('reuses the same component across renders so spinner and timer state survive', () => {
    const tool = createSpawnTool({
      getExecutionContext: () => ({}) as never,
      availableAgents: () => ['fixer'],
    } satisfies SpawnToolHost);
    const context = { args, invalidate: () => {}, lastComponent: undefined as unknown };

    const first = tool.renderResult?.({ content: [] } as never, { expanded: false, isPartial: true }, {} as Theme, context as never);
    context.lastComponent = first;
    const second = tool.renderResult?.({ content: [] } as never, { expanded: false, isPartial: true }, {} as Theme, context as never);

    expect(first).toBeInstanceOf(SpawnResultComponent);
    expect(second).toBe(first as never);
    (first as SpawnResultComponent).dispose();
  });

  it('persists the capped progress trail with the settled result so it can be expanded later', async () => {
    const progress = new SpawnProgress([{ label: 'implement', agent: 'fixer', action: 'create' }], () => 0);
    progress.start(0);
    progress.observe(0, { type: 'tool_execution_start', toolCallId: '1', toolName: 'bash', args: { command: 'git diff' } } as never);
    progress.settle(0, 'success');
    const tool = createSpawnTool({
      getExecutionContext: () => ({}) as never,
      availableAgents: () => ['fixer'],
      run: async () => ({ interactions: [childInteraction({ body: 'done' })], progress, aborted: false }),
    });

    const result = await tool.execute(
      'call-1',
      { context: 'shared', tasks: [{ action: 'create', agent: 'fixer', task: 'implement' }] } as never,
      undefined,
      undefined,
      { cwd: '/tmp' } as unknown as ExtensionContext,
    );

    expect(result.details.progress?.[0]?.trail).toEqual([{ tool: 'bash', input: 'git diff' }]);
  });
});

function details(progress: SpawnProgress): SpawnToolDetails {
  return { version: 1, kind: 'spawn', interactions: [], progress: progress.snapshot() };
}

function renderLines(rows: SpawnTaskRow[], expanded = false, width = 120): string[] {
  const component = new SpawnResultComponent(theme, () => {});
  component.update(rows, expanded);
  const lines = component.render(width);
  component.dispose();
  return lines;
}
