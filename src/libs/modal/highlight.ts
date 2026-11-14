import { visibleWidth } from '@earendil-works/pi-tui';
import type { MatchRange } from './search';

/** Column ranges, not UTF-16 offsets. End is exclusive. */
export interface HighlightRange extends MatchRange {
  readonly current?: boolean;
}

export const MATCH_SGR = '\u001b[43;30m';
export const CURRENT_MATCH_SGR = '\u001b[45;97;1m';
const RESET = '\u001b[0m';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Convert search's UTF-16 offsets on an ANSI-stripped line to terminal columns. */
export function matchColumns(text: string, range: MatchRange): MatchRange {
  return { start: visibleWidth(text.slice(0, range.start)), end: visibleWidth(text.slice(0, range.end)) };
}

/**
 * Insert highlights without losing surrounding SGR styles. Unknown escape or
 * control sequences and ranges splitting a wide glyph fail closed: return the
 * original line. Replaying prior SGRs restores even nested/reset color state.
 */
export function highlightLine(line: string, ranges: readonly HighlightRange[], currentIndex = -1): string {
  if (ranges.length === 0) return line;
  const tokens: { text: string; column: number; width: number; sgr: boolean }[] = [];
  let column = 0;
  for (let offset = 0; offset < line.length; ) {
    if (line[offset] === '\u001b') {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately parse terminal SGR escapes.
      const sgr = /^\u001b\[[0-9;:]*m/.exec(line.slice(offset))?.[0];
      if (sgr === undefined) return line;
      tokens.push({ text: sgr, column, width: 0, sgr: true });
      offset += sgr.length;
    } else {
      const end = line.indexOf('\u001b', offset);
      const plain = line.slice(offset, end === -1 ? line.length : end);
      // biome-ignore lint/suspicious/noControlCharactersInRegex: reject terminal controls before inserting highlights.
      if (/[\u0000-\u001f\u007f-\u009f]/u.test(plain)) return line;
      for (const { segment } of segmenter.segment(plain)) {
        const width = visibleWidth(segment);
        tokens.push({ text: segment, column, width, sgr: false });
        column += width;
      }
      offset += plain.length;
    }
  }
  const boundaries = new Set([0, column, ...tokens.filter(token => !token.sgr).map(token => token.column)]);
  const sorted = ranges
    .map((range, index) => ({ ...range, current: range.current === true || index === currentIndex }))
    .sort((a, b) => a.start - b.start);
  if (
    sorted.some(
      (range, index) =>
        !Number.isInteger(range.start) ||
        !Number.isInteger(range.end) ||
        range.start < 0 ||
        range.end <= range.start ||
        !boundaries.has(range.start) ||
        !boundaries.has(range.end) ||
        (index > 0 && range.start < (sorted[index - 1]?.end ?? 0)),
    )
  )
    return line;

  let output = '';
  let history = '';
  let active: (typeof sorted)[number] | undefined;
  let index = 0;
  for (const token of tokens) {
    if (active !== undefined && token.column >= active.end) {
      output += RESET + history;
      active = undefined;
      index++;
    }
    if (token.sgr) {
      history += token.text;
      output += token.text;
      if (active !== undefined) output += active.current ? CURRENT_MATCH_SGR : MATCH_SGR;
      continue;
    }
    const next = sorted[index];
    if (active === undefined && next !== undefined && token.column === next.start) {
      active = next;
      output += active.current ? CURRENT_MATCH_SGR : MATCH_SGR;
    }
    output += token.text;
  }
  if (active !== undefined) output += RESET + history;
  return output;
}
