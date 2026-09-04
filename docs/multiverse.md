# Multiverse

Multiverse adds durable parent-owned subagents `explorer`, `fixer`, and `visualizer`. Their definitions are loaded from `src/extensions/multiverse/agents/subagent-prompts/<name>.md` on every activation and intentionally roll forward for reopened sessions.

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
    }
  }
}
```

- `enabled`: disabled by default; marked existing child sessions remain recognizable.
- `defaultAgent`: `default` or `megamind`, restored by append-only `arsenal-parent-agent` entries.
- `maxConcurrency`: one batch-wide pool, `1..10`, default `5`.
- Nested global and trusted-project settings merge; invalid Multiverse settings disable only that feature.

## Durable children

New and continued children are ordinary Pi JSONL sessions beneath `~/.arsenal/subagent_sessions/<cwd-key>/<parent-session-id>`. Each gets one `arsenal-subagent` identity entry. Derived `index.json` is only a lookup cache and can be rebuilt from JSONL headers and markers.

Continuation resolves the latest valid child reference from branch-scoped parent tool-result details, validates ownership by the durable parent session ID, and branches the child from that checkpoint. Cross-parent import is rejected.

## Prompt and capability policy

A child prompt fully replaces the host prompt, appended files, CLI_prompt additions, and Megamind content. Tools are the current definition's exact list through `pi.setActiveTools()`, reapplied at `session_start` so the selection is in place before the first model turn. Skills filter ambient SDK resources for children created through the SDK, with empty meaning none.

## The `spawn` tool

`spawn` is registered once and is only callable from a parent session whose active persona is an eligible Megamind. Default parents, ineligible Megamind parents, and child sessions never receive it.

```json
{
  "context": "shared context for every task",
  "tasks": [
    { "action": "create", "agent": "fixer", "task": "implement narrowly", "name": "impl" },
    { "action": "continue", "childSessionId": "<id from an earlier spawn>", "task": "follow up" }
  ]
}
```

The call blocks until every task settles. All tasks share one concurrency pool sized by `maxConcurrency`, failures are isolated, and exactly one ordered entry is returned per input. One call carries at most 20 tasks.

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

Header fields are computed by the runtime; everything after the RESPONSE boundary is the child's own untrusted report, reproduced byte-for-byte. `error` appears only when the runtime failed to obtain a usable response, and a `truncated:` notice only when the body tripped the output cap; that notice directs you to continue the child session, never to a file path. Boundary numbers are 1-based.

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
- The parent persona switch is exposed as `selectParentAgent` on the activation; the user-facing command and shortcut that call it are added last.

The Megamind parent prompt is assembled at runtime in `src/extensions/multiverse/orchestrator/megamind-prompt.ts` from a maintainer-approved introduction plus the currently enabled roster; it stays ineligible while the introduction is empty.
