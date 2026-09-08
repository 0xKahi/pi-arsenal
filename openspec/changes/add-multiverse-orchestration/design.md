## Context

See `proposal.md` for motivation. Multiverse must build hierarchical delegation from Pi's public SDK while preserving Pi-native sessions and the user's extension environment.

`createAgentSession()` accepts a persistent `SessionManager`, custom `DefaultResourceLoader`, model, tools, and an event subscription. An `AgentSession` exposes `prompt`, `abort`, `dispose`, `sessionId`, and session messages. `SessionManager.create(cwd, sessionDir, { id })` and `SessionManager.open(path)` support custom durable JSONL directories. Session entries form a tree, but the active leaf is process-local until a subsequent append records a new branch.

Extensions are fresh instances in each SDK runtime; they are rediscovered rather than inherited from the parent process. Pi-arsenal must remain loaded so a child opened later with ordinary `pi --session <path>` can recognize its durable role. The child role therefore cannot depend solely on the parent runtime's memory.

The first plan used disposable, one-shot, in-memory children and excluded pi-arsenal from their extensions. Exploration against pi-task and Pi's session APIs invalidated that cut: children must retain stable IDs, accept later questions, follow parent tree branches, and recover their role when opened in another process.

## Goals / Non-Goals

**Goals:**

- Make a child a durable Pi conversation owned by one parent session.
- Let later batches create a new interaction or continue an existing child.
- Keep the runtime blocking and batch-wide while allowing logical child state to outlive calls and processes.
- Preserve parent and child branch semantics using explicit child checkpoints.
- Reapply the current named subagent definition whenever a child is reopened.
- Preserve the user's current extension environment, especially extension-provided model providers.
- Distinguish full child prompt replacement from appended parent persona prompts.
- Separate one-time definition loading, session activation, prompt application, and execution-time context.
- Keep active tools derived from registered declared tools, with advisory unknown-tool diagnostics rather than capability-based agent rejection.
- Make disabled Multiverse behaviorally inactive, including in directly reopened child sessions.

**Non-Goals:**

- Background task dispatch or a persistent resident child process.
- Individual mid-interaction status, steer, cancel, or revive operations.
- Automatic attachment of a running SDK child to a Pi TUI or tmux pane.
- Cross-process file ownership leases or a read-only external session viewer.
- A second `tool_call` capability gate beyond `setActiveTools()`.
- Snapshotting historical subagent prompts, tools, skills, or extension source.
- Preventing an enabled council extension from connecting in a child process.
- Worktree isolation, declared write scopes, or any file-touch observation or reporting.
- A history modal or automated cross-parent child import.
- Skill resolution, unknown-skill diagnostics, or skill-command interception in V1.
- Definition hot-reloading on every turn or spawn lookup.
- Rewriting storage, scheduling, manifests, or rendering as part of the activation cleanup.

## Decisions

### D1. Durable logical children with per-interaction runtimes

**Decision.** Each child is a persistent Pi JSONL session with a stable child session ID. Multiverse hydrates a fresh `AgentSession` for each interaction, waits for it to settle, records its resulting checkpoint, and disposes the runtime without deleting the logical child.

**Why.** Retaining every `AgentSession` indefinitely would retain loaders, extensions, tools, subscriptions, and conversation state in memory and would make reload, shutdown, and recovery process-dependent. Reopening a normal Pi session provides durability and compaction behavior without a custom transcript format.

**Consequence.** A later question has the prior conversation but not the same JavaScript objects or extension instances. Mid-interaction steering remains out of V1; between interactions no child process is resident.

### D2. Parent-scoped custom session directory

**Decision.** Child files live beneath `~/.arsenal/subagent_sessions/<cwd-key>/<parent-session-id>/`, using Pi's normal timestamp-and-session-ID JSONL naming inside the parent bucket. A stable encoded or hashed cwd key avoids placing raw absolute paths into directory structure. Derived metadata may accelerate listing, but the JSONL remains the durable conversation source.

**Why.** Grouping by cwd and parent makes ownership and indexing explicit and avoids mixing child sessions into the user's normal Pi session selector. Passing the bucket as `SessionManager`'s custom session directory preserves the native format.

**Consequence.** Parent forks receive a new parent session ID and do not automatically gain write ownership of the original parent's children.

### D3. One immutable child identity entry

**Decision.** Before a new child's first prompt, its `SessionManager` receives exactly one custom entry:

