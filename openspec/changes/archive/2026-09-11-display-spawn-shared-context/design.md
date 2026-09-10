## Context

See `proposal.md` — Why. Requirements live in `specs/multiverse-tools/spec.md`.

Two facts about the current renderer shape this design:

1. `buildSpawnRows` (`src/extensions/multiverse/tools/spawn/spawn-result.component.ts`) returns `SpawnTaskRow[]` — strictly per-task. The only batch-scoped datum today, `boundaryNonce`, is already threaded separately through `SpawnResultComponent.update(rows, expanded, boundaryNonce)`. The shared context is the second such datum.
2. Glyph vocabulary in this codebase is split cleanly along a file boundary. `src/libs/tui-glyphs.ts` holds the structural set — spinner frames, status symbols, tree connectors — shared by both the spawn and p2p-council components, all below U+E000, enforced by `test/libs/tui-glyphs.test.ts:44`. Every Nerd Font private-use glyph in the entire repository lives in `spawn-result.component.ts` as a decorative label prefix: `` U+F4ED (`tool logs:`, line 152), `󰻞` U+F0EDE (`prompt:`, line 166), `` U+F003 (footer, line 184). No other extension uses one.

## Goals / Non-Goals

Goals:
- One batch-scoped presentation region, rendered from tool call arguments only.
- Bounded height regardless of terminal width, consistent with the component's existing capping discipline (collapsed rows ≤ 10, tool trail ≤ 12, summarized tool input ≤ 80 chars).

Non-Goals:
- Promoting label glyphs into the shared glyph module. See the glyph decision below.
- Recovering the shared context from the durable run manifest. `SpawnManifest.context` exists and `recoverSpawnManifests` could read it, but consulting it would pull session recovery into a presentation change. If tool call arguments are unavailable, the display reports absence.
- Any change to child prompts, the result envelope, or model-facing content.
- Reconciling the per-task `prompt:` label with the fact that a child actually receives shared context followed by task text. Surfacing the shared context above the rows makes the split legible; renaming the label is a separate concern.

## Decisions

### Placement: between the header line and the first task row

The shared context is a property of the batch, and the only existing batch-scoped line is the header. Rendering it directly beneath the header, indented with `treeContinuation(false)` (`'│  '`), reads correctly as a tree: the vertical bar promises siblings below, and the context sits above every branch exactly as it sits above every child prompt.

Alternatives considered:
- *Fold into each row's `prompt:` field* (`prompt = context + "\n\n" + task`). Makes `prompt:` literally true, but repeats the context up to ten times inside the tree and destroys scannability for large batches.
- *Append below the per-task detail blocks in `renderExpanded`.* Puts shared setup after everything it applies to, and buries it beneath potentially thousands of lines of response bodies.

### Cap: ten lines measured after wrapping

The cap counts rendered lines, not source newlines. A single-paragraph 2 KB context contains one newline but wraps to dozens of lines; capping on source newlines would let it blow past the intended height at narrow widths. Counting after wrapping makes the block's maximum height a constant, which is the property the cap exists to guarantee. The omitted-line count reported to the user is therefore also in rendered lines.

### Wiring: convert `update` to an options object

`update({ rows, expanded, boundaryNonce, sharedContext })` rather than a fourth positional parameter. Two optional trailing positionals is already the point where call sites become unreadable, and the batch-scoped set has now grown twice. The cost is mechanical: existing `update(...)` call sites, which are confined to `spawn.tool.ts` and the component tests.

Alternative considered: return `{ rows, sharedContext }` from `buildSpawnRows`. Rejected — it renames what that function means and still leaves `boundaryNonce` threaded separately, so the inconsistency survives.

### Glyph: `󰦪` declared inline, alongside the component's existing label glyphs

The new shared-context glyph is `󰦪` (U+F09AA, text-box-multiple): the same Material Design family as the `󰻞` prompt glyph it sits above, so it renders at the same width under the same patched fonts, and "multiple" reads as shared-across-tasks.

It is declared inline at its label, as the fourth member of the existing local set, and `src/libs/tui-glyphs.ts` is not touched.

The two glyph families serve different purposes and the existing file boundary already separates them correctly:

- Structural glyphs (`tui-glyphs.ts`) are shared across components and load-bearing. A tofu'd `├─` breaks tree alignment; a tofu'd `✓` destroys the success/failure distinction. Plain Unicode there is a real constraint, and a test enforces it.
- Label glyphs decorate one component's section headings and are used nowhere else. A tofu'd glyph before the word `shared context:` is cosmetic — the label still reads.

Alternatives considered:
- *Move all four glyphs into `tui-glyphs.ts` under a new Nerd-Font-permitted export.* Rejected: it promotes decoration used by exactly one component into a module that p2p-council also imports, and forces a carve-out into a module whose current rule is a single clean line. The apparent inconsistency was a misreading — nothing has drifted, the boundary simply had not been written down.
- *A plain-Unicode glyph such as `▤`.* Rejected: it would render unlike the `󰻞 prompt:` block a few lines below, reading as a mistake rather than a distinction.

### Absent context renders as `none`

The schema requires `context` with `minLength: 1`, so a valid settled call always has it. But `args` is typed `Partial<SpawnInput>` and can be incomplete during partial renders. Rendering the block with body `none` keeps the block's position stable instead of having a region appear and shift the tree once arguments finish streaming. It matches how `childSessionId` already renders `none` in the expanded detail block.

### Sanitization and width

The shared context is caller-authored, not child-authored, so it is not untrusted in the way child bodies are. It still passes through the same `plain()` + `wrapTextWithAnsi` + `truncateToWidth` path as every other rendered string: the component's render-failure fallback depends on nothing in the render path throwing, and one uniform text path is cheaper to reason about than an exemption.

## Risks / Trade-offs

- **A ten-line cap hides the tail of a long context, which is often where the operative constraints sit** → The omitted-line count makes the truncation visible rather than silent, and the full string remains in the durable run manifest.
- **Converting `update` to an options object touches every existing test call site** → Mechanical and compiler-checked; no behavioural surface changes.
- **Correcting the `tui-glyphs.ts` comment concedes that Nerd Fonts are required for parts of the TUI** → That is already true at two call sites; the comment currently misleads.
- **The block consumes vertical space above the rows on every expansion** → Bounded at eleven lines including the label, and only in the expanded view, which is opt-in.

## Migration Plan

Not applicable. Presentation-only, no persisted format change, no model-facing change. Reverting is removing the region and restoring the previous `update` signature.
