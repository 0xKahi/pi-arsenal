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

The call blocks until every task settles. All tasks share one concurrency pool sized by `maxConcurrency`, failures are isolated, and exactly one ordered entry is returned per input.

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

Multiverse reports no account of which files a child changed. All bundled subagents have `bash`, so any tool-argument ledger would silently miss shell-mediated writes and its empty result would be unsound. To see what a child did, read the child's own session file (which records every tool call) or inspect the working tree with `git status` / `git diff`.

## V1 limitations

- No mid-interaction steer/status/cancel/revive.
- No tmux child attachment, live SDK stream viewing, or cross-process writer lease.
- No second `tool_call` guard: an enabled council may still connect even if its tools are inactive.
- No file-touch reporting at all: use the child's session file or the working tree.
- Parent crashes may leave an interaction without a reference; it is preserved but not imported.
- The SDK exposes only a read-only session manager to tools, so the spawn manifest is carried in tool-result details rather than a separate hidden custom entry. `spawn-manifest-writer.ts` and `spawn-manifest-recovery.ts` implement the durable-entry form and are wired through the optional `appendManifest` sink for when a writable surface exists.

The Megamind parent prompt is assembled at runtime in `src/extensions/multiverse/orchestrator/megamind-prompt.ts` from a maintainer-approved introduction plus the currently enabled roster; it stays ineligible while the introduction is empty.