```json
{
  "customType": "arsenal-subagent",
  "data": {
    "version": 1,
    "agent": "fixer",
    "parentSessionId": "..."
  }
}
```

While Multiverse is enabled, the identity is file-wide and is found by scanning all entries, not merely the active branch. Conflicting, unsupported, or unknown identities fail closed with a diagnostic. Disabled Multiverse does not enforce identity-derived behavior; it leaves the marker untouched.

**Why.** The marker lets both SDK-created and ordinary CLI-opened Pi processes decide deterministically that the file is a child and which current definition applies. It does not duplicate changing prompt or capability data.

**Alternatives considered.** *Snapshot the full definition:* rejected because rolling updates are desired. *Sidecar identity only:* rejected because moving or directly opening the JSONL would lose its role. A sidecar may remain a derived operational index.

### D4. Rolling subagent definitions

**Decision.** The marker persists only subagent name and parent ownership. Each extension instance loads definitions once during factory execution. Enabled session activation resolves the named definition from that registry and applies its prompt and registered tool subset. Turns and parent spawn lookups reuse the loaded definitions; reload/reopen creates a fresh instance and adopts installed updates. Fresh SDK child instances load their own definitions, not a process-global cache. V1 bundles `explorer`, `fixer`, and `visualizer` from the maintainer's LLW Multiverse bundle; their initial skill allowlists are empty. Definition bodies remain maintainer-supplied; implementation work must not invent them.

**Why.** This matches Pi's general behavior: old sessions run under the current installed runtime and extension code. Fixes to prompts or capability lists should improve existing children without migration.

**Consequence.** Enabled reopening can change behavior. A disabled, missing, or structurally invalid definition leaves the child stored but unavailable as a Multiverse child until repaired or re-enabled. Unknown capabilities alone do not make a definition unavailable. Direct reopening with top-level Multiverse disabled instead uses ordinary Pi behavior.

### D5. Full child replacement, appended parent persona

**Decision.** While Multiverse is enabled, a child subagent body fully replaces its host base prompt and excludes host/appended prompt material and Megamind content. A parent running Megamind retains the host prompt and receives dynamic orchestration content appended once per turn. Other user extensions remain loaded and may make later prompt contributions; V1 accepts that.

**Why.** A child is a narrow instrument and must not inherit the parent's role. A parent remains the user's normal Pi agent and needs the host's capabilities and context.

**Implementation posture.** SDK children use a loader override for the full child prompt and an empty appended-prompt override. When pi-arsenal recognizes a directly reopened child, its per-turn hook restores the current child base prompt and suppresses parent persona content. The guarantee covers the arsenal-controlled base prompt, not a byte-identical final provider payload after other extensions run. The approved Megamind content and assembly live together in `src/extensions/multiverse/orchestrator/orchestrator-prompts/megamind.ts`, with one public `buildMegamindPrompt(roster, maxConcurrency)` export. Private section strings and roster helpers remain local. The separate eligibility resolver, `MEGAMIND_PROMPT_INTRO` alias, empty-intro development gate, and fixture-only intro/section injection seams are removed. Eligibility is activation policy, not prompt parsing. The contribution is built in `before_agent_start` from the in-memory available roster and current configured concurrency, then appended to that event's current host prompt. There is no cached Megamind prompt variable and no generated tools line in the roster; only names and authored metadata are rendered.

### D6. Permissive declared tools and deferred skills

**Decision.** Enabled child activation selects the registered subset of its definition's declared tools. Unknown tools produce file-specific `ctx.ui.notify()` warnings during enabled activation, not definition rejection or repeated per-turn/per-spawn warnings. Pi excludes unregistered tool names. Duplicate tools and skills are deduplicated during parsing in first-occurrence order. Undeclared orchestration and parent tools remain inactive.

Unknown skills are ignored without diagnostics or availability effects. V1 ships empty bundled skill lists and retains empty SDK child skill context; skill resolution, validation, and directly reopened skill-command interception are deferred. The parser retains the normalized skills field for future support.

**Why.** Capability spelling mistakes should be visible without making a usable agent unavailable. Strict rejection belongs to malformed definition structure, not missing runtime tools. Full skill support is not needed by the bundled V1 agents.

**V1 boundary.** There is no additional `tool_call` blocking handler. Another extension could later reactivate a tool, and a child with `bash` is not sandboxed. Defense in depth and tamper resistance are future improvements.

