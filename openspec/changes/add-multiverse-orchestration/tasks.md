## 1. Configuration and Published Schema

- [x] 1.1 Add full and partial Multiverse Zod schemas with `enabled`, `defaultAgent`, global `maxConcurrency`, and strict per-subagent enablement/model settings; verify defaults, `1..10` bounds, unknown-field rejection, and invalid-feature isolation in config tests.
- [x] 1.2 Merge global and trusted-project Multiverse configuration through the existing config loader and expose it from the config provider; verify nested partial overrides preserve unrelated values in `test/config/config-loader.test.ts`.
- [x] 1.3 Regenerate `assets/config.schema.json` with `bun run buildSchema` and verify the published schema contains descriptions, defaults, enums, strict subagent objects, and no per-subagent concurrency field.

## 2. Subagent Definitions and Rolling Identity

- [x] 2.1 Implement discovery and parsing for the three bundled markdown definitions with required `name`, `tools`, `skills`, and non-empty body; verify valid definitions load and malformed, mismatched, unknown-capability, or empty definitions produce file-specific diagnostics.
- [x] 2.2 Add `explorer`, `fixer`, and `visualizer` definition files from the maintainer's LLW Multiverse bundle, excluding the accidental Visualizer trailing `` `;`` and declaring `skills: []`; verify prompt bodies otherwise match their sources and the shipped roster contains exactly those three names.
- [x] 2.3 Implement a versioned `arsenal-subagent` identity parser that scans the complete session entry set and rejects duplicate, conflicting, unsupported, or unknown identities; verify identity remains file-wide across child conversation branches.
- [x] 2.4 Append the child identity entry to a new child `SessionManager` before its first prompt and include agent name plus parent session ID; verify the first child activation sees the marker and the persisted JSONL contains exactly one marker after the first settled interaction.
- [x] 2.5 Resolve prompt, tools, and skills from the current named definition on every child activation rather than storing definition snapshots; verify reopening a fixture created with an older definition applies the updated definition and a missing or disabled definition fails without deleting the session.

## 3. Session Role Classification and Prompt Policy

- [x] 3.1 Add central session-role state that classifies each session as normal parent or named child during `session_start`/reload and makes child identity authoritative over parent-agent records; verify ordinary sessions remain parents and marked sessions restore as children even when new orchestration is disabled.
- [x] 3.2 Apply child prompt bodies as full base-system-prompt replacements with host, appended-file, command-line appended, and Megamind content removed; verify a child prompt test contains the current definition exactly once while allowing later extension contributions.
- [x] 3.3 Filter SDK child skills to the current definition and remove ambient skills from child prompt context; verify declared subsets and empty lists in focused resource tests. Ambient `/skill:` expansion in a directly reopened child is an accepted V1 limitation: Pi expands skill commands after the `input` event, so no non-racy interception point exists.
- [x] 3.4 Reapply `pi.setActiveTools()` after extension discovery and before a child's first model turn using exactly the current definition's tools; verify Multiverse, Megamind-only, and undeclared extension tools are inactive on creation and reopen.
- [x] 3.5 Keep V1 limited to active-tool selection without adding a general `tool_call` allowlist gate or council activation guard; verify tests document that later extension mutation and council connection are accepted limitations rather than claimed containment.

## 4. Durable Child Storage and Discovery

- [x] 4.1 Implement a canonical cwd-key function and parent-scoped directory resolver for `~/.arsenal/subagent_sessions/<cwd-key>/<parent-session-id>/`; verify equivalent canonical paths map consistently and distinct cwd/parent pairs do not collide.
- [x] 4.2 Create and open persistent child `SessionManager` instances in the resolved custom directory using stable child session IDs and Pi-native JSONL naming; verify child transcripts survive runtime disposal and process-level reopen.
- [x] 4.3 Add derived child metadata/indexing sufficient to locate sessions by parent and child ID without making it the identity source of truth; verify a missing or stale index can be rebuilt from JSONL headers and `arsenal-subagent` entries.
- [x] 4.4 Validate continuation ownership against the current parent session ID and reject children from other parents, including copied references in parent forks; verify resume and rename retain ownership while a forked parent receives a clear unsupported-import error.

