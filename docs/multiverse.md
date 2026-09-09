# Multiverse

Multiverse adds durable parent-owned subagents, initially shipping `explorer`, `fixer`, and `visualizer`. Markdown files in `src/extensions/multiverse/agents/subagent-prompts/` are discovered and parsed once per extension instance. The registry uses each definition's declared string name, independent of filename; no bundled-name enum limits registration. Definitions intentionally roll forward on reload/reopen, not on each turn or spawn lookup.

## Configuration

```json
{
  "multiverse": {
    "enabled": true,
    "defaultAgent": "megamind",
    "maxConcurrency": 5,
    "subagents": {
      "explorer": { "enabled": true },
      "fixer": { "enabled": true },
      "visualizer": { "enabled": true }
    },
    "defaultPreset": "smart",
    "presets": {
      "smart": {
        "explorer": { "provider": "anthropic", "modelId": "claude-sonnet-4-5", "reasoning": "high" },
        "fixer": { "reasoning": "high" }
      },
      "cheap": {
        "explorer": { "modelId": "claude-haiku-4-5" }
      }
    }
  }
}
```

- `enabled`: disabled by default. While disabled, Multiverse adds no persona prompt or child tool restrictions and `spawn` cannot execute. Directly opening an existing marked child uses ordinary Pi behavior, subject to other active extensions. Markers remain stored and take effect again after enabling and reloading.
- `defaultAgent`: `default` or `megamind`, restored by append-only `arsenal-parent-agent` entries.
- `maxConcurrency`: one batch-wide pool, `1..10`, default `5`.
- `subagents`: settings keyed by registered agent name; names without settings default to enabled with parent-model fallback. Configuration alone does not register an agent.
- `defaultPreset`: optional name of the preset each session starts on. A name that matches no preset is not an error; the session simply starts on the built-in default.
- `presets`: optional map of preset name -> agent name -> partial model settings (`provider`, `modelId`, `reasoning`). Every field is optional, empty presets and empty agent entries are valid, and presets never register or enable an agent.
- Nested global and trusted-project settings merge by name; invalid Multiverse settings disable only that feature.

## Model presets

A preset is a named model lineup for the subagents. It is a convenience layer over `subagents.<agent>.model`, not a replacement for it.

### Field-level inheritance

Each field resolves independently:

```
selected preset field  ->  subagents.<agent>.model field  ->  current parent session value
```

In the example above, `smart` gives `fixer` only `"reasoning": "high"`. The fixer keeps whatever `provider` and `modelId` its subagent settings define, and if those are absent too, it inherits the parent session's model. An agent omitted from a preset (`visualizer`, in both presets above) behaves exactly as it does with no preset selected. The built-in default contributes no overrides at all, so switching back to it restores plain subagent behavior. Selecting a preset never rewrites configuration.

### Selection is session-local

Selection lives in memory for the current parent session only:

- Each session starts on `defaultPreset` when it names an existing preset, otherwise on the built-in default.
- Starting, reopening, or switching to another session, and reloading the extension, all re-initialize selection from configuration. A manual switch is never restored.
- Switching persona or navigating conversation branches inside the same live session does not reset the selected preset.
- If the selected preset is removed from configuration, resolution and the picker fall back to the built-in default.
- Nothing is written: no config file changes and no preference entry, unlike persona selection.

### When a switch takes effect

Each `spawn` call captures the active preset and the composed per-agent settings once, before dispatch:

- **Create and continue alike** use the capture of the call that dispatched them, so a continued child keeps its conversation checkpoint but runs the new interaction under the currently selected preset.
- **Already-dispatched batches are unaffected** by a later switch, including tasks still queued behind `maxConcurrency`. A switch applies from the next `spawn` call onward.

### Requested versus runtime model

The picker shows configured intent, not a guarantee. It performs no authentication or availability probe. At run time the effective configured model is tried first and the parent model remains the fallback, so an unavailable or unauthenticated preset model falls back to the parent model — a preset does not add a retry of the underlying subagent model. Likewise the reasoning shown is the *requested* level; runtime clamps it to what the model actually chosen supports. Because fields are inherited individually, a partial override can produce a provider/model pair that does not exist; the parent fallback covers it.

## Durable children