### D7. Preserve current extensions, including pi-arsenal

**Decision.** Child runtimes rediscover all currently available user extensions rather than excluding pi-arsenal or cloning parent instances. While Multiverse is enabled, the child marker puts pi-arsenal into child mode: Megamind is not injected, parent switching is rejected, and the batch tool is removed when the current child active-tool selection is reapplied.

**Why.** Extension-provided model providers must initialize in the child, and a session opened through ordinary Pi needs arsenal present to restore its role. Snapshotting extension code is neither practical nor desired.

**Accepted council limitation.** V1 does not add special guards to `p2p_council`. If its normal configuration activates it, a child may connect or appear as a council member even though council tools omitted from the child allowlist are inactive. The previous guarantee of council invisibility is withdrawn and deferred.

### D8. Explicit create and continue tasks

**Decision.** The batch tool keeps `{ context, tasks[] }`, but every task explicitly chooses:

```text
create   -> agent + task + optional name
continue -> childSessionId + task + optional name
```

The entire batch is preflighted before dispatch. Results always return the child session ID and the resulting child checkpoint when one exists.

**Why.** An explicit action is easier for models and validation than conditional optional `agent` and `sessionId` fields. It also cleanly separates roster validation from ownership and branch validation.

**Consequence.** The batch remains the scheduling unit and still returns all-settled ordered results. A child interaction is one prompt, but the child lifetime may include many interactions.

### D9. Child reference is session ID plus leaf checkpoint

**Decision.** Branch-scoped parent tool-result details are the canonical correlation for each interaction; hidden manifests duplicate the reference for recovery:

```text
ChildRef = childSessionId + childLeafEntryId
```

When continuing a child, Multiverse walks active-branch tool results for the latest reference whose entry still resolves and builds valid child context, opens the child, branches its in-memory `SessionManager` at that checkpoint, and then appends the new interaction. After abort, the latest valid persisted entry is used, or the prior checkpoint is retained when no new valid entry exists. No child file is eagerly mutated merely because the parent runs `/tree`.

**Why.** A session ID names the entire child conversation tree, not a branch position. This pair is analogous to repository plus commit and lets a child mirror parent alternatives without copying the whole session.

**Consequences.** A child created only on another parent branch is not implicitly available. External child turns that have no parent reference are not automatically adopted. Import, clone, and handoff policies are deferred.

### D10. One managed writer per child

**Decision.** Multiverse prevents concurrent managed interactions against one child. A batch containing the same continued child more than once is rejected before dispatch, and runtime admission ensures only one hydration owns it at a time.

**Why.** Pi's append-only JSONL manager has no cross-process writer lock. Two runtimes opened at one leaf would append accidental competing branches with independent leaf state.

**V1 boundary.** The invariant covers Multiverse-managed runtimes, not a user simultaneously opening and editing the same file from another Pi process. External interactive handoff and leases are future work. Opening an idle child for inspection is possible, but standard `pi --session` is an interactive second owner, not attachment to a live SDK stream.

### D11. One global concurrency pool

**Decision.** All eligible batch tasks share `maxConcurrency`, default `5` and range `1..10`. No per-agent pool exists. Slots refill as interactions settle.

**Why.** Total live sessions and model streams are the contended resource. A single semaphore exposes that directly.

**Consequence.** Several fixers may edit one working directory concurrently. Lane coordination remains prompt-level.

### D12. Parent persona persistence is append-only and file-global

**Decision.** The `/multiverse` command and matching `PI_VIM_KEY_EVENT` open a Vim-navigable modal with `[Switch Agent]` and `[Child Sessions]` tabs. The child-sessions tab is a coming-soon placeholder. The switch tab lists Default and Megamind, initially selecting the active persona. Confirming an enabled option appends an `arsenal-parent-agent` custom entry naming `default` or `megamind`, updates active state, toggles `spawn`, and emits the agent-name event immediately; the next turn therefore uses the selected prompt/tool policy without pending-persona state. On restore, the last physically recorded syntactically valid selection in `getEntries()` is the preference, regardless of the active parent branch; absent an entry, configured `defaultAgent` applies. When enabled Multiverse has no available subagent, the runtime falls back to Default with a notice while retaining the recorded preference. Disabled Multiverse leaves the newly constructed parent state at Default, removes `spawn`, and does not install the enabled activation's command or key event.