## 5. Parent Persona Persistence and Switching

- [x] 5.1 Implement versioned `arsenal-parent-agent` entries for explicit `default`/`megamind` switches and restore the last physically recorded syntactically valid selection, falling back to configured `defaultAgent` when absent; verify selection is file-global across `/tree` branches.
- [x] 5.2 Fall back at runtime to Default without rewriting the saved preference when Megamind is ineligible because Multiverse is disabled or no subagent is available; verify the user is notified and the preference returns when eligibility is restored.
- [x] 5.3 Build the Megamind prompt dynamically from only enabled, successfully loaded subagents and append it once to the parent host prompt through `before_agent_start`; verify host/extension content survives, disabled agents are absent, and turns do not accumulate copies.
- [x] 5.4 Toggle the spawn tool and Megamind prompt together from the next turn when parent selection changes; verify the running turn remains on its starting persona and Default has neither contribution.
- [ ] 5.5 Reject parent-agent switching in child sessions and ignore any parent-agent entries found there; verify child prompt, tools, and identity remain unchanged after attempted switches.
- [ ] 5.6 Replace the empty Megamind development placeholder last with a non-empty maintainer-approved prompt; until approval, keep Megamind ineligible while testing dynamic roster assembly with fixture content rather than inventing a production prompt.

## 6. Model and Child Runtime Construction

- [x] 6.1 Implement ordered model candidate resolution that prefers configured subagent provider/model and falls back to the current parent model, accumulating lookup and authentication failures; verify configured, fallback, keyless/header-auth, and total-failure cases.
- [x] 6.2 Clamp requested reasoning to the selected model's supported levels and pass the resolved model/reasoning into child creation; verify unsupported high levels reduce rather than failing.
- [x] 6.3 Construct a fresh child resource loader and AgentSession per interaction while rediscovering the user's current extensions, including pi-arsenal and extension-provided model providers; verify extension instances are fresh and provider-backed models remain resolvable.
- [x] 6.4 Hydrate an existing child from its persistent SessionManager and selected checkpoint, run one prompt, capture its final response and leaf, then unsubscribe and dispose on success, failure, and abort; verify no runtime remains resident after settlement while later continuation retains context.

## 7. Branch-Aware Child References and Admission

- [x] 7.1 Define result-detail types that record interaction ID, child session ID, checkpoint before/after, agent, and parent correlation; verify they serialize into normal branch-scoped parent tool-result details.
- [x] 7.2 Resolve a continued child from the latest valid reference to that child in tool results on the active parent branch, validate that its entry exists and builds context, and branch the child SessionManager there before prompting; verify alternate parent branches create alternate child paths.
- [x] 7.3 Treat an aborted interaction's newest valid persisted entry as its checkpoint, or retain the prior checkpoint when no new valid entry exists; verify both abort timings and subsequent continuation context.
- [x] 7.4 Reject continuation when the active parent branch has no usable reference, including children created only on an abandoned branch; verify the child file remains intact and no implicit cross-branch import occurs.
- [x] 7.5 Add per-child managed admission so only one Multiverse runtime can hydrate a child at a time and preflight rejects duplicate child IDs within one batch; verify concurrent attempts never create two managed writers.

## 8. Batch Tool and Scheduler

