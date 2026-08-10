## Context

The current `p2p_ask` tool accepts one `{ to, prompt }` request, awaits `P2pCouncilState.askPrompt`, truncates the reply, and renders a separate call preview and result. The state layer already stores outbound RPCs in a request-ID-keyed map, resets inactivity by target, and resolves each response independently. It therefore supports concurrent requests to distinct targets without a protocol change.

Pi composes custom tool rows from separate call and result renderers. Execution can publish partial tool results through `onUpdate`, and renderer context supplies `lastComponent`, row-local state, and `invalidate()`. The final model-facing content and user-facing reply data must remain within standard tool-output bounds.

## Goals / Non-Goals

**Goals:**

- Fan out role-specific prompts to distinct targets concurrently from one tool call.
- Keep validation atomic while treating runtime outcomes independently.
- Present live ordered progress and final prompts/outcomes in one coherent tool tree.
- Preserve old stored single-request calls across resume and history rendering.
- Keep aggregate model output and retained reply text bounded.

**Non-Goals:**

- Broadcasting one shared prompt through a separate shorthand.
- Sending more than one prompt to the same agent in a single batch.
- Queuing a batch request until a busy remote agent becomes idle.
- Changing the WebSocket request/response protocol or allowing one target to process concurrent remote prompts.
- Aggregating or synthesizing council replies into a new model-generated answer inside the tool.

## Decisions

### Use a strict request-array schema with legacy argument preparation

The public schema will be `{ requests: Array<{ to: string; prompt: string }> }` with at least one request. Before schema validation, `prepareArguments` will translate the historical `{ to, prompt }` shape into a one-entry array. The renderer will also normalize legacy arguments because restored transcript rendering does not depend on execution-time preparation.

This is preferred over `to: string | string[]` because each target needs its own prompt, and over parallel `targets` and `prompts` arrays because index coupling is error-prone. Keeping legacy fields out of the public schema prevents models from continuing to generate the obsolete shape.

### Validate duplicate targets before any dispatch

Execution will scan target names case-sensitively before publishing pending state or calling the transport. If a duplicate is found, it will return one non-throwing validation result naming the duplicate or duplicates and dispatch nothing. Case sensitivity follows current member routing semantics.

This is preferred over deduplication because silently discarding a prompt could hide a caller mistake, and over per-entry duplicate failure because the first duplicate might already have started before later validation.

### Fan out with one independently observed promise per request

After validation and connection checks, execution will publish an initial partial result containing all entries as pending, start every `askPrompt` without awaiting another request, and wrap each promise so its settlement updates the corresponding ordered result slot. Each settlement publishes a new partial result through `onUpdate`; final assembly waits until all wrappers settle.

All requests receive the tool's abort signal. Existing state behavior resolves transport and remote errors as values, so batch execution can normalize failures per target without throwing or cancelling siblings. Input order is represented by fixed result slots rather than promise completion order.

### Use a single batch detail model for partial and final rendering

Batch details will contain ordered entries with target and state (`pending`, `success`, or `failure`), plus bounded reply/error metadata needed by rendering. Prompts remain available from renderer context arguments and will not be duplicated into result details. Aggregate counts are derived from entries rather than stored separately.

The model-facing final text will contain only attributed replies and errors in request order; prompts are already present in the tool call. Presentation glyphs, tree connectors, and aggregate labels remain TUI-only.

### Let the result renderer own the complete visual tree

`renderCall` will intentionally return an empty component. Execution will immediately publish initial pending details, after which `renderResult` owns the heading, request tree, aggregate line, and expanded outcomes. This avoids duplicate `p2p_ask` headings caused by Pi composing call and result components vertically.

The result renderer will reuse a purpose-built component through `lastComponent`. Collapsed mode renders only target rows and counts. Expanded mode additionally soft-wraps the full prompt from `context.args` beneath each tree row and renders settled replies/errors below the count. During execution, the lower outcome section contains only settled entries. The outcome section begins on the line immediately after the aggregate count with no blank separator; its status symbols share the aggregate line's horizontal indentation, and reply/error bodies indent two additional spaces:

```text
↩ 1 reply · 2 pending
✓ tester
  Add cancellation and timeout tests...
```

### Animate pending entries within the reusable renderer component

The component will cycle the exact frames `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏` every 80 ms and call the provided invalidation callback. It will maintain at most one animation timer per tool row, reuse that timer across partial updates, and stop it as soon as no entry remains pending. Success uses `✓`; failure uses `✗`.

A row-local animation is preferred over Pi's generic working indicator because each target settles independently and the requested spinner belongs beside each pending target.

### Bound replies as one aggregate result with fair representation

Before final content and details are produced, reply text will be normalized and allocated a bounded share of the standard line and byte budgets, reserving space for target attribution, errors, and truncation notices. Short outcomes leave room that can be used by longer replies; a final aggregate truncation pass provides a hard safety cap. The same retained reply strings feed model content and expanded TUI details.

This is preferred over independently granting every reply the full tool limit, which multiplies context usage by batch size, and over retaining full replies in details, which would hide unbounded session data from the model-facing output. Fair representation prevents an early oversized reply from erasing all later outcomes.

## Risks / Trade-offs

- **[An agent can settle between closely spaced partial updates]** → Keep canonical ordered slots in execution and publish complete snapshots so a later update cannot regress another entry.
- **[A renderer timer can outlive pending work]** → Reuse one component and timer, stop it on final or all-settled updates, and avoid creating timers when rendering restored final history.
- **[Strict schema change can break newly generated old-style calls]** → Document the new signature, update prompt metadata, and reserve `prepareArguments` for stored compatibility without advertising legacy fields.
- **[Fair truncation reduces the maximum reply visible from one agent]** → Make truncation explicit and redistribute unused shares from short replies before the final safety cap.
- **[A large batch can create substantial simultaneous model load]** → Concurrency is intentionally bounded by unique connected council membership; busy remotes decline immediately under existing behavior.
- **[An empty call renderer leaves a brief blank row before the first update]** → Publish the initial pending snapshot synchronously before awaiting any remote promise.

## Migration Plan

1. Introduce the request-array schema and compatibility preparation while retaining the existing tool name.
2. Update prompt metadata and documentation so new model calls use `requests` exclusively.
3. Keep renderer-side normalization for historical transcript entries whose original arguments remain stored.
4. Rollback can restore the prior tool implementation; no network or persisted council-state migration is required.
