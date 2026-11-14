# Design

## Context

See proposal.md for the motivation and specs/multiverse-child-session-view for the required behavior. This section covers only the current state that shapes the approach.

- **The placeholder tab.** `src/extensions/multiverse/modal/open-multiverse-modal.ts:35-41` renders `Coming soon.` today. `MultiverseModalState` has no session data. The modal is a `ModalDialog` using `VimNavigationScheme`. Tabs can push layers through `ModalTabContext.pushLayer` (see `src/extensions/p2p-council/modal/open-p2p-council-modal.ts:21-50`).
- **Async state loading.** `openModal` in `multiverse.extension.ts:213-255` builds the async-derived tab state before `presentModal`, as it already does for presets.
- **What the parent branch records.** Spawn tool results on the parent branch store `SpawnToolDetails.interactions[]`. Each `ChildInteraction` includes `childSessionId`, `childSessionFile`, `agent`, and `checkpointAfter`. `latestChildInteraction(branchEntries, id)` (`results/child-interaction.ts:110`) is the branch-scoped lookup that `spawn` uses to resume a child. A tool result is only appended when its spawn completes.
- **Child sessions are tree-shaped JSONL files.** Every entry carries `id`/`parentId`, and entries are written in append order. A resumed child branches from a checkpoint, so one file can hold several branches.
- **Write hazards when reading child files:**
  - `SessionManager.open()` may rewrite legacy files during migration.
  - `ChildSessionRepository.locate()` may rewrite `index.json`.
  - `loadEntriesFromFile(path)` (public export) can repair a missing trailing newline.
- **Live-only session APIs.** `AgentSession.getSessionStats()` and `getContextUsage()` need a live session, and no live session exists for a child once its run is over. Their logic has to be reimplemented over the stored entries.
- **The vendored modal library.** `src/libs/modal` is vendored from pi-qol (`UPSTREAM.md`). pi-qol's context-view has transcript UI that does not depend on its grouping: `UsageBlockLayer`, `layoutPreviewBlocks`, `BlockNavigator`, `SearchablePreview`, plus the helpers `json-preview`, `search`, `highlight` and `copy`. pi-qol's footer has `formatTokens` and `calculateUsageTotals` (`custom-footer/token-stats.ts`).
- **Gaps in our copy of the modal library:** no mouse events and no modal notice API. pi-qol's versions use both.

## Goals / Non-Goals

**Goals:**
- Keep the projection pure and deterministic (parent branch entries + child entries -> view model), so it can be unit-tested without a TUI or filesystem.
- Use `latestChildInteraction` as the single source of truth for which children are reachable and where they resume. The view must never disagree with `spawn`.
- Reuse pi-qol's block and preview UI with minimal adaptation, kept copy-compatible where feasible.

**Non-Goals:**
- Live refresh while a child runs, and streaming progress.
- Session actions from the tab (continue, delete, rename, fork, switch into a child).
- Cumulative cost across all branches of a child file.
- Mouse wheel support and modal notices. Neither exists in our vendored modal library yet.

## Decisions

### D1. Reachability and resume point come from the parent branch
Enumerate the distinct `childSessionId`s in the spawn details on `ctx.sessionManager.getBranch()`. Resolve each one through `latestChildInteraction`, and drop ids with no resumable interaction. The result supplies `agent`, `childSessionFile` and `checkpointAfter`.
- *Alternative considered:* list the parent's child directory or `index.json`. That lists children that exist only on abandoned branches, and needs a second filter anyway.
- *Alternative considered:* use the child file's own leaf. It is wrong after a parent rewind: the leaf may sit on work that only an abandoned parent branch produced.

### D2. The active path is walked from the checkpoint through `parentId`
Read and parse the child JSONL directly because the public reader can repair the file; a missing file or an unparseable line makes the child unavailable. Index entries by `id`. Walk `parentId` back from `checkpointAfter` to the root, then reverse.
- If the checkpoint id is missing, the file is missing, or entries lack ids (an unsupported legacy format), the result is `{ status: 'unavailable', reason }` and the code does not throw.
- *Alternative considered:* `SessionManager.open(file).getBranch(checkpoint)`. It has the same result but may rewrite legacy files, which violates the read-only requirement.
- *Alternative considered:* `buildSessionContext` / `buildSessionProjection`. These return the model's effective context, which applies compaction and context edits. We want what was recorded, not what the model currently sees.

### D3. Summary metadata is derived from the path
- **lastUsed:** the `timestamp` of the checkpoint entry. Sort descending, and break ties by child id.
- **provider, model and thinking level:** the last assistant message on the path. Use `responseModel ?? model`, and the message's `thinkingLevel`. If the message has none, fall back to the last `thinking_level_change` entry on the path, then to `—`.
- **Usage totals:** port `calculateUsageTotals` semantics over the path. That covers assistant usage, tool-result usage, and usage on `usage`, `compaction` and `branch_summary` entries. Cache hit rate comes from the last assistant message.
- **Context usage:** the last assistant message after the latest compaction on the path that is not aborted or an error and has usage. Context tokens are `totalTokens || input+output+cacheRead+cacheWrite`. The window comes from `ctx.modelRegistry.find(provider, model)?.contextWindow`. If there is no qualifying message (for example, right after a compaction) or no window, the percentage is `null` and renders as `?`. This matches the pre-reply behavior of pi's `getContextUsage`, minus the trailing-message estimate, which is not exported.
- *Alternative considered:* persist a stats snapshot at the end of each run. It is exact, but it changes runtime and persistence for a value we chose to approximate.