- [x] 8.1 Define the strict batch schema with shared context and explicit `create` or `continue` task variants plus optional names; verify empty arrays, mixed/ambiguous variants, unknown agents, bad IDs, duplicate continuations, and ownership failures reject before dispatch.
- [x] 8.2 Register the tool once and admit calls only from eligible Megamind parent sessions, passing shared context plus task-specific text to every child interaction; verify Default, disabled Multiverse, no-roster, and child sessions cannot call it.
- [x] 8.3 Implement a batch-local semaphore using resolved `maxConcurrency`, with one shared pool across create/continue and all subagent types and prompt slot refill; verify instrumented tests never exceed capacity and queued tasks start as slots release.
- [x] 8.4 Implement all-settled execution that isolates task failures, waits for every terminal task, and restores input ordering; verify mixed outcomes, all failures, and out-of-order completion return one ordered entry per input.
- [x] 8.5 Propagate the tool AbortSignal to running sessions, prevent queued starts, preserve completed entries, and return ordered aborted entries after dispatch; verify every hydrated runtime is disposed and every created child remains persisted.

## 9. Observation, Results, and Output Bounds

- [x] 9.1 Subscribe to child tool-execution events and collect per-interaction paths for recognized file-modifying tools without trusting child text; verify file tools are observed, shell writes are explicitly absent, and task sets are never compared for conflicts. Superseded by §13 (D14): file-touch observation is removed entirely rather than kept as a partial signal.
- [x] 9.2 Aggregate subscription events into pending/running/current-tool/terminal progress updates through `onUpdate`; verify a blocking multi-task call emits stable per-task progress without leaking child conversation messages into parent history.
- [x] 9.3 Build an unforgeable system result envelope containing IDs, agent/name, status, latest valid checkpoint, observed paths, error, truncation metadata, and successful verbatim body; verify arbitrary markup and forged delimiter text cannot break neighboring entries. Superseded by §13 (D13/D14): the envelope field set is reduced to agent, childSessionId, status, sparse error, and sparse truncation.
- [x] 9.4 Choose named line/byte cap constants, cap oversized model-facing bodies, and provide the absolute child session file plus checkpoint as the complete-output reference; verify truncation preserves success/failure status and the referenced output is recoverable. Superseded by §13 (D16): the reference points at continuing the child session, not a session-file path, and the threshold becomes a circuit breaker.
- [x] 9.5 Keep model-facing content free of model name, duration, requests, tokens, and cost while placing that telemetry in result details; verify content/details snapshots enforce the split. Extended by §13 (D13): checkpoints and interaction IDs are also excluded from model-facing content.

## 10. Durable Batch Manifest

- [x] 10.1 Define a versioned hidden manifest containing batch outcome, input order, per-task child references/checkpoints, terminal states, observed paths, model, duration, requests, usage, and errors; verify the shape can reconstruct completed and aborted runs. Superseded by §13 (D14): the manifest drops `observedPaths` entirely rather than persisting it.
- [x] 10.2 Write exactly one manifest per spawn call on every post-dispatch terminal path and none on preflight rejection; verify completion, abort, partial creation failure, and manifest-write error handling do not double-write.
- [ ] 10.3 Leave the manifest outside model context and normal display by using an unrendered custom entry while keeping it discoverable through stored session entries; verify subsequent model context omits it and a parser can recover it. BLOCKED: `ExtensionContext.sessionManager` is a `ReadonlySessionManager`, so a tool cannot append a custom entry. The manifest currently rides in tool-result details; the durable-entry writer and recovery parser exist behind the optional `appendManifest` sink.

## 11. TUI Presentation

- [x] 11.1 Implement compact and expanded spawn rendering that identifies create/continue tasks by name or ID and agent while distinguishing pending, running, success, failure, and abort; verify renderer snapshots for mixed-result states. Narrow-width behaviour is line truncation only, not a bespoke TUI component.
- [x] 11.2 Render per-task output, child session ID/checkpoint, truncation link, observed paths, and user-only telemetry on expansion without exposing raw model-envelope markup; verify successful and failed layouts. Superseded by §13 (D14): drop observed paths from the rendered details; point users to the child session file instead.
- [x] 11.3 Keep direct child-session tmux viewing, live attachment, safe snapshots, leases, and a session-history modal out of V1; verify no UI action is advertised as attachment to a running SDK runtime.

