import { describe, expect, test } from 'bun:test';
import { dye } from '@0xkahi/cli-dye';
import { FormatUtil } from '../../../src/extensions/p2p-hub/format.util';

describe('FormatUtil', () => {
  test('formatDuration renders seconds, minutes, and hours', () => {
    const now = 1_000_000;
    expect(FormatUtil.formatDuration(now - 5_000, now)).toBe('5s');
    expect(FormatUtil.formatDuration(now - 65_000, now)).toBe('1m');
    expect(FormatUtil.formatDuration(now - 3_700_000, now)).toBe('1h');
  });

  test('formatStatus includes the tool name for tool status', () => {
    const now = 1_000_000;
    expect(FormatUtil.formatStatus({ kind: 'idle', since: now - 1000 }, now)).toBe('idle (1s)');
    expect(FormatUtil.formatStatus({ kind: 'tool', toolName: 'bash', since: now - 2000 }, now)).toBe('tool:bash (2s)');
  });

  test('formatTokens abbreviates thousands and millions', () => {
    expect(FormatUtil.formatTokens(500)).toBe('500');
    expect(FormatUtil.formatTokens(45_000)).toBe('45K');
    expect(FormatUtil.formatTokens(2_500_000)).toBe('2.5M');
  });

  test('formatContextNumeric renders tokens/window (percent) or ?/window when unknown', () => {
    expect(FormatUtil.formatContextNumeric({ tokens: 45_000, contextWindow: 272_000 })).toBe('45K/272K (17%)');
    expect(FormatUtil.formatContextNumeric({ tokens: null, contextWindow: 272_000 })).toBe('?/272K');
    expect(FormatUtil.formatContextNumeric(undefined)).toBe('');
  });

  test('formatContextBar renders a proportional bar with percentage', () => {
    expect(dye.strip(FormatUtil.formatContextBar({ tokens: 50, contextWindow: 100 }, 10))).toBe('[#####-----] 50%');
    expect(dye.strip(FormatUtil.formatContextBar(undefined, 10))).toBe('[----------] 0%');
  });
});
