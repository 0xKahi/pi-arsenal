# Tasks

## 1. Vendored modal UI (shared library)

- [x] 1.1 Port pi-qol `formatTokens` to `src/libs/format/tokens.ts`. Verify with `test/libs/format/tokens.test.ts`, covering each threshold: `999`, `3.4k`, `123k`, `1.2M`, `12M`.
- [x] 1.2 Port `layoutPreviewBlocks` + `BlockNavigator` to `src/libs/modal/block-layout.ts`. Verify with `test/libs/modal/block-layout.test.ts`, covering: scrolling within an oversized block before advancing, gg/G, and half-page moves.
- [x] 1.3 Port `UsageBlockLayer` as a generic `BlockListLayer` in `src/libs/modal/block-list-layer.ts`:
  - header/body/onOpen callbacks
  - excerpts capped by available height, with a `… +N lines` overflow
  - a selected-header marker
  - no mouse handlers
  - copy via a callback, with a transient in-layer status line

  Verify with `test/libs/modal/block-list-layer.test.ts`, covering truncation, Enter on truncated vs non-truncated blocks, and selection retention.
- [x] 1.4 Port `SearchablePreview` with `search.ts`, `highlight.ts` and the JSON formatting helper into `src/libs/modal/`. It is text-focused only while the `/` query is active. Verify with `test/libs/modal/searchable-preview.test.ts`, covering: `/` search, `n/N`, `y` copy callback, and Esc behavior.
- [x] 1.5 Export the new modules from `src/libs/modal/index.ts`. Record each port, its pi-qol source and its adaptations (no mouse, no notice API) in `src/libs/modal/UPSTREAM.md`. Verify `bun run type-check` passes.

## 2. Child session projection (pure)

- [x] 2.1 Implement `src/extensions/multiverse/child-sessions/child-session-projection.ts`:
  - enumerate child ids from spawn details on the parent branch
  - resolve each through `latestChildInteraction`
  - read child entries through an injected reader (default reads and parses JSONL directly because the public reader can repair the file; a missing file or an unparseable line makes the child unavailable)
  - walk `parentId` from `checkpointAfter` to the root
  - return available or unavailable snapshots, sorted by checkpoint timestamp descending

  Verify with `test/extensions/multiverse/child-sessions/child-session-projection.test.ts`. Cover the spec scenarios:
  - active vs abandoned branch
  - other parent sessions excluded
  - no-checkpoint interaction ignored
  - ordering, including the case where abandoned-branch activity does not reorder
  - transcript path ending at the checkpoint
  - missing or corrupt file marked unavailable
- [x] 2.2 Implement `child-session-summary.ts`:
  - model, provider and thinking from the last assistant message on the path, with fallbacks
  - usage totals over the path (pi-qol `calculateUsageTotals` semantics)
  - cache hit rate
  - context usage (last valid assistant message after the latest compaction, divided by the registry window, or null)

  Verify with `child-session-summary.test.ts`, covering:
  - off-path turns excluded
  - post-compaction unknown
  - unknown model reports `?`
  - 70%/90% tone thresholds
- [x] 2.3 Implement `transcript-blocks.ts` per the design's D4 mapping. Assistant content order is preserved, tool calls are pretty-printed with their `toolCallId`, tool-result errors are flagged, identity and metadata entries are skipped, and compaction and branch summaries become blocks. Verify with `transcript-blocks.test.ts` using a fixture child session that has two interactions, a tool error and a compaction.
- [x] 2.4 Add a read-only guard test. Run the projection and block building against a temp child dir containing an `index.json`, and assert that no file mtimes or contents change.

## 3. Modal integration

- [x] 3.1 Add `src/extensions/multiverse/modal/child-sessions-tab.ts`:
  - a `ModalTab` built on `BlockNavigator`
  - 4-line rows: `ts [agent]`, sessionId, `provider/model (thinking: level)`, and the spend line with themed tones
  - an empty-state message
  - unavailable rows marked as such
  - Enter pushes a transcript `BlockListLayer`, and Enter on a truncated block pushes `SearchablePreview`

  Verify with `test/extensions/multiverse/modal/child-sessions-tab.test.ts`, covering rendering, navigation and Esc returning to the list with its selection kept.
- [x] 3.2 Extend `MultiverseModalState` with `childSessions`. Replace the placeholder tab in `open-multiverse-modal.ts`. Update the placeholder assertions in `test/extensions/multiverse/modal/open-multiverse-modal.test.ts` (around lines 67-70 and 233-251) so they check the new tab's empty and populated states.
- [x] 3.3 In `multiverse.extension.ts` `openModal`, build the child-session snapshots from `ctx.sessionManager.getBranch()`, the parent session id and `ctx.modelRegistry` before `presentModal`. Verify through an `extension.integration.test.ts` case: spawn a child, open the modal, and see that child listed with its transcript.
- [x] 3.4 Document the Child Sessions tab in `docs/multiverse.md`: what is listed, ordering, the spend-line legend, transcript keys, and the read-only/snapshot behavior. Verify the documented keys match the hints rendered by the tab and layers.

## 4. Integration checks

- [x] 4.1 Run `bun test`, `bun run lint` and `bun run type-check`, and verify all pass.
- [x] 4.2 Run `openspec validate add-multiverse-child-sessions-view --strict` and verify it passes.
- [x] 4.3 Manual TUI check in pi:
  - spawn two children, then continue one
  - rewind the parent and spawn again
  - open `/multiverse` → Child Sessions
  - confirm the list scope, the ordering, and the transcript ending at the active-branch checkpoint
  - open a truncated tool result and search within it

## Workflow follow-up

- Archive the change after review, syncing `multiverse-child-session-view` and the modified `multiverse-orchestrator` requirement into the main specs.
