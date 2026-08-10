## Why

`p2p_ask` can currently consult only one council member per tool call, forcing the caller to issue multiple calls when it needs independent input from several agents. A batch operation will let a caller dispatch role-specific prompts concurrently and observe replies, failures, and progress as one council request.

## What Changes

- **BREAKING** Replace the public single-request `{ to, prompt }` input with a `requests` array whose entries each contain `to` and `prompt`; prepare historical single-request calls as one-entry batches when restoring older sessions.
- Require every target name in a batch to be unique, rejecting the whole batch before dispatch if a target appears more than once.
- Dispatch requests to distinct council members concurrently and preserve request order in partial updates and final results.
- Treat busy, timeout, disconnection, routing, and other per-agent failures independently so successful peers can still reply.
- Stream per-agent pending, success, and failure state to the TUI, including an 80 ms animated Braille spinner for pending requests.
- Render collapsed results as a target-status tree and aggregate outcome count; render expanded results with each outbound prompt in that tree and attributed replies or errors beneath the aggregate count.
- Bound the combined model-facing output and retained reply details to Pi's standard tool-output limits, with explicit truncation notices.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-council-tools`: Change `p2p_ask` from a single-target RPC into a concurrent, uniquely targeted batch RPC with partial progress, aggregate output bounds, and batch-specific TUI presentation.

## Impact

- Tool schema, execution, result details, compatibility preparation, and custom rendering in `src/extensions/p2p-council/tools/p2p-ask.tool.ts`.
- Existing p2p tool and presentation tests, with additional coverage for concurrency, duplicate rejection, partial failures, progress updates, rendering, cancellation, and aggregate truncation.
- The `p2p-council-tools` behavioral contract and `docs/p2p-council.md` usage documentation.
- No WebSocket protocol change is expected because `P2pCouncilState` already tracks concurrent outbound prompt requests by request ID.
