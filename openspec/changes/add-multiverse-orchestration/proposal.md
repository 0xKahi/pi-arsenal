## Why

pi-arsenal currently offers peer federation through `p2p_council`, but no hierarchical model in which a parent owns subordinate conversations. Parallel investigation and bounded implementation therefore consume the main agent's context or require unrelated peers.

Multiverse adds durable subordinate sessions: a parent can create several specialized children concurrently, receive ordered results, and later continue any child conversation with its prior context.

## What Changes

- Add a disabled-by-default `multiverse` extension under `src/extensions/multiverse/`.
- Add a blocking batch tool whose ordered tasks can either create a child session for a named subagent or continue an existing child session.
- Persist every child as a normal Pi JSONL session under `~/.arsenal/subagent_sessions/`, grouped by working directory and parent session ID. Return the durable child session ID and latest valid branch checkpoint after each interaction when one exists.
- Give every child session one immutable `arsenal-subagent` custom entry naming its subagent and parent session. On any later SDK or CLI reopen, pi-arsenal uses that identity to apply the current definition for that subagent.
- Hydrate a child `AgentSession` only while processing an interaction. The logical child and its transcript remain durable after the runtime is disposed.
- Keep child conversations branch-aware: the active parent branch selects the most recent child checkpoint it references, and a later interaction branches the child from that checkpoint.
- Continue loading the user's current extensions in child runtimes. Subagent prompts fully replace the host prompt; their current tool and skill allowlists remove undeclared capabilities. V1 uses `pi.setActiveTools()` as its sole tool-protection layer.
- Ship exactly three bundled subagents, `explorer`, `fixer`, and `visualizer`, declared as markdown with YAML frontmatter and sourced from the maintainer's LLW Multiverse bundle. Their initial definitions declare no skills. Their current prompt bodies, tool lists, and skill lists apply when old sessions are reopened; definitions are intentionally rolling rather than snapshotted.
- Add a `megamind` parent persona whose dynamic orchestration prompt is appended to the host prompt. Parent sessions record append-only `arsenal-parent-agent` entries when switching between `default` and `megamind`; the last recorded selection is restored. Parent-agent switching is unavailable inside child sessions.
- Bound each batch with one batch-wide `maxConcurrency` pool (default `5`, maximum `10`) and all-settled failure semantics.
- Compute a structured result frame around each child's verbatim final response, carrying only fields the parent model can act on and did not itself supply: subagent name, child session ID, status, error, and a truncation notice pointing at the child session for more detail. Branch checkpoints and telemetry remain in presentation details and the durable manifest rather than model context; file-touch data is not collected at all.
- Append one invisible manifest for every dispatched batch, including aborted batches.

V1 deliberately does not provide background dispatch, mid-interaction steering, persistent resident child processes, automatic tmux attachment, worktree isolation, enforced write scopes, cross-process writer leases, a second `tool_call` capability gate, snapshot-pinned prompts, or a child-session history modal. Because all user extensions continue loading and no special council activation guard is added in V1, a child may connect to an enabled council even when its active tool set excludes council tools.

## Capabilities

### New Capabilities

- `multiverse-config`: Enablement, default parent persona, global concurrency, and per-subagent enablement/model settings.
- `multiverse-agents`: Rolling subagent definitions, durable child identity, full prompt replacement, and current tool/skill allowlists.
- `multiverse-orchestrator`: Dynamic appended Megamind prompt, persisted parent-agent switching, roster reflection, and child-session switching guards.
- `multiverse-tools`: Blocking batch creation and continuation of child sessions, ordered all-settled results, progress, and result rendering.
- `multiverse-runtime`: Durable child storage, branch-aware hydration, concurrency and writer rules, extension loading, model resolution, abort, output capping, and manifests.

### Modified Capabilities

None. Existing `p2p-council-*` and `tmux-popup` capabilities remain unchanged; V1 does not modify council activation behavior for children.

## Impact

- **New code**: `src/extensions/multiverse/`, `src/schemas/multiverse.config.schema.ts`, and bundled definitions under `src/extensions/multiverse/subagent-prompts/`.
- **Modified code**: `src/schemas/config.schema.ts`, root extension registration, and regenerated `assets/config.schema.json`.
- **Persistent data**: child Pi sessions and derived discovery metadata under `~/.arsenal/subagent_sessions/`; parent and child custom session entries identify roles and runs.
- **SDK surface**: `createAgentSession`, persistent `SessionManager`, `DefaultResourceLoader`, `AgentSession.prompt/subscribe/abort/dispose`, model registry APIs, `pi.setActiveTools`, `pi.appendEntry`, and `before_agent_start`.
- **Behavioral cost**: multiple child model requests use the user's credentials. Concurrent fixers share one working directory and may race on the same file; Multiverse does not observe or report file touches, so diagnosing a collision relies on inspecting the working tree or a child's session file directly.
- **Compatibility**: additive and disabled by default. Existing parent sessions without agent-selection entries use configured defaults; old durable children intentionally adopt current subagent definitions when reopened.
