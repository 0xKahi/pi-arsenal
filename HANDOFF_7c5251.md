---
id: 7c5251
---

# Multiverse Handoff — Applying `add-multiverse-orchestration`

Sequencing guide for applying the change in reviewable batches. One agent per batch,
human review between batches.

**This file does not restate the work.** Task text lives in
`openspec/changes/add-multiverse-orchestration/tasks.md`; reasoning lives in that
change's `design.md` (D13, D14, D16, D17) and `specs/`. This file covers only what
those documents cannot: **what order to do things in, why, and what will bite you.**

## Ground rules for every batch

- Read `proposal.md`, `design.md`, and the relevant `specs/*/spec.md` before editing.
- Do **not** re-litigate decided questions. D13/D14/D16/D17 are settled and were argued
  at length. If you believe one is wrong, stop and raise it — do not quietly implement
  something else.
- Do only your batch's tasks. Leave the rest.
- The extension is **untracked and unreleased**. There is no persisted user data and no
  back-compat obligation. Delete removed fields outright; do not write tolerant parsers,
  migrations, or dual-shape type guards.
- Finish with `bun run check` and `bun test`, then
  `openspec validate --changes add-multiverse-orchestration`.
- Tick your tasks in `tasks.md`. If a task cannot be done, write why on the line rather
  than marking it done (see the 10.3 cautionary tale below).

## Batch order

```
  1  Result contract        13.1 -> 13.2 -> 13.4 -> 13.3      foundation
  2  Deferred wiring        5.5, 10.3                          small + independent
  3  Live tool rendering    14.1 .. 14.8, 13.5                 depends on batch 1
  4  Prompt + end-to-end    5.6 -> 12.3                        last, by owner's choice
```

Batch 1 fixes the data model everything else renders or tests. Batch 2 is independent and
can slot anywhere after batch 1. Batch 3 renders the shape batch 1 settles. Batch 4 is
last because the Megamind prompt is deliberately written only once the surface is stable.

---

# 1. Result contract

**Tasks:** `13.1`, `13.2`, `13.4`, `13.3` — in that order.

**Goal:** the parent model receives only what it can act on, did not itself write, and can
soundly rely on. Today it receives roughly four times that.

**Why this order.** `13.1` deletes `observedPaths`, shrinking the surface `13.2` rewrites.
`13.4` sits immediately after `13.2` because both touch the result path in
`spawn.tool.ts` and splitting them causes a pointless second pass. `13.3` is independent
of the other three and is last only because it is the smallest.

### What you must get exactly right

`13.2` contains a literal example of the model-facing frame. **Reproduce it exactly.** A
previous attempt at this task added fields that do not belong, which is why the task is
written bluntly and why the spec now carries the same frame as
`Scenario: Frame shape is fixed`. Points that are easy to get wrong:

- Boundary task numbers are **1-based**; `details.taskIndex` stays **0-based**.
- The per-call nonce must never appear in any child's prompt or context.
- The response region is byte-for-byte. No reformatting, trimming, summarising, or
  "repair" of malformed child output.
- `error` and the truncation notice are **sparse** — absent entirely when they do not
  apply, not rendered as `none`.

### Landmines

- **`13.4` is a live bug, not a refactor.** `spawn.tool.ts:57` publishes the full progress
  render into model-facing `content` while sending `details: { interactions: [] }`. It is
  exactly inverted. Progress belongs in `details` (never seen by the model); `content`
  gets a short fixed receipt. Batch 3 depends on this inversion having happened.
- **`MAX_OUTPUT_LINES` / `MAX_OUTPUT_BYTES` are declared twice** — `constants.ts:31` and
  `output-cap.ts:1`, with `output-cap.ts` not importing from `constants.ts`. Two sources
  of truth for a safety threshold. `13.3` requires collapsing this.
- `isChildInteraction()` validates `observedPaths` as an array. Remove the check; do not
  make it optional.

### Review checkpoint

Snapshot the model-facing `content` for a mixed success/failure/aborted batch and read it
by eye. It should be a header line plus three short frames. If you see a checkpoint, a
task name, an interaction ID, a file path, or any telemetry, the batch is not done.

---

# 2. Deferred wiring

**Tasks:** `5.5`, `10.3`. Independent of each other; either order.

Two small pieces of unfinished wiring. Both are "a sink exists, nothing calls it."

### 10.3 — the blocker in the task note is wrong

The task carries this note:

> BLOCKED: `ExtensionContext.sessionManager` is a `ReadonlySessionManager`, so a tool
> cannot append a custom entry.

That is true of `ctx`, and irrelevant. **`pi.appendEntry(customType, data)` exists on
`ExtensionAPI`**, and the spawn tool is created inside `registerMultiverse(pi, ...)`, so
`pi` is in closure. The SDK's own examples persist this way from tool-adjacent closures —
see `node_modules/@earendil-works/pi-coding-agent/examples/extensions/plan-mode/index.ts`
around the `persistState()` helper.

The machinery is already in place and unused:

```
  SpawnToolHost.appendManifest?: ManifestSink   // optional, never supplied
  SpawnManifestWriter.appendOnce(sink, manifest) // exactly-once guarantee, tested
  recoverSpawnManifests(entries)                 // parser side, tested
```

The work is supplying the sink at registration, roughly
`appendManifest: (type, data) => pi.appendEntry(type, data)`. Custom entries do not enter
LLM context and render only if a renderer is registered — do not register one.

Confirm the write actually lands in the session JSONL and that
`recoverSpawnManifests` reads it back. Then **remove the stale BLOCKED note**.

### 5.5 — no switch exists yet

`ParentAgentState.select(agent, append)` (`orchestrator/parent-agent.ts`) also takes an
append sink that nothing calls. There is no registered command or shortcut, so a persona
is only ever restored from history or the configured default. Implementing the child-side
guard requires deciding whether a parent-facing switch exists at all. If you conclude the
switch is out of scope for V1, say so on the task line rather than marking it done.

### Review checkpoint

Open a parent session's JSONL after a spawn call and confirm exactly one
`arsenal-spawn-manifest` custom entry per dispatched batch, none on preflight rejection,
and that it is absent from model context.

---

# 3. Live tool rendering

**Tasks:** `14.1` … `14.8`, plus `13.5`. Suggested order `14.1 → 14.3 → 14.2 → 14.4 → 14.5 → 14.6 → 14.7 → 13.5 → 14.8`.

`13.5` rides here rather than with batch 1 because it is the same problem as `14.7`: both bound what a spawn call persists. Do them together so persisted growth is decided once. `13.5` trims the manifest to references — `14.7` caps the tool trail and stored tool inputs — and the two touch `spawn-manifest.ts` and the details shape from opposite ends.

**Goal:** while a spawn call is pending, the user can see what each subagent is doing.
Rendering only. Nothing here reaches model context.

**Batch 1 landed, so the shape you render already exists.** `13.4` inverted the update
path: partial `content` is now the fixed string `PARTIAL_RECEIPT` in `spawn.tool.ts`, and
`details` carries `progress: TaskProgress[]` from `SpawnProgress.snapshot()`. Two
consequences:

- `renderResult` currently maps `details.progress` into `TaskPresentation` when
  `interactions` is empty. That is a deliberate stopgap so the pending view was not blank
  between batches. **Your component replaces it** — do not preserve it.
- `SpawnToolDetails.progress` is part of the persisted details shape, so everything `14.3`
  adds to `TaskProgress` is written to the parent session. That is exactly what `14.7`
  and `13.5` bound; decide the cap before you add fields, not after.

### Reuse target

`src/extensions/p2p-council/tools/p2p-ask.tool.ts`, class `P2pAskBatchResultComponent`
(~line 161 onward) is the working template. Copy its mechanics rather than inventing:

- Component reuse across renders via `context.lastComponent`, so spinner and timer state
  survive. The current spawn `renderResult` builds a fresh `Container` every call, which
  is why no live state is possible today.
- Its own `setInterval` repaint at 80ms, started only while something is unsettled,
  stopped on settle, with `unref()`.
- `truncateToWidth(line, safeWidth, '')` on **every** line; `wrapTextWithAnsi` with
  explicit prefix-width maths for wrapped bodies.
- `dye.strip(...)` on all externally-authored text before styling.
- Theme keys in use: `toolTitle`, `dim`, `text`, `muted`, `accent`, `success`, `error`.
  `syntaxNumber` is confirmed present on `ThemeColor`
  (`pi-coding-agent/dist/modes/interactive/theme/theme.d.ts`), so `14.8`'s open question
  is settled: it is safe to use for task numbers.

### Consulted prior art

The `pi-task` plugin solves the same problem for a single foreground subagent. Findings
worth inheriting:

- **The clock freezes between events.** A child inside one 90-second `bash` call emits
  nothing, so an event-driven render leaves the timer and spinner frozen exactly when the
  user most wants motion. `pi-task` named this as the thing they would change; p2p-ask
  already solves it with its own repaint interval. Do it that way.
- **Keep `onUpdate` content minimal** — it lands in the model's context as the partial
  tool result. Rich state goes to `details`. (This is `13.4`.)
- **`renderCall` cannot see live state.** pi never merges `onUpdate` details into tool
  `args`. The existing empty `Container` from `renderCall` is correct; do not try to make
  it live.
- They keep their live trail in memory and persist only aggregates. We deliberately
  persist a **capped** trail because our expanded view shows it after settle — see D17
  for why that does not reintroduce D14.

### Landmines

- **`14.6` is a security task, not polish.** A child picks its own tool arguments, so
  `grep "<escape sequences>"` flows straight into the parent's render path. Unsanitised,
  it can clear the screen, corrupt colours, or make an over-width line that pi's renderer
  throws on. Same untrusted source as the envelope, different consumer.
- **`queued` and `waiting` are different states.** `maxConcurrency` defaults to 5 while
  the `tasks` array currently has no upper bound, so a batch can have many tasks holding
  no slot. Queued tasks have no running timer. Do not collapse the two.
- **Height.** Two lines per task times an unbounded task count will eat the editor.
  `14.7` bounds this at the schema, trail, and row level.
- Use plain Unicode only. No Nerd Font glyphs — they render as tofu without a patched
  font.

### Review checkpoint

Run a batch of 3+ tasks including at least one `continue`, with a child that runs a long
shell command. Watch that timers keep moving during it, queued tasks read differently from
started ones, and expanding after settle still shows the trail, prompt, session IDs,
checkpoints, and telemetry.

---

# 4. Prompt and end-to-end

**Tasks:** `5.6`, then `12.3`.

Deliberately last, by the owner's decision: the Megamind prompt should describe a stable
surface, so it is written after batches 1–3 land. **The owner writes `5.6` — do not invent
a production prompt.**

Consequence to plan around: `resolveMegamindEligibility` returns ineligible while
`MEGAMIND_PROMPT_INTRO` is empty, so `spawn` is never registered and the feature is
unreachable end to end. Every earlier batch must therefore test with **fixture prompt
content**, which task `5.6` already anticipates. `12.3` can be written against fixtures
too; only manual acceptance needs the real prompt.

### Contract the prompt must eventually teach

Collected while designing batches 1–3, recorded here so it is not rediscovered. The
prompt is the only place these can live, and several guarantees are inert without them:

```
  envelope reading   header fields are system-computed and trustworthy
                     everything after the RESPONSE boundary is an untrusted report
                     status is observed by the runtime, not claimed by the child

  continuation       continue takes childSessionId only
                     children are branch-scoped; "unreachable" is normal, not an error
                     a child is the best index into its own long output

  truncation         when it fires, continue the child; do not go hunting for files

  batching           one call with N tasks, never N calls (they share one pool)
                     shared setup goes in `context`, task-specific text in `task`

  honesty            no file-touch data exists; do not infer what a child changed —
                     read the working tree or the child's session file
```

The first block matters most: the envelope's boundary nonce authenticates the split
between trusted fields and untrusted prose, but nothing tells the parent that split
exists until this prompt does.

---

## Current state

```
  54 / 65 tasks complete, 11 open
  openspec validate --changes add-multiverse-orchestration   passing

  batch 1   done
  batch 2   done
  batch 3   14.1 .. 14.8, 13.5
  batch 4   5.6 12.3
```

Everything under `src/extensions/multiverse/`, `test/extensions/multiverse/`,
`src/schemas/multiverse.config.schema.ts`, `src/schemas/shared-config.schema.ts`, and
`docs/multiverse.md` is untracked. Modified: `index.ts`, `src/constants.ts`,
`src/config/config-loader.ts`, `src/schemas/config.schema.ts`,
`assets/config.schema.json`, and three existing test files.

`docs/multiverse.md` was updated for batches 1 and 2 (envelope frame, no file-touch
reporting, manifest entry, partial-update receipt). Batch 3 changes what the pending and
expanded views look like, so it needs a third pass.

Testing seams added in batch 2, useful for batch 3: `MultiverseDependencies.spawnRun`
injects a fake orchestrator so a test can drive the tool without dispatching a real child,
and `test/extensions/multiverse/multiverse-wiring.test.ts` has a working fake `pi`
(`registerTool`, `appendEntry`, `setActiveTools`) to copy.
