# Upstream synchronization notes

This modal library is vendored from **pi-qol** and should normally remain copy-compatible with it.

## Context-view ports

Sources below are relative to pi-qol's `src/extensions/context-view/ui/`:

| Local module | Source | Adaptations |
| --- | --- | --- |
| `block-layout.ts` | `usage-preview.ts` | Preserves layout and block navigation names; pages move half a viewport rather than upstream's full viewport. Forward paging selects max(current, first fully visible block, falling back to first intersecting); backward selects min(current, last fully visible block, falling back to last intersecting). At fixed offsets, jump to the first/last block. |
| `block-list-layer.ts` | `usage-block-layer.ts` | `UsageBlockLayer` generalized to `BlockListLayer<T>` with `blocks/header/body/onOpen` callbacks. No usage model or mouse handlers; height-capped excerpts and selected-header arrow retained. |
| `searchable-preview.ts` | `searchable-preview.ts` | No mouse handlers; dynamic text-focused policy only during query editing; focus forwarding and disposal. |
| `search.ts`, `highlight.ts` | same filenames | Literal search and ANSI/grapheme-safe highlighting copied unchanged. |
| `json-format.ts` | `json-preview.ts` | Local structural `JsonSpan` type; exports `prettifyJson` as well as span helpers, removing context-view model dependency. |
| `copy-status.ts` | `copy.ts` (replacement) | Clipboard access is an injected `CopyCallback`; no modal notice API. Both layers render status and accept `requestRender` for async updates. Character counts use raw normalized string lengths, not `toLocaleString('en-US')`. Success, empty-content warnings, and failures share a fixed 2000ms TTL, restarted when the latest copy completes; stale async results are ignored and timers are disposed on pop. |

Consumers supply block header/body rendering (including error tones), raw `copyText`
when needed, and `onOpen: block => context.pushLayer(new SearchablePreview(...))`.
Confirm only opens truncated blocks and never resets the block selection.
Search Esc clears an actively edited query without popping; after confirming a query,
Esc pops the preview. The optional `ModalLayer.handleEscape(): boolean` hook enables
this upstream behavior while preserving shell-owned Escape for other layers.

## Footer-format ports

| Local module | Source | Adaptations |
| --- | --- | --- |
| `src/libs/format/tokens.ts` (`formatTokens`) | pi-qol `custom-footer/token-stats.ts` | Values rounding to 1000k roll over to M; values rounding to 10.0k use integer k formatting. |
| `src/libs/tui-glyphs.ts` (`CACHE_GLYPHS`) | pi-qol footer glyph defaults | Cache/cache-read/cache-write Nerd Font glyphs and trailing spaces preserved in a shared constant. |

## Pending upstream enhancement: text-focused layers

This copy adds a generic modal-layer enhancement that must be mirrored into pi-qol before the next vendor refresh:

- `ModalLayer.inputPolicy: 'navigation-first' | 'text-focused'`, defaulting to navigation-first.
- Optional layer focus propagation through `ModalLayer.focused`.
- Raw input ownership for a text-focused top layer before tab/Vim navigation, with Esc retained by the shell.
- `ModalTabContext.popLayer()` and layer `dispose()` cleanup.
- `ModalLayer.rendersHints` suppresses the duplicate shell footer and releases its chrome row; optional `setShellHints(lead, trail)` supplies scheme hints before own hints and Tab Switch/Esc Back after. Copy status replaces the entire row; active search editing keeps its query-specific hints.
- Shared routing/focus coverage in `test/libs/modal/modal-dialog.test.ts`.

When syncing either direction, port these contracts and tests together; do not overwrite this behavior with an older pi-qol modal directory.
