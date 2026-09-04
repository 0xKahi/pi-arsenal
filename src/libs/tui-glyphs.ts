/**
 * Shared TUI primitives for tool renderers.
 *
 * Spinner frames, status symbols, and tree connectors live here so every tool row in the
 * arsenal renders the same vocabulary instead of each extension redeclaring its own (or
 * importing another extension's internals).
 *
 * Plain Unicode only: Nerd Font glyphs render as tofu without a patched font.
 */

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** Repaint cadence for spinner-driven components, in milliseconds. */
export const SPINNER_INTERVAL_MS = 80;

/** Returns the spinner frame for an arbitrary counter, wrapping safely. */
export function spinnerFrame(tick: number): string {
  const index = ((tick % SPINNER_FRAMES.length) + SPINNER_FRAMES.length) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[index] as string;
}

/** Terminal-state symbols shared across tool renderers. */
export const STATUS_SYMBOLS = {
  success: '✓',
  failure: '✗',
  replied: '↩',
  pending: '○',
  warning: '⚠',
} as const;

/** Tree drawing pieces: a row prefix plus the matching continuation indent. */
export const TREE_CONNECTORS = {
  branch: '├─ ',
  last: '└─ ',
  /** Indent under a `branch` row. */
  vertical: '│  ',
  /** Indent under a `last` row. */
  blank: '   ',
} as const;

export function treeConnector(isLast: boolean): string {
  return isLast ? TREE_CONNECTORS.last : TREE_CONNECTORS.branch;
}

export function treeContinuation(isLast: boolean): string {
  return isLast ? TREE_CONNECTORS.blank : TREE_CONNECTORS.vertical;
}
