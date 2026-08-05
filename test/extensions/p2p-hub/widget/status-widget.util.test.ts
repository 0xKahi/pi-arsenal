import { describe, expect, test } from 'bun:test';
import type { P2pRosterEntry } from '../../../../src/extensions/p2p-hub/p2p-hub-state';
import { renderStatusWidgetLines } from '../../../../src/extensions/p2p-hub/widget/status-widget.util';

function entry(name: string, overrides: Partial<P2pRosterEntry> = {}): P2pRosterEntry {
  return {
    identity: { name, model: 'sonnet', context: { tokens: 45_000, contextWindow: 272_000 } },
    status: { kind: 'idle', since: Date.now() },
    role: 'you',
    ...overrides,
  };
}

describe('renderStatusWidgetLines', () => {
  test('renders a top border, one row per member, and a bottom border with the count', () => {
    const lines = renderStatusWidgetLines([entry('agent-a')]);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.startsWith('┏━ p2p-hub ')).toBe(true);
    expect(lines[0]?.endsWith('┓')).toBe(true);
    expect(lines[1]).toContain('agent-a');
    expect(lines[1]).toContain('sonnet');
    expect(lines[1]).toContain('17%');
    expect(lines.at(-1)).toContain(' 1 ');
    expect(lines.at(-1)?.endsWith('┛')).toBe(true);
  });

  test('renders one row per member with a stable member count', () => {
    const lines = renderStatusWidgetLines([entry('a'), entry('b'), entry('c')]);
    expect(lines).toHaveLength(5); // top + 3 rows + bottom
    expect(lines.at(-1)).toContain(' 3 ');
  });

  test('top and bottom border lengths match, providing a consistent frame width', () => {
    const lines = renderStatusWidgetLines([entry('a-long-agent-name-here')]);
    expect(lines[0]?.length).toBe(lines.at(-1)?.length);
  });

  test('an empty roster still renders a frame with a zero count', () => {
    const lines = renderStatusWidgetLines([]);
    expect(lines).toHaveLength(2);
    expect(lines.at(-1)).toContain(' 0 ');
  });
});