**Why.** Parent persona is treated as session-level UI/orchestration state rather than branch-local conversation content. Append-only entries preserve history and survive reopen without a separate settings file.

**Child guard.** While Multiverse is enabled, `arsenal-subagent` identity has higher priority. In a child, both parent-persona rows are visibly disabled and cannot be confirmed. The child ignores parent-agent entries, uses its full replacement prompt, and never activates the batch tool.

### D13. Computed frame around verbatim child output

**Decision.** Each result frame carries only fields the parent model can act on, did not itself supply, and can soundly rely on: subagent name, child session ID, terminal status, an error message when the interaction failed before producing a usable child response, and a truncation notice when the body was capped. A successful final child message remains verbatim and unvalidated. The frame is bounded by a boundary token whose per-call random component is declared once and never disclosed to the child, so a child cannot forge, terminate, or extend a neighbouring entry. A task's position in the ordered response, encoded in the boundary, is its correlation key; a separately numbered interaction ID would be a pure function of that position and is not included. Branch checkpoints are recorded in tool-result details and the durable manifest, not in the envelope, because `continue` accepts only a child session ID and the model has no checkpoint value it can act on.

**Why.** The SDK offers no forced structured child output or repair loop, so computed facts must remain trustworthy while formatting drift does not turn usable work into failure. Every field earns its place under one rule: actionable, not self-authored, and sound. A field that fails that test costs context indefinitely for no decision the model can make.

**Consequence.** Model context carries close to the minimum needed to correlate, trust, and read a result. Fuller diagnostic state, including checkpoints and telemetry, remains available in tool presentation details and the durable manifest for the user.

### D14. File-tool touch observation is removed, not just hidden

**Decision.** Multiverse does not track or report which files a child touched, anywhere: not in the envelope, tool details, or the manifest. There is no per-interaction touch ledger.

**Why.** All three bundled subagents (`explorer`, `fixer`, `visualizer`) have `bash`. A ledger built only from `edit`/`write`/`multi_edit` call arguments cannot see shell-mediated writes, so an empty result would not mean "touched nothing" — it could equally mean "touched it through `bash`." A field whose negative is unsound is worse than no field: it invites the parent, or the user, to conclude a working child did nothing. The information this attempted to provide already exists at higher fidelity elsewhere: the child's own durable session file records every tool call and result, and the shared working directory can be inspected directly (for example `git status`/`git diff`) for a complete, path-normalized account of what changed.

**Consequence.** Diagnosing concurrent-fixer collisions in a shared working directory relies on the user inspecting the working tree or a child's session file, not on a Multiverse-reported path list. This trades a partial automatic signal for no signal, rather than for a misleading one.

### D15. Abort and manifest semantics

**Decision.** Batch abort stops running interactions, prevents queued starts, preserves completed results, disposes runtimes, and never deletes durable children. Every dispatched batch appends exactly one hidden parent manifest, completed or aborted, with child references and telemetry. Preflight rejection writes none.

The manifest carries **references, not content**: batch outcome and counts, the input task list, and per task the child session ID, subagent, terminal status, branch checkpoints, error, and telemetry. It SHALL NOT embed a child's response body or any other copy of child output.

**Why.** The durable child is distinct from one turn's outcome. Aborted work may have persisted useful conversation and spent tokens, both of which must remain attributable.

The content restriction is a correction made after D16 landed. Copying the full interaction, body included, made every child response exist three times: in branch-scoped tool-result details, in the manifest, and uncapped in the child's own session file. Raising the cap under D16 multiplied the redundant two copies fourfold, so a single batch could write hundreds of kilobytes of duplicated prose into the parent JSONL. The body is also the copy least worth keeping — the child session holds it uncapped and is reachable from the child session ID the manifest already records.

**What only the manifest holds.** Most of what a manifest was assumed to protect is already branch-independent without it: the child session index and each child's own identity entry record parent-to-child provenance, the child's session holds its prompt and its own usage, and `rebuildChildSessionIndex` can reconstruct the index from the child files alone. Three things survive nowhere else, and they are what justifies the entry: which children were dispatched by one call and in what order; tasks that failed before any child existed, such as an unreachable continuation or an unresolvable subagent; and a record of a batch that threw after dispatch, where no successful tool result was ever returned.

**Consequence.** The manifest is a batch-level index, not an archive. Reading a child's output after the fact means opening that child's session by the ID the manifest records. No manifest reader ships in V1; the entry is written and validated so the record exists when a consumer, such as run history or crash recovery, is built.

