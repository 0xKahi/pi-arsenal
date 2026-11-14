/**
 * Shared modal dialog library: shell, navigation schemes, tab strategies,
 * layers, and layout helpers. Self-contained — imports only from Pi host
 * packages so the directory can be copied into other Pi plugin projects.
 */
export { BlockNavigator, layoutPreviewBlocks, type PreviewBlockExtent, type PreviewLayout, type PreviewLineRef } from './block-layout';
export { BlockListLayer, type BlockListLayerOptions } from './block-list-layer';
export type { CopyCallback } from './copy-status';
export { CURRENT_MATCH_SGR, type HighlightRange, highlightLine, MATCH_SGR, matchColumns } from './highlight';
export { expandJsonSpan, type JsonSpan, prettifyJson, shiftJsonSpan } from './json-format';
export { ListNavigator, type ListNavigatorOptions, PreviewScroller } from './list-navigator';
export { ModalDialog, type ModalDialogOptions, type ModalFrame, type ModalHeight } from './modal-dialog';
export { PiKeybindingsScheme } from './navigation/pi-scheme';
export { VimNavigationScheme } from './navigation/vim-scheme';
export { type ModalComponentFactory, type ModalLayout, presentModal } from './presenter';
export { PreviewLayer, type PreviewLayerOptions } from './preview-layer';
export { RenderCache } from './render-cache';
export { buildSearchPattern, findMatches, type MatchRange, normalizeSearchText } from './search';
export { SearchablePreview, type SearchablePreviewOptions } from './searchable-preview';
export { renderTabStrip } from './tab-strip';
export { ListTab, type ListTabCounts, type ListTabFooterState, type ListTabOptions } from './tabs/list-tab';
export {
  BODY_INDENT,
  calculateViewport,
  DEFAULT_TERMINAL_ROWS,
  fitLine,
  fitToTerminalHeight,
  hintRow,
  normalizeTerminalRows,
  padLine,
  STEP_KEY_HINT,
  singleLine,
  spreadLine,
  type Viewport,
  wrapDescriptionLines,
} from './text';
export type {
  Hint,
  ModalLayer,
  ModalLayerInputPolicy,
  ModalTab,
  ModalTabContext,
  NavigationAction,
  NavigationResult,
  NavigationScheme,
} from './types';