### D4. Transcript entries map 1:1, in order, to blocks
`buildTranscriptBlocks(path)` emits ordered `TranscriptBlock { id, kind, timestamp, title, meta?, body, isError? }`.

| Path entry | Blocks emitted |
| --- | --- |
| user message | `prompt` (text content; images shown as `[image]`) |
| assistant message | one block per content item, in order: `text` -> `assistant`, `thinking` -> `thinking`, `toolCall` -> `toolCall` (title = tool name, body = pretty-printed JSON arguments, `toolCallId` kept) |
| toolResult | `toolResult` (title = tool name, body = text content, `isError` shown as the error tone) |
| `bashExecution` / `custom_message` | text blocks |
| `compaction` / `branch_summary` | `summary` blocks |
| identity `custom` entry, `label`, `session_info`, `model_change`, `thinking_level_change`, `usage`, `context_edit` | skipped (no block) |

- Blocks are built lazily when a row is confirmed, and memoized for each child.
- *Alternative considered:* pi-qol's `UsageCategory` classification followed by a timestamp sort. It loses the order of blocks within a message and the call/result adjacency.

### D5. Module layout

| Module | Contents |
| --- | --- |
| `src/extensions/multiverse/child-sessions/child-session-projection.ts` | D1 + D2. Takes `branchEntries`, `readEntries: (file) => SessionEntry[]` and `findContextWindow`. |
| `src/extensions/multiverse/child-sessions/child-session-summary.ts` | D3, and the spend-line segments. |
| `src/extensions/multiverse/child-sessions/transcript-blocks.ts` | D4. |
| `src/extensions/multiverse/modal/child-sessions-tab.ts` | Tab and transcript layer wiring. |

`MultiverseModalState` gains `childSessions: ChildSessionSnapshot[]`. `openModal` computes it before `presentModal`. The projection is cheap: one file read per reachable child, and only for children on the branch.

### D6. Vendored UI goes in the shared modal library
Port these into `src/libs/modal/` and record them in `UPSTREAM.md` as pi-qol context-view ports:

| New module | Source |
| --- | --- |
| `block-layout.ts` | `layoutPreviewBlocks`, `BlockNavigator` |
| `block-list-layer.ts` | `UsageBlockLayer`, generalized over `{header, body}` callbacks; nothing usage-specific |
| `searchable-preview.ts` | plus `search.ts` and `highlight.ts` |
| `json-format.ts` | `json-preview` |
| `src/libs/format/tokens.ts` | `formatTokens` |

Adaptations:
- Drop the mouse handlers.
- Replace `copyWithNotice` with a copy callback, and add a transient status line rendered inside the layer.
- `SearchablePreview` sets `inputPolicy: 'text-focused'` only while the `/` query input is active, so Vim keys keep working otherwise.
- *Alternative considered:* place these under multiverse. p2p-council and future modals benefit from the shared library, and the code came from that library's sibling.

### D7. The list tab reuses block layout instead of `ListTab`
Rows are 4 lines, but `ListTab.renderRow` returns a single line. The Child Sessions tab is therefore a `ModalTab` built on `BlockNavigator`. Each child is one block:
- line 1: the header (`ts [agent]`)
- the remaining lines: the indented fields

Enter pushes the transcript `BlockListLayer`. Inside that layer, Enter on a truncated block pushes `SearchablePreview`. Esc pops back through the layer stack, and each layer keeps its selection.

Timestamps use `[DD-MM-YYYY HH:MM:SS]` in local 24-hour time, always including the date, first after the two-column gutter; omitted when absent. Timestamp text uses `syntaxString`, brackets use `dim`, the first label uses bold `mdHeading`, and later labels use `toolTitle`: a deliberate departure from pi-qol's all-dim timestamp and muted later labels.

Spend lines match pi-qol: one-space-joined dim input/output, Nerd Font cache cluster (`[ READ  WRITE hit%]`), three-decimal cost, and one-decimal context percent/window. Context is `warning` strictly above 70% and `error` strictly above 90% (raw values); unknown usage is `?/window`, or `?` without a window.

## Risks / Trade-offs

- **[The context % ignores trailing tool results after the last reply]** It can read low for a child that ended on large tool outputs. Mitigation: label it as context usage at the last reply, and show `?` when unknown rather than a guess.
- **[Large child files are read synchronously on modal open]** Mitigation: only children reachable on the branch are read. If this proves slow, move reads into the async `openModal` with `readFile` plus `parseSessionEntries`; the projection is reader-agnostic.
- **[The vendored copies drift from pi-qol]** Mitigation: list each port and its adaptations in `UPSTREAM.md`, and keep public names aligned.
- **[A failed interaction with a checkpoint is listed]** Its resume point is real, so listing it is correct. The transcript shows the error result as recorded.
- **[Snapshot staleness]** A spawn finishing while the modal is open is not reflected until the modal is reopened. This is accepted per spec.

## Migration Plan

No data migration. The change is additive, apart from the tab content. Rollback is a revert: no persisted format is introduced.

## Open Questions

- Exact glyphs for the spend line (`↑`/`↓` and cache icons versus ASCII). Use the repo's `tui-glyphs` conventions during implementation. This does not affect specs or tasks.
