# Proposal

## Why

The `/multiverse` modal's `[Child Sessions]` tab is still a "coming soon" placeholder. Once `spawn` returns, the parent can't see which children exist, what model and context they hold, or what they actually did: prompts, tool calls, tool outputs and replies. Child sessions are already durable and continuable, so the parent needs a way to inspect them before choosing to reuse one.

## What Changes

- Replace the Child Sessions placeholder with a list of the child sessions reachable on the **active parent branch** of the **current parent session**, ordered by most recently used.
- Each list row shows:
  - last-used timestamp and subagent type
  - child session id
  - provider/model id and thinking level
  - a token spend line in the style of the pi-qol footer: abbreviated input/output, cache read/write and hit rate, cost, and approximate context usage against the model's window
- Selecting a row opens a transcript layer: a single chronological list of the child's interactions along the path the parent would resume from. It covers parent prompts, assistant text, thinking, tool calls, tool results (errors marked) and compaction summaries.
- Long transcript blocks are truncated in the list. A full, searchable preview opens on demand.
- All values come from the child path that is reachable from the active parent branch. Work recorded only on abandoned parent branches is not shown and is not counted.
- Viewing is read-only. Opening the tab never writes to parent or child session files or to the child session index.
- Reusable transcript UI from pi-qol's context-view is vendored into the shared modal library: a block list layer, block navigation, a searchable full preview, JSON formatting and token formatting.

## Capabilities

### New Capabilities
- `multiverse-child-session-view`: Inspecting the parent's reachable child sessions in the Multiverse modal: which children are listed and in what order, the metadata and spend summary for each, and the read-only chronological transcript of a child's active path.

### Modified Capabilities
- `multiverse-orchestrator`: The "Multiverse persona-switching modal" requirement drops the V1 coming-soon placeholder for `[Child Sessions]`. The tab now provides the child session view defined by `multiverse-child-session-view`.

## Impact

- **Code**:
  - `src/extensions/multiverse/modal/open-multiverse-modal.ts`: new tab and transcript layer.
  - `src/extensions/multiverse/multiverse.extension.ts`: modal state loading.
  - New read-only child-session projection and summary module under `src/extensions/multiverse/`.
  - New vendored components under `src/libs/modal/`, recorded in `UPSTREAM.md`.
- **Tests**: placeholder assertions in `test/extensions/multiverse/modal/open-multiverse-modal.test.ts` are replaced. New unit tests cover projection, summaries, token formatting and the transcript layer.
- **Docs**: `docs/multiverse.md` gains a Child Sessions section.
- **Dependencies**: none new. Child JSONL is read with the public `@earendil-works/pi-coding-agent` session exports.
- **Runtime behavior**: unchanged. Spawn, checkpoints and session persistence are not modified.