### D16. Output caps are a circuit breaker, not a budget

**Decision.** The line/byte cap on a child's final message exists to stop one runaway child (a loop, a large file dump) from consuming the parent's context indefinitely, not to shorten routine reports. The threshold is set an order of magnitude above the plausible honest maximum, so it fires only on pathological cases. When it fires, the model-facing notice states that the output was cut and stops there; it proposes no remedy and names no file path. The capped body carries an inline marker at the cut point so a severed sentence is not mistaken for a complete one.

**Why a cap at all.** The body is the one string in the system reproduced byte-for-byte from an untrusted party, and it lands directly in the parent's context, up to `MAX_SPAWN_TASKS` of them per call. A blown parent context is unrecoverable in a way a truncated body is not. "Children are instructed to be concise" is a prompt-level guarantee over an untrusted party, which is precisely the class of guarantee the boundary nonce and render sanitization already refuse to rely on; child cooperation cannot be the only thing bounding parent context growth.

**Why no remedy is offered.** An earlier version directed the parent to continue the child for the remainder. That is waste presented as recovery: it costs a full hydration and turn to re-emit output the child already produced, and a child that ignored its conciseness instructions once has no new reason to obey them on a retry, so the second attempt likely reproduces the first. At a threshold this high, anything that trips it is a malfunction whose severed tail has no value worth a round trip. The parent sees the marker, knows the tail is gone, and decides for itself — usually to proceed, occasionally to re-scope the task.

**Consequence.** `MAX_OUTPUT_LINES`/`MAX_OUTPUT_BYTES` are raised to 20,000 lines / 256 KB — far outside the range of a verbose subagent survey, which runs a few hundred lines and single-digit kilobytes — and declared once in `constants.ts`, which `output-cap.ts` re-exports. The Megamind prompt teaches no truncation policy, because under this framing the parent has no decision to make.

### D17. Live activity display is not an account of record

**Decision.** While a spawn call is pending, the tool row renders each child's live activity: elapsed time, tool-use count, the current tool name with a summarized input, and terminal outcome. The runtime observes only `agent_start`, `agent_end`, `tool_execution_start`, and `tool_execution_end`, and records tool names and summarized inputs, never tool outputs. This state is held for presentation and persisted into tool details so the settled row can be expanded later. It is deliberately partial and capped.

**Why this does not reintroduce D14.** D14 removed a derived path set that was reported as an account of what a child changed, whose empty value falsely implied "changed nothing" because shell-mediated writes were invisible. An activity display makes no completeness claim: it shows what is happening while it happens. The distinction is the claim, not the storage location. A user asking what a child actually did is directed to that child's own session JSONL, which remains the single source of truth and holds the full transcript at higher fidelity.

**Presentation is a trust boundary too.** Child-derived strings reaching the renderer, including tool arguments the child chose, are stripped of ANSI with `dye.strip` and truncated with ANSI-aware width helpers before styling. This is the terminal-side counterpart of the envelope's boundary nonce: the nonce protects the parent model's parser from forged structure, and sanitization protects the user's terminal from injected escape sequences. Both defend against the same untrusted source at different consumers.

**Surface.** Rendering lives in the tool row through `renderResult` under `isPartial`, not in a `ui.setWidget` panel, because V1 spawn calls block for their whole life and own no state that outlives the call. A panel becomes appropriate only if background dispatch is added later. The component is reused across renders via `context.lastComponent` and drives its own repaint interval, so a child sitting inside one long tool call still shows a moving timer despite emitting no events.

**Consequence.** Tool details grow with a capped activity trail per task, so trail length and stored input length are bounded and the batch task count is bounded. Nothing in this decision reaches model context; the model still receives only the D13 envelope.

### D18. Definition loading and registry have separate ownership

**Decision.** `agents/subagent-definition.ts` exposes a singular `loadSubagentDefinition(filePath)` operation. It reads one file, parses YAML, validates required structure (`name`, `tools`, `skills`, `metadata`, non-empty prompt), normalizes duplicate tools/skills, and returns either `{ status: 'success', data, filePath }` or `{ status: 'error', error, filePath }`. `SubagentDefinition.name` is a string. The loader does not discover directories, know bundled names, compare filename to identity, consult config/Pi, validate capability availability, or detect cross-file collisions.