## 12. Integration, Documentation, and Verification

- [x] 12.1 Register Multiverse alongside existing arsenal features without changing default behavior and add constants/config-provider plumbing; verify startup tests show no tool or prompt injection when disabled.
- [x] 12.2 Document configuration, durable storage location, create/continue semantics, rolling definitions, prompt replacement versus append behavior, branch ownership, and accepted V1 council/tool/shell/external-writer limitations; verify documented examples match the published schema and tool schema.
- [ ] 12.3 Add integration tests covering new-child creation, later continuation after runtime disposal, reopen role restoration, parent and child branching, Default/Megamind restoration, all-settled concurrency, abort, and manifest recovery. Orchestrator-level coverage now exercises create/continue, concurrency, isolation, abort, admission, and model failure against a stubbed runtime; a true end-to-end test that drives a real `AgentSession` is still missing.
- [x] 12.4 Run `bun test`, `bun run type-check`, `bun run biome`, and `bun run buildSchema`, then verify the working tree contains only intended source, prompt, schema, test, documentation, and generated-schema changes.

## 13. Envelope and Manifest Revision (Post-Design Update)

Supersedes the field sets built in 9.1, 9.3, 9.4, 9.5, 10.1, and 11.2, per design decisions D13, D14, and D16.

- [ ] 13.1 Remove `TouchLedger`, `FILE_MODIFYING_TOOL_NAMES`, and `observedPaths` entirely from `ChildInteraction`, the result envelope, tool details, the manifest, and the presenter; verify no file-touch data is collected, stored, or rendered anywhere, and that documentation points users to a child's own session file or the working tree instead.
- [ ] 13.2 Rework the model-facing result envelope so the tool's final `content` is exactly the frame below and nothing else. Read this literally; earlier attempts added fields that do not belong.

  ```
  Spawn results (2) · boundary a4f9c2

  --TASK_1_START-a4f9c2--
  agent: fixer
  childSessionId: 018f2c7a-1d3e-4b90-9c11-5a7e0b2d4f86
  status: success
  --TASK_1_RESPONSE-a4f9c2--
  <the child's final assistant message, verbatim and unmodified>
  --TASK_1_END-a4f9c2--

  --TASK_2_START-a4f9c2--
  agent: explorer
  childSessionId: 0192ab44-77c1-4de2-8f03-6b1c9d5e2a10
  status: failure
  error: Child "0192ab44" is not reachable on this branch; no usable reference exists here.
  --TASK_2_RESPONSE-a4f9c2--
  --TASK_2_END-a4f9c2--
  ```

  Rules, all of which must hold:
  - Header line once per call: `Spawn results (<taskCount>) · boundary <nonce>`.
  - `<nonce>` is randomly generated per spawn call, appears in every boundary of that call, and is never placed in any child's prompt or context.
  - Boundary task numbers are 1-based and follow input order. `taskIndex` in tool details stays 0-based; the envelope carries no numeric task field of its own.
  - Always present, in this order: `agent`, `childSessionId`, `status`. `status` is exactly `success`, `failure`, or `aborted`.
  - `error` appears only when the runtime failed to obtain a usable child response, and carries the runtime's message, never child prose.
  - The truncation notice appears only when the body was capped (see 13.3).
  - Everything between `--TASK_n_RESPONSE-<nonce>--` and `--TASK_n_END-<nonce>--` is the child's final message byte-for-byte, never reformatted, summarized, validated, or repaired.
  - Forbidden anywhere in model-facing content: `interactionId`, `name`, `taskIndex`, `checkpointBefore`, `checkpointAfter`, `observedPaths`, any file path, any session-file path, and all telemetry (model identity, duration, request counts, token counts, cost). These remain available in tool details and the manifest for the user.

  Verify with a snapshot test asserting the exact string for a mixed success/failure/aborted batch, and an assertion that no forbidden key appears in `content`.
