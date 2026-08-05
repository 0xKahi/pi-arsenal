/**
 * Shared modal contracts: navigation schemes, tabs, and layers.
 *
 * Everything in `src/libs/modal/` imports only from Pi host packages so the
 * directory can be copied unchanged into other Pi plugin projects.
 */

/** Semantic action produced by a navigation scheme for one key press. */
export type NavigationAction = 'step-back' | 'step-forward' | 'page-back' | 'page-forward' | 'first' | 'last' | 'confirm' | 'dismiss';

/** Result of a scheme consuming one raw key: swallowed, mapped, or ignored. */
export type NavigationResult = { handled: boolean; action?: NavigationAction };

/** One `[keys, description]` hint pair for the dialog help footer. */
export type Hint = readonly [string, string];

/**
 * Pure key-to-action mapper. Schemes never see dialog state; stateful chords
 * (for example `gg`) are cleared via `reset()` on tab switches and layer
 * changes. `dismiss` is always intercepted by the dialog shell and is never
 * forwarded to tabs or layers.
 */
export interface NavigationScheme {
  consume(data: string): NavigationResult;
  reset(): void;
  /** Movement key hints; `stepLabel` adapts the step verb (Navigate/Scroll). */
  hints(stepLabel?: string): Hint[];
}

/** Input ownership policy for a pushed layer. */
export type ModalLayerInputPolicy = 'navigation-first' | 'text-focused';

/** Content layer pushed above a tab, for example a scrollable preview. */
export interface ModalLayer {
  /** Defaults to navigation-first. Text-focused layers receive raw keys except Esc. */
  readonly inputPolicy?: ModalLayerInputPolicy;
  /** Optional focus plumbing for layers that contain a cursor-bearing input. */
  focused?: boolean;
  render(width: number, height: number | undefined): string[];
  handleInput(data: string): void;
  handleNavigation(action: NavigationAction): void;
  hints(): Hint[];
  invalidate?(): void;
  dispose?(): void;
}

/** Per-tab services provided by the dialog shell at attachment time. */
export interface ModalTabContext {
  /** Push a layer above this tab; dismissal pops it before closing the dialog. */
  pushLayer(layer: ModalLayer): void;
  /** Pop this tab's active layer without completing the dialog. */
  popLayer(): void;
}

/**
 * Strategy interface for modal tab content. The shell owns framing, the tab
 * strip, tab cycling, per-tab layer stacks, the optional filter input, and
 * the help footer; a tab owns only its content.
 *
 * `render` receives the content width and, for height-bounded dialogs, the
 * exact content height to fill; unbounded dialogs pass `undefined`.
 */
export interface ModalTab {
  /** Tab-strip label, re-read on every render so counts can update live. */
  readonly label: string;
  render(width: number, height: number | undefined): string[];
  /** Raw keys the navigation scheme did not handle. */
  handleInput(data: string): void;
  /** Semantic navigation; never includes `dismiss`. */
  handleNavigation(action: NavigationAction): void;
  /** Re-filter content when the dialog owns a shared filter input. */
  applyFilter?(query: string): void;
  /** Caption lines rendered above the shared filter input, when present. */
  filterCaption?(): string[];
  /** Tab-specific hints for the help footer. */
  hints(): Hint[];
  /** Receive shell services; called once when the dialog is constructed. */
  attach?(context: ModalTabContext): void;
  invalidate?(): void;
}
