## 1. Thread the shared context to the component

- [x] 1.1 Convert `SpawnResultComponent.update` to a single options object `{ rows, expanded, boundaryNonce, sharedContext }` and verify the project typechecks with no remaining positional call sites.
- [x] 1.2 Update `renderResult` in `src/extensions/multiverse/tools/spawn/spawn.tool.ts` to read `context?.args?.context` and pass it as `sharedContext`, and verify a test asserting the component receives the shared context from tool call arguments passes.
- [x] 1.3 Update existing `update(...)` call sites in `test/extensions/multiverse/tools/spawn/spawn-result.component.test.ts` to the options object and verify the suite passes with no behavioural assertions changed.

## 2. Render the shared context block

- [x] 2.1 Render a batch-scoped block in `renderRows` between the header line and the first task row, only when expanded, using indent `treeContinuation(false)`, the label `shared context:` prefixed by an inline `󰦪` (U+F09AA) declared alongside the component's existing label glyphs and leaving `src/libs/tui-glyphs.ts` untouched, and the body wrapped to the same width as the per-row expanded text; verify with a test asserting the block appears after the header and before the first task row.
- [x] 2.2 Cap the block body at 10 rendered lines measured after wrapping, appending `… N more lines` with the count of omitted rendered lines; verify with tests covering a short context that is not capped, a many-newline context, and a single-paragraph context long enough to wrap past the cap at a narrow width.
- [x] 2.3 Render the body as `none` when the shared context is absent or empty, and verify a test asserting the block still appears with body `none`.
- [x] 2.4 Pass the body through the component's existing `plain()` sanitization and width-bounding path, and verify a test asserting escape sequences and over-width text in the shared context neither corrupt nor overflow the render.

## 3. Confirm nothing else moved

- [x] 3.1 Verify by test that the collapsed view contains no shared context and that each expanded row's `prompt:` still shows only that task's own instructions.
- [x] 3.2 Verify by test that model-facing content, the result envelope, and the run manifest are byte-identical to before for a fixed batch input.
- [x] 3.3 Verify `src/libs/tui-glyphs.ts` is unmodified and `test/libs/tui-glyphs.test.ts` passes unchanged.
- [x] 3.4 Run the full test suite, the typechecker, and the linter, and run `openspec validate display-spawn-shared-context --strict`.
