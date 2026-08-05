/**
 * Shared modal dialog library: shell, navigation schemes, tab strategies,
 * layers, and layout helpers. Self-contained — imports only from Pi host
 * packages so the directory can be copied into other Pi plugin projects.
 */
export { ListNavigator, type ListNavigatorOptions, PreviewScroller } from './list-navigator';
export { ModalDialog, type ModalDialogOptions, type ModalFrame, type ModalHeight } from './modal-dialog';
export { PiKeybindingsScheme } from './navigation/pi-scheme';
export { VimNavigationScheme } from './navigation/vim-scheme';
export { type ModalComponentFactory, type ModalLayout, presentModal } from './presenter';
export { PreviewLayer, type PreviewLayerOptions } from './preview-layer';
export { RenderCache } from './render-cache';
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