`agents/subagent-registry.ts` owns `SubAgentRegistry`, with definitions keyed by name and separately resolved enablement. `register(paths)` loads each supplied file once and returns file-specific registration diagnostics; cross-file duplicate names are reported rather than silently overwritten. Registration accepts any non-empty declared string name, independent of filename. The registry is the sole authority for whether a name exists and is available; there is no bundled-name enum or allowlist in parsing, identity, spawn schemas, or runtime types. The shipped files still provide the initial three agents. Definition paths are discovered from the prompts directory without a hardcoded filename list. `resolveAvailability(config: MultiverseConfig)` updates enablement from a resolved config value rather than depending on the entire arsenal `ConfigProvider`. `availableSubAgents` and `getSubAgent(name)` are in-memory queries; the latter returns the definition and enabled flag or null. Registration diagnostics retain missing/malformed-file reasons for activation and spawn error reporting. Tool/skill existence does not participate in availability.

**Why.** This replaces the hidden combination of directory discovery, parsing, runtime capability validation, and config resolution in repeated lookups. Identity parsing validates the string's structure; enabled activation and spawn queries validate it against the registry. Configuration uses string-keyed per-agent settings with enabled-by-default behavior for registered names lacking explicit settings; configuration alone cannot register an agent. Global/project merging iterates names rather than hardcoding bundled keys.

### D19. Explicit activation lifecycle and tool mechanics

**Decision.** `multiverse.extension.ts` remains the composition and event-wiring entry point, with one explicit session activation path. Beyond the registry and existing role/parent state, it retains only `registeredSubAgentSession: SubagentDefinition | undefined`. Configuration is read directly from `dependencies.config`; it is not cloned or stored in another closure variable. Child errors are local activation diagnostics. It must not become a second registry or hide repeated environment discovery behind helpers.

```text
Extension load
  --> establish bundled paths and register definitions once
  --> register spawn
  --> register one configuration gate on session_start

session_start gate (after index.ts initializes configuration)
  --> disabled: keep the fresh Default state, remove spawn, return
  --> enabled: install activateMultiverse once

activateMultiverse
  --> initialize the enabled session directly
  --> install before_agent_start, command, and key event

activated session initialization
  --> clear transient activation data
  --> resolve registry availability and report diagnostics
  --> classify identity
  --> invalid child: diagnostic and fail closed
  --> child: retain registered definition and override tools
  --> parent: restore preference, resolve eligibility from roster, toggle spawn

before_agent_start (installed only by enabled activation)
  --> child: replace with registeredSubAgentSession.prompt
  --> Megamind parent: build contribution from registry and append to event.systemPrompt
  --> Default parent: return

spawn.execute
  --> guard resolved enabled parent activation
  --> combine registry state with current execution context
  --> validate and dispatch
```

Configuration-dependent activation occurs at session start, not factory time: `index.ts` initializes config in its earlier handler. `registerMultiverse` contains only the enabled gate: disabled instances remove `spawn` and retain their fresh Default state, while enabled instances install `activateMultiverse`. Pi reloads and rebinds fresh extension instances for reload, new, resume, and fork session transitions, so enabled-only handlers do not survive into a disabled instance. `activateMultiverse` initializes that instance's enabled session directly and owns its prompt, command, and key-event behavior; it does not register a second `session_start` handler. The enabled-only `before_agent_start`, command, and key event therefore need no redundant configuration checks and are absent while disabled. Definition edits become visible on reload/reopen, not arbitrary subsequent lookups. Persona selection applies directly while the modal is open; no pending-persona or settled-event state is required because prompt policy is read at the next `before_agent_start` and Pi snapshots tool context per run. Existing saved preference restoration remains. `before_agent_start` only builds/applies prompt policy, with no tool mutations, file parsing, availability resolution, or repeated notifications. Invalid/unavailable child activation reports its error and selects no tools; no persistent error variable or new input interception is added in this cleanup.

`src/utils/pi-tool-manager.util.ts` provides the static `PiToolManager.removeActive`, `addActive`, and `overrideActive` mechanics. Remove/add preserve unrelated active tools and avoid redundant sets; add deduplicates. Override uses registered names intersected with the supplied allowlist. The utility has no knowledge of roles, config, registry, or prompts. Session-start call sites express policy directly: remove spawn for Default/disabled, add spawn for Megamind, override for children. Existing `applyParentTools`/`applyChildTools` responsibilities are replaced by these explicit policies rather than relocated wholesale into the utility.

