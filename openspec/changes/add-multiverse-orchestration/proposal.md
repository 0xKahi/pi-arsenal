## Why

pi-arsenal currently offers peer federation through `p2p_council`, but no hierarchical model in which a parent owns subordinate conversations. Parallel investigation and bounded implementation therefore consume the main agent's context or require unrelated peers.

Multiverse adds durable subordinate sessions: a parent can create several specialized children concurrently, receive ordered results, and later continue any child conversation with its prior context.

## What Changes

- Add a disabled-by-default `multiverse` extension under `src/extensions/multiverse/`.
- Add a blocking batch tool whose ordered tasks can either create a child session for a named subagent or continue an existing child session.
- Persist every child as a normal Pi JSONL session under `~/.arsenal/subagent_sessions/`, grouped by working directory and parent session ID. Return the durable child session ID to the parent model after each interaction, and record the latest valid branch checkpoint, when one exists, in tool presentation details and the durable manifest rather than in model context.
- Give every child session one immutable `arsenal-subagent` custom entry naming its subagent and parent session. On any later SDK or CLI reopen, pi-arsenal uses that identity to apply the current definition for that subagent.
- Hydrate a child `AgentSession` only while processing an interaction. The logical child and its transcript remain durable after the runtime is disposed.
- Before finishing V1, clean up definition parsing, registration, activation, prompt construction, and tool handling. Load definitions once per extension instance, resolve configuration-dependent availability at session start, and reuse resolved state during turns and spawn calls; execution-time model and branch context remain current.
- Before finishing V1, consolidate the extension's structure without changing behavior: fold single-consumer runtime, result, and manifest fragments into classes with clear responsibilities (`ChildSessionRepository`, `ChildRuntime`, `SpawnManifest`), reuse the existing atomic-write utility instead of a duplicate implementation, and collapse the test files that mirrored the removed modules. No wire format, durable layout, prompt content, or rendering changes.
- Use string subagent names throughout, with the registry as the authority rather than a bundled-name enum. Discover definition paths without hardcoded names, and accept/merge per-agent configuration by string key; settings alone never register an agent.
- Treat duplicate tools and skills as normalization, warn about unknown tools without rejecting an agent, and ignore unknown skills in V1. Malformed definitions still produce file-specific errors.
- Make disabling Multiverse disable all its role and orchestration behavior. A persisted child opened directly while disabled runs as ordinary Pi; its marker is retained for future enabled activation.
- Keep child conversations branch-aware: the active parent branch selects the most recent child checkpoint it references, and a later interaction branches the child from that checkpoint.
- Continue loading the user's current extensions in child runtimes. Subagent prompts fully replace the host prompt; their current tool allowlists remove undeclared registered tools. Skill support is deferred beyond V1; bundled definitions declare no skills. V1 uses `pi.setActiveTools()` as its sole tool-protection layer.
- Ship three initial bundled subagents, `explorer`, `fixer`, and `visualizer`, declared as markdown with YAML frontmatter and sourced from the maintainer's LLW Multiverse bundle. Their initial definitions declare no skills. Their current prompt bodies and tool lists apply when old sessions are reopened with Multiverse enabled; definitions are intentionally rolling across activations rather than snapshotted in session files.
- Add a `megamind` parent persona whose orchestration prompt is built from the in-memory roster before each agent run and appended to the host prompt. Restore the last recorded `arsenal-parent-agent` preference, or the configured default. Explicit switching and pending-persona handling are deferred to the future Pi command; this cleanup does not expose a switch callback.
- Bound each batch with one batch-wide `maxConcurrency` pool (default `5`, maximum `10`) and all-settled failure semantics.
- Compute a structured result frame around each child's verbatim final response, carrying only fields the parent model can act on and did not itself supply: subagent name, child session ID, status, error, and a truncation notice pointing at the child session for more detail. Branch checkpoints and telemetry remain in presentation details and the durable manifest rather than model context; file-touch data is not collected at all.
- Append one invisible manifest for every dispatched batch, including aborted batches, carrying child references rather than a duplicate copy of child output.

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
- **Compatibility**: additive and disabled by default. Existing parent sessions without agent-selection entries use configured defaults. While enabled, old durable children adopt current definitions when reopened. While disabled, persisted child markers impose no prompt or tool restrictions; unrelated arsenal sub-extensions retain their normal behavior.
