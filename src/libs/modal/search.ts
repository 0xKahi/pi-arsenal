/** Literal, case-insensitive matching shared by filters and rendered-line search. */
export interface MatchRange {
  /** UTF-16 offsets in the searched (optionally whitespace-normalized) text. */
  readonly start: number;
  readonly end: number;
}

export function normalizeSearchText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** Empty queries have no pattern and never produce zero-length matches. */
export function buildSearchPattern(query: string): RegExp | undefined {
  const normalized = normalizeSearchText(query);
  return normalized === '' ? undefined : new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
}

export function findMatches(text: string, query: string | RegExp, collapseWhitespace = false): MatchRange[] {
  const pattern = typeof query === 'string' ? buildSearchPattern(query) : new RegExp(query.source, 'giu');
  if (pattern === undefined) return [];
  const searched = collapseWhitespace ? normalizeSearchText(text) : text;
  return [...searched.matchAll(pattern)]
    .filter(match => match[0].length > 0)
    .map(match => ({
      start: match.index,
      end: match.index + match[0].length,
    }));
}