- [ ] 13.4 Stop leaking progress into model context: `onUpdate` currently publishes the full progress render into model-facing `content` while sending `details` with an empty `interactions` array. Invert it so partial updates carry live progress in `details` and a single short static receipt line in `content`, and so the settled `content` is only the 13.2 envelope; verify partial and final content snapshots contain no per-task progress text.
- [ ] 13.3 Raise the output cap threshold to a value validated against real subagent output so it fires only on runaway output, point the truncation notice at continuing the child session rather than its session-file path, and insert an inline marker at the truncation cut point; verify the constant has one declared source instead of duplicating between `constants.ts` and `output-cap.ts`.

## 14. Live Spawn Tool Rendering

User-facing observability for a pending spawn call, per design decision D17. Rendering only; nothing here reaches model context.

- [ ] 14.1 Replace the per-call `Container` in `renderResult` with a stateful component reused across renders through `context.lastComponent`, following `P2pAskBatchResultComponent` in `src/extensions/p2p-council/tools/p2p-ask.tool.ts`; drive repaints from an internal spinner interval that starts only while a task is unsettled, stops on settle, and calls `unref()`; verify a child running one long tool call still advances its timer and spinner without emitting events.
- [ ] 14.2 Render the first frame from `context.args` before any child event arrives so every task row shows its agent, 1-based task number, and `new` or `resume` immediately; verify the tree appears at dispatch rather than after the first tool call.
- [ ] 14.3 Extend `SpawnProgress` with the state the view needs: per-task `startedAt`, tool-use counter, current tool name and summarized input, terminal outcome of the last tool call from `tool_execution_end.isError`, a capped tool trail, and an explicit phase of `queued`, `waiting`, `running`, `replied`, or `failed`; observe `agent_start`, `agent_end`, `tool_execution_start`, and `tool_execution_end` only. Verify `queued` (admitted but holding no concurrency slot, no timer) is distinct from `waiting` (started, no tool call yet, timer running).
- [ ] 14.4 Render the collapsed tree with two lines per task: `<connector> <agent> (<taskNumber>) · <new|resume> · <timer>` then `<count> tools · <symbol> <activity>`, where activity is `waiting`, a tool name plus summarized input, `replied`, or `failed`. Use a spinner while a tool call runs, `✓`/`✗` on its completion from `isError`, `↩ replied` on `agent_end`, and `✗ failed` on failure. Close with one footer line of counts. Verify start, mid-run, partially settled, and fully settled frames.
- [ ] 14.5 Render the expanded view as the capped tool trail, the task prompt, and per-task blocks carrying child session ID, checkpoints, and telemetry followed by the child response or error; verify the fields dropped from model context in 13.2 are all still visible to the user here, and that raw envelope boundary markup never appears.
- [ ] 14.6 Sanitize and bound every rendered line: strip ANSI from all child-derived strings with `dye.strip` before styling, pass every line through `truncateToWidth`, wrap multi-line bodies with `wrapTextWithAnsi` using explicit prefix-width math, and wrap the whole render in a fallback that degrades to plain text instead of throwing. Verify a child whose tool arguments contain escape sequences or over-width text cannot corrupt or crash the parent TUI.
- [ ] 14.7 Bound growth: add `maxItems` to the `tasks` array in `spawn.schema.ts`, cap the persisted tool trail per task and truncate each stored tool input at store time rather than render time, and cap visible rows with an overflow indicator; verify a large batch neither fills the editor nor grows parent session details without limit.
- [ ] 14.8 Move shared TUI primitives (spinner frames and interval, status symbols, tree connectors) into `src/libs/` so Multiverse and p2p-council share one source instead of Multiverse importing p2p-council internals; verify both tools render identical symbols. Use plain Unicode only, no Nerd Font glyphs, and confirm the active theme exposes `syntaxNumber` before using it for task numbers.