New and continued children are ordinary Pi JSONL sessions beneath `~/.arsenal/subagent_sessions/<cwd-key>/<parent-session-id>`. Each gets one `arsenal-subagent` identity entry. Derived `index.json` is only a lookup cache and can be rebuilt from JSONL headers and markers.

Continuation resolves the latest valid child reference from branch-scoped parent tool-result details, validates ownership by the durable parent session ID, and branches the child from that checkpoint. Cross-parent import is rejected.

## Prompt and capability policy

While enabled, a child prompt fully replaces the host prompt, appended files, CLI prompt additions, and Megamind content. At `session_start`, the registered subset of the definition's tools becomes active; undeclared tools are removed. Unknown tools produce a file-specific warning without disabling the agent. Duplicate tools and skills are silently deduplicated. Malformed YAML, missing required fields (`name`, `tools`, `skills`, `metadata`), and empty prompts still fail parsing.

Unknown skills are ignored in V1. Bundled definitions declare no skills and SDK children receive no ambient skills. Further skill support and directly reopened skill-command enforcement are deferred.

Availability is resolved at session start after arsenal config initialization. `before_agent_start` only applies the registered child prompt or builds/appends Megamind's prompt from the in-memory roster and current config; it does not reload files or mutate tools. Megamind roster entries contain names and authored metadata, not generated tool lists or child prompt bodies.

## The `/multiverse` command

When Multiverse is enabled, `/multiverse` and its Pi Vim key event open the same Vim-navigable modal with three tabs: **Switch Agents**, **Presets**, and **Child Sessions**.

The **Switch Agents** tab selects Default or Megamind and starts on the currently active persona. A successful selection is persisted in an `arsenal-parent-agent` entry, updates the displayed agent name, and applies the matching prompt/tool policy to the next turn. In a child session both choices are visibly disabled. The **Child Sessions** tab is a coming-soon placeholder.

The **Presets** tab lists the built-in `[default]` first, then every configured preset, grouped with one preview row per available registered agent:

```
  [default]
    explorer: claude-sonnet-4-5 (anthropic) / requested reasoning: low
    fixer: inherits parent model (inherits parent provider) / requested reasoning: off

> [smart] (active)
    explorer: claude-sonnet-4-5 (anthropic) / requested reasoning: high
    fixer: inherits parent model (inherits parent provider) / requested reasoning: high
```

The effective selection is marked `(active)` and focused when the tab opens. Rows show the values after field inheritance; unresolved fields say `inherits parent …` rather than inventing a value. Only available registered agents appear — a preset naming a disabled or unregistered agent adds no row and no spawn target — and an empty roster shows `No available agents.` instead of fabricated entries. A configured preset literally named `default` stays selectable and is distinguished as `[default] (configured)` from the built-in `[default] (built-in)`.

Controls follow the rest of the modal: `Tab`/`Shift+Tab` cycle tabs, `j`/`k` (and page/first/last motions) move between presets, `Enter` activates the focused preset and closes the modal, `Esc` cancels and leaves the selection unchanged. When a preset's agent rows exceed the viewport, scrolling reaches every row. Preset switching is disabled in child sessions, where confirmation has no effect: the tab controls what the parent dispatches, not the current child's own model. Switching a preset changes no persona, parent model, or agent availability.

The command and key-event handler are activated only after enabled configuration is resolved at `session_start`; disabled Multiverse does not expose them.

## The `spawn` tool

`spawn` is registered once and is only callable from a parent session whose active persona is an eligible Megamind. Default parents, ineligible Megamind parents, and child sessions never receive it.

```json
{
  "context": "shared context for every task",
  "tasks": [
    { "action": "create", "agent": "fixer", "task": "implement narrowly" },
    { "action": "continue", "childSessionId": "<id from an earlier spawn>", "task": "follow up" }
  ]
}
```

The call blocks until every task settles. All tasks share one concurrency pool sized by `maxConcurrency`, failures are isolated, and exactly one ordered entry is returned per input. One call carries at most 10 tasks.

Model-facing content is exactly a header line plus one frame per task, bounded by a per-call random nonce that is never disclosed to a child, so child output can never forge or terminate a neighbouring frame:

```
Spawn results (1) · boundary a4f9c2

--TASK_1_START-a4f9c2--
agent: fixer
childSessionId: 018f2c7a-1d3e-4b90-9c11-5a7e0b2d4f86
status: success
--TASK_1_RESPONSE-a4f9c2--
<the child's final assistant message, verbatim>
--TASK_1_END-a4f9c2--
```

Header fields are computed by the runtime; everything after the RESPONSE boundary is the child's own untrusted report, reproduced byte-for-byte. `error` appears only when the runtime failed to obtain a usable response, and a `truncated:` notice only when the body tripped the output cap. The cap is a circuit breaker sized far above any legitimate report (20,000 lines / 256 KB), so tripping it means a child looped or dumped a file; the notice states the cut and proposes no remedy, because re-running a child that ignored its conciseness instructions tends to reproduce the same output. Boundary numbers are 1-based.

Every task produces one `ChildInteraction` in the tool-result details: interaction ID, task index, agent, status, child session ID and file, before/after checkpoints, truncation size, and user-only telemetry. Continuation reads exactly that record from the active parent branch.

Model-facing content deliberately excludes interaction IDs, task names and indices, checkpoints, file and session-file paths, model name, duration, request counts, tokens, and cost; those live in details, the manifest, and the expanded TUI view only. While a call is pending, partial updates carry only a fixed receipt line in model-facing content and keep live progress in details.

### What you see while it runs

The tool row is live. From the moment the call is dispatched, each task renders two lines:

```
├─ fixer (1) · new · 12.4s
│    3 tools · ⠹ bash bun test
└─ explorer (2) · resume · —
     0 tools · ○ queued
↩ 1 replied · 1 running
```

The first line carries the subagent, its 1-based task number, whether it started a new child or resumed one, and elapsed time. The second carries the observed tool-use count and current activity: `queued` (admitted but holding no concurrency slot, so no timer runs), `waiting` (started, no tool call yet), a running tool call with its name and a summarized input, or a terminal `↩ replied` / `✗ failed`. A finished tool call shows `✓` or `✗` from its own error flag. The row repaints on its own timer, so a child sitting inside one long shell command still shows motion.

Expanding a settled row shows, per task, the recorded activity trail, the task prompt, the child session ID, checkpoints, telemetry, and the child's response or error — everything deliberately kept out of model context. Envelope boundary markup is never shown.

This display is observed activity, not an account of record: it makes no completeness claim, tool outputs are never recorded, and the trail is capped. For what a child actually did, read its session file or the working tree.

All child-authored text reaching the renderer, including tool arguments the child chose, is stripped of ANSI and control characters and width-bounded before it is styled. This is the terminal-side counterpart of the envelope's boundary nonce.

### The run manifest

Every dispatched batch also appends exactly one `arsenal-spawn-manifest` custom entry to the parent session (none when the call is rejected before dispatch). Custom entries never enter model context, and no renderer is registered for this type, so it stays invisible in the transcript while remaining recoverable from the session JSONL via `recoverSpawnManifests`.

The manifest holds **references, not content**: batch outcome and counts, the input task list, and per task the child session ID, subagent, terminal status, checkpoints, error, and telemetry. It never copies a child's response body — that lives uncapped in the child's own session, reachable by the ID the manifest records. A task that failed before any child existed is still recorded, with its input and error.

Multiverse reports no account of which files a child changed. All bundled subagents have `bash`, so any tool-argument ledger would silently miss shell-mediated writes and its empty result would be unsound. To see what a child did, read the child's own session file (which records every tool call) or inspect the working tree with `git status` / `git diff`.

## V1 limitations

- No mid-interaction steer/status/cancel/revive.
- No tmux child attachment, live SDK stream viewing, or cross-process writer lease.
- No second `tool_call` guard: an enabled council may still connect even if its tools are inactive.
- No file-touch reporting at all: use the child's session file or the working tree.
- Parent crashes may leave an interaction without a reference; it is preserved but not imported.
- The Child Sessions modal tab is a placeholder; browsing or attaching to child sessions remains future work.

The approved Megamind content and builder live together in `src/extensions/multiverse/orchestrator/orchestrator-prompts/megamind.ts`. Megamind eligibility depends on enabled Multiverse and an available registered roster, not an introduction placeholder. Spawn execution reads the current model, thinking level, config, and active parent branch while reusing registry lookups.
