import { expect, test } from 'bun:test';
import { formatTokens } from '../../../src/libs/format/tokens.ts';

test('matches upstream token thresholds and rounding', () => {
  for (const [count, expected] of [
    [999, '999'],
    [9950, '9.9k'],
    [9999, '10k'],
    [999500, '1.0M'],
    [999950, '1.0M'],
    [999999, '1.0M'],
    [3412, '3.4k'],
    [12400, '12k'],
    [123000, '123k'],
    [1200000, '1.2M'],
    [12000000, '12M'],
    [1000, '1.0k'],
    [10000, '10k'],
    [1000000, '1.0M'],
    [10000000, '10M'],
  ] as const) {
    expect(formatTokens(count)).toBe(expected);
  }
});