**Why.** Session state has a clear lifetime, prompt composition has one source, and reading an event handler reveals what changes. The disabled branch precedes identity enforcement by design: disabled means no Multiverse behavior, not an always-on child-protection layer.

### D20. Registry state is not execution context

**Decision.** Replace `resolveSpawnHost`'s repeated eligibility/prompt/definition work with a small execution adapter. Keep stable repository/admission objects and registry queries in the extension closure, but obtain cwd, parent session ID, selected model, thinking level, model registry, and active-branch continuation references from the execution's current context. The tool's admission, available-agent validation, and task definition queries use the same resolved registry state. Config values are read directly from the provider at the point of use; model/authentication and branch resolution remain interaction-time work. Registry availability is refreshed at session start, following the config loader's own initialization lifecycle.

`createSpawnTool` stays registered once and rejects disabled, Default, or child execution before dispatch. The callback passed at registration is invoked at execution; rename/shape it to communicate that purpose rather than suggesting another full activation resolution. Remove `current-subagent.ts` and the old Megamind eligibility/prompt wrappers after their consumers migrate.

**Why.** Model switches and tree navigation can happen without reactivation. Freezing those inputs at session start would trade repeated work for stale behavior. No additional disabled-mode branch is required in SDK child construction for this flow: disabled spawn never reaches construction. A directly opened child with Multiverse disabled follows ordinary Pi behavior and retains its identity only as durable data.

## Risks / Trade-offs

- **Old children change behavior when definitions or extensions update.** -> Intentional rolling behavior; identity stays stable and unavailable definitions fail clearly.
- **Concurrent fixers can race in a shared working directory.** -> Global concurrency bounds load and prompt-level lane ownership aids coordination; diagnosis relies on inspecting the shared working tree or a child's own session file. Structural scopes are deferred.
- **No automatic file-touch observability.** -> Diagnosing a shared-working-directory race relies on the user inspecting the working tree or a child's session file; Multiverse reports no path list at all, so no partial signal can be mistaken for a complete one.
- **`setActiveTools()` is only one protection layer.** -> Accepted for V1; a future tool-call gate can add defense in depth without changing identity format.
- **Ambient extensions can alter prompts or activate behavior.** -> Accepted to preserve the user's extension environment; the child base prompt and named role remain deterministic.
- **An enabled council may connect from children.** -> Previous containment guarantee removed; add a role-aware council activation guard later if observed behavior is undesirable.
- **Directly opening a running child is not live attachment.** -> SDK events feed Multiverse progress; a future viewer, safe snapshot, or exclusive external handoff can provide richer visibility.
- **No cross-process writer lease.** -> V1 protects managed concurrency only; document that interactive external editing must not overlap a managed interaction.
- **Parent crash can leave a child turn persisted without a parent reference.** -> Preserve it as orphaned recoverable data; automatic adoption is deferred.
- **Long-lived child context grows.** -> Native Pi compaction remains available during hydration; exact policy can follow normal settings.
- **Persisted activity trails grow parent session details.** -> Trail entries per task, stored tool-input length, and batch task count are all capped; the trail is presentation state, and the child's own session file remains the complete record.

## Migration Plan

The extension remains additive and disabled by default. No existing session is reclassified without an `arsenal-subagent` marker and enabled Multiverse. Existing parent sessions without `arsenal-parent-agent` entries use configured defaults; the first explicit switch begins their append-only history. Disabling Multiverse stops orchestration, persona activation, and child prompt/tool enforcement; a directly opened marked child intentionally runs as ordinary Pi, subject to other active extensions. Markers and saved preferences are not deleted or rewritten, and enabling plus reloading restores the applicable role. Durable JSONL formats and storage remain unchanged.

Implement D18-D20 as the remaining cleanup before final integration verification. Migrate parser/registry consumers together, then consolidate prompt and activation wiring; remove obsolete seams and update tests/docs to the new behavior. Rollback requires reverting implementation changes and reloading, not migrating session data. Existing completed task checkboxes record historical implementation; the new unchecked cleanup tasks track the changed contracts.

## Open Questions

- Exact output byte and line caps.
- Concrete cwd-key encoding and derived index representation.
- Child interaction and checkpoint identifier display format.
- Whether an idle child inspection command should first ship as a safe snapshot, internal viewer, or exclusive tmux handoff. This remains outside V1.
