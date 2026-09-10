## Why

The shared `context` string a caller passes to `spawn` is prepended to every child's prompt, yet no rendering surface ever shows it. The expanded batch view displays each task's own instructions under `prompt:`, so a reader inspecting a surprising child answer can see half of what the child was sent and has no way to see the other half. The value already reaches the renderer in the tool call arguments and is simply dropped.

## What Changes

- The expanded spawn batch view gains a batch-scoped `shared context:` block, rendered once between the header line and the first task row.
- The block reads the `context` field of the spawn tool call arguments. No other source is consulted.
- The block is capped at 10 rendered lines, with a trailing count of the lines omitted.
- When the argument is absent, the block renders with the body `none` rather than disappearing.
- The collapsed view is unchanged: no shared context, not even a preview.
- The per-task `prompt:` field is unchanged and continues to show only that task's own instructions.
- Model-facing content, the result envelope, the run manifest, and child prompts are all unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `multiverse-tools`: the "Batch presentation" requirement gains the caller-supplied shared context as an expandable element of a settled or pending batch, alongside the per-task activity, prompt, child session ID, checkpoints, telemetry, and response it already covers.

## Impact

- `src/extensions/multiverse/tools/spawn/spawn-result.component.ts`: new batch-scoped render region and its line cap; the component needs the shared context alongside the existing batch-scoped `boundaryNonce`.
- `src/extensions/multiverse/tools/spawn/spawn.tool.ts`: `renderResult` passes the shared context from `context.args` into the component.
- `test/extensions/multiverse/tools/spawn/spawn-result.component.test.ts`: existing `update(...)` call sites, plus coverage for the new block.
- No change to `src/libs/tui-glyphs.ts`: the new label glyph is declared inline alongside the component's existing label glyphs. See `design.md`.
- No change to the spawn schema, the orchestrator, child prompts, the result envelope, or the run manifest.
