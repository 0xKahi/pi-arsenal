## 1. Batch Input and Result Model

- [x] 1.1 Replace the public `p2p_ask` parameters with a non-empty `requests: [{ to, prompt }]` schema and update its description, snippet, and guidelines for role-specific batch prompts.
- [x] 1.2 Add compatibility normalization that converts stored `{ to, prompt }` arguments into one-request batches for execution and rendering without advertising legacy fields.
- [x] 1.3 Define ordered pending, success, failure, and batch-validation detail types suitable for both partial updates and restored final results.
- [x] 1.4 Implement case-sensitive duplicate-target preflight validation that returns a non-throwing error before any transport call.

## 2. Concurrent Execution and Output Bounds

- [x] 2.1 Publish an initial ordered pending snapshot and dispatch every distinct request concurrently through the existing prompt RPC state API.
- [x] 2.2 Normalize each request's reply or error independently, update its fixed ordered slot, and publish complete partial snapshots as requests settle.
- [x] 2.3 Propagate caller cancellation to every outstanding request and finalize aborted entries without discarding outcomes that already settled.
- [x] 2.4 Implement fair reply-budget allocation, explicit per-reply truncation notices, and a final aggregate line/byte safety cap shared by model content and retained TUI reply details.
- [x] 2.5 Format final model-facing content as request-ordered, target-attributed replies and failures without TUI glyphs or repeated prompts.

## 3. Batch TUI Component

- [x] 3.1 Add a reusable width-aware batch result component that renders the `p2p_ask` heading, ordered tree connectors, status symbols, and correctly pluralized aggregate counts.
- [x] 3.2 Animate pending rows through the specified Braille frames every 80 ms with one timer per tool row, stopping the timer when no requests remain pending.
- [x] 3.3 Render collapsed results with target statuses and counts only, omitting all prompt and reply bodies.
- [x] 3.4 Render expanded results with complete soft-wrapped prompts under tree rows and settled attributed replies or errors immediately beneath the aggregate count, with no blank separator, outcome symbols aligned to the aggregate symbol, reply bodies indented two additional spaces, and all lines kept within terminal width.
- [x] 3.5 Make the result component own the complete visual tree, keep the call component intentionally empty, and reuse `lastComponent` across partial and final renders.

## 4. Verification

- [x] 4.1 Add execution tests proving distinct prompts dispatch concurrently, later completions do not reorder entries, and successful replies survive sibling busy, missing, timeout, disconnection, and abort outcomes.
- [x] 4.2 Add tests proving duplicate targets dispatch nothing and legacy single-request arguments execute and render as one-entry batches.
- [x] 4.3 Add output-bound tests for several oversized replies, fair outcome representation, explicit truncation, aggregate limits, and absence of hidden unbounded replies in details.
- [x] 4.4 Add renderer tests for pending animation frames and interval, independent state transitions, tree connectors, singular/plural counts, collapsed omission, expanded prompts/outcomes, exact aggregate-to-outcome spacing and alignment, wrapping, and timer shutdown.
- [x] 4.5 Run the focused p2p-council test suite and project type checks, resolving regressions without changing the specified behavior.

## 5. Documentation

- [x] 5.1 Update `docs/p2p-council.md` with the request-array syntax, unique-target rule, concurrent partial-failure behavior, aggregate limits, and collapsed/expanded TUI examples.
