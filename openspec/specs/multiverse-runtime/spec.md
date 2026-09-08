# multiverse-runtime Specification

## Purpose

Defines durable child storage, branch-aware conversation reuse, runtime hydration, extension and model behavior, concurrency, abort, observation, and historical manifests.

## Requirements

### Requirement: Durable parent-scoped child storage
Every created child SHALL use a persistent Pi JSONL session stored under `~/.arsenal/subagent_sessions/`, grouped by a stable working-directory key and parent session ID. The child SHALL have its own stable session ID, and its JSONL conversation SHALL remain after an interaction runtime is disposed or the parent process exits.

#### Scenario: Child survives runtime disposal
- **WHEN** a child interaction finishes and its runtime is disposed
- **THEN** the session ID and JSONL remain available for a later interaction

#### Scenario: Parent grouping
- **WHEN** different parent sessions create children in the same working directory
- **THEN** their child files are organized under distinct parent-session groups

### Requirement: Runtime hydration per interaction
For each interaction, the system SHALL open the selected child session and checkpoint, construct a fresh AgentSession with the definition resolved from the active registry and the current runtime environment, run the prompt, persist the resulting checkpoint, and dispose the runtime on every terminal path. The logical child session SHALL not be deleted by disposal.

#### Scenario: Continue after process restart
- **WHEN** a parent later continues a persisted child and no runtime is resident
- **THEN** the child is hydrated from disk and retains its selected conversation context

#### Scenario: Disposal on failure or abort
- **WHEN** an interaction fails or is aborted
- **THEN** any created runtime is disposed while the child transcript remains recoverable

### Requirement: Execution context remains current
A spawn call SHALL use the current parent session, selected model, thinking level, and active-branch child references rather than values frozen at extension load or session start. Definition lookups SHALL reuse the active registry without re-reading files or rebuilding parent prompts. Fresh child extension instances SHALL initialize their own activation state rather than share a process-global registry.

#### Scenario: Model changed since activation
- **WHEN** a parent changes its model or thinking level before invoking spawn
- **THEN** the interaction uses those current parent values for fallback resolution

#### Scenario: Branch changed since activation
- **WHEN** a parent navigates its conversation tree before continuing a child
- **THEN** continuation eligibility and checkpoint selection use the current active branch

### Requirement: Parent-branch-aware child checkpoints
Each completed or aborted child interaction SHALL be correlated with the parent branch by recording the child session ID and latest valid child leaf checkpoint in the branch-scoped parent tool-result details; the manifest MAY duplicate it for recovery. Continuing a child SHALL select its latest referenced checkpoint from tool results on the active parent branch and branch the child conversation from it. A checkpoint is valid when the child session can resolve that entry and build context through it; after an abort this may be the newest persisted aborted entry or, when no new valid entry exists, the prior checkpoint. A child created only on another parent branch SHALL not be implicitly available.

#### Scenario: Parent alternatives create child alternatives
- **WHEN** a parent returns to an earlier branch and continues a child referenced there
- **THEN** the new child interaction branches from that parent branch's last child checkpoint rather than from an abandoned child path

#### Scenario: Child exists only on another branch
- **WHEN** the active parent branch contains no available reference to a child created elsewhere
- **THEN** continuation is rejected rather than importing the other branch implicitly

#### Scenario: Parent fork
- **WHEN** a new parent session is forked from history containing child references
- **THEN** it does not gain write ownership of the original parent's children, and V1 provides no import path

#### Scenario: Aborted interaction checkpoint
- **WHEN** an interaction is aborted after appending a valid child entry
- **THEN** the parent reference records that entry as the latest checkpoint; if no new valid entry exists, it retains the prior checkpoint

### Requirement: One active writer per child within Multiverse
Multiverse SHALL run at most one interaction against a child session at a time within its managed runtime. Duplicate use in one batch SHALL be rejected. Cross-process writer leases and simultaneous external-session protection SHALL be deferred beyond V1.

#### Scenario: Managed interaction already running
- **WHEN** another managed interaction attempts to hydrate the same child while it is active
- **THEN** the later interaction does not open a second writer

### Requirement: Global concurrency scheduling
All batch tasks SHALL share one capacity pool equal to configured `maxConcurrency`. Capacity SHALL not be reserved per subagent, and a queued task SHALL begin when any running task releases a slot.

#### Scenario: Mixed batch respects limit
- **WHEN** a batch exceeds capacity and mixes subagent types
- **THEN** no more than the global limit run at once in any combination

#### Scenario: Slot refilled
- **WHEN** a running task becomes terminal while work remains queued
- **THEN** an eligible queued task starts promptly

### Requirement: Current extensions load in child runtimes
A child SHALL rediscover and initialize the user's currently available extensions, including pi-arsenal, rather than snapshotting extension code or inheriting parent extension instances. During enabled child session activation after extension discovery, pi-arsenal SHALL use the child identity entry to suppress Megamind and apply the loaded subagent definition's registered tool subset. SDK resource loading SHALL preserve V1's empty bundled skill lists. These activation policies SHALL not be imposed by Multiverse on a session opened directly while it is disabled. V1 SHALL not guarantee that an enabled council avoids connecting from a child process or that later dynamic extension changes cannot alter the active set.

#### Scenario: Provider extension remains usable
- **WHEN** the current environment contains an extension-provided model provider
- **THEN** a child can load that extension and resolve its provider

#### Scenario: Extension changes between interactions
- **WHEN** the installed extension set changes before a child is reopened
- **THEN** the reopened child uses the current extension environment

#### Scenario: Council enabled
- **WHEN** a child loads an enabled council extension
- **THEN** V1 may allow the connection even though council tools absent from the child allowlist remain inactive

### Requirement: Subagent model resolution
For each interaction, the configured subagent model SHALL be preferred and the current parent model SHALL be the fallback. The first candidate with successfully resolved authentication SHALL run, requested reasoning SHALL be clamped to supported levels, and failure reasons SHALL accumulate without stopping siblings.

#### Scenario: Configured model works
- **WHEN** the configured model resolves and authenticates
- **THEN** it is used

#### Scenario: Fallback works
- **WHEN** the configured model is absent or unauthenticated and the parent model is usable
- **THEN** the parent model is used

#### Scenario: No candidate works
- **WHEN** no candidate can be used
- **THEN** only that interaction fails with accumulated reasons

### Requirement: No authoritative file-change record
The runtime SHALL NOT derive, persist, or report a set of files a child changed as an account of its work, in any interaction result, tool presentation detail, durable manifest, or model-facing content. No per-interaction touch ledger SHALL exist. The runtime MAY observe a child's tool events to drive live batch presentation, recording tool names, summarized tool inputs, and per-call success or failure; it SHALL NOT record tool outputs and SHALL NOT aggregate those observations into a file-change account. A child's own session file remains the complete record of what that child did.

#### Scenario: File tool is not recorded as a change account
- **WHEN** a child invokes a file-modifying tool
- **THEN** no per-interaction path set is derived, and no interaction result, tool presentation detail, or manifest field reports which files that child changed

#### Scenario: Activity observation is permitted
- **WHEN** a child invokes any tool while its batch is pending
- **THEN** the runtime may surface that tool's name, a summarized input, and its success or failure as live activity, without implying a complete account of the child's changes

#### Scenario: Change inspection uses the child session file
- **WHEN** a user needs to know what a child actually did
- **THEN** that child's durable session file and the shared working directory remain the sources of that information

### Requirement: Batch abort propagation
Aborting the batch SHALL abort every running interaction, prevent queued tasks from starting, preserve completed results, dispose hydrated runtimes, and retain all durable child sessions and the aborted manifest.

#### Scenario: Abort mixed batch
- **WHEN** abort occurs after some tasks finish while others run or wait
- **THEN** completed results survive, running and queued tasks are marked aborted, and no child session is deleted

### Requirement: Output capping
Captured child output SHALL be bounded by a threshold set far above any legitimate final message, so it fires only on pathological output such as a loop or a file dump and ordinary subagent responses are never reduced. An oversized body SHALL be reduced, marked truncated by an inline marker at its cut point, and accompanied by a notice stating that the output was cut, without changing its execution status. The notice SHALL state the cut as a fact and SHALL NOT direct the parent to any remedy, including continuing the child, nor depend on the child's session file path or checkpoint identifier.

#### Scenario: Successful output truncated
- **WHEN** a successful child's output exceeds the cap
- **THEN** it remains successful, carries an inline marker at the cut point, and reports the cut without proposing a recovery action

#### Scenario: Routine output is not reduced
- **WHEN** a child produces ordinary verbose output within the threshold
- **THEN** its body is returned whole and no truncation notice appears

### Requirement: Invisible run manifest
Every batch that dispatched work SHALL append exactly one non-rendered parent custom entry describing its outcome, its input task list, and per task the child session ID, subagent, terminal status, checkpoints, error, model, duration, and usage. The entry SHALL carry references rather than content, and SHALL NOT embed a child's response body or any other copy of child output; a child's output SHALL remain reachable by opening the recorded child session. Rejected pre-dispatch calls SHALL append none.

#### Scenario: Completed manifest
- **WHEN** a dispatched batch completes
- **THEN** one completed manifest is stored outside model context and normal display

#### Scenario: Aborted manifest
- **WHEN** a dispatched batch is aborted
- **THEN** one aborted manifest retains the work and expenditure recorded so far

#### Scenario: Manifest carries no child output
- **WHEN** a batch whose children produced large responses is recorded
- **THEN** the stored entry holds each child's session ID and terminal state but no response body, so the parent session does not accumulate a duplicate copy of child output

#### Scenario: Task that never reached a child
- **WHEN** a dispatched task fails before a child session exists, such as an unreachable continuation target
- **THEN** the manifest still records that task, its input, and its failure, since no child session exists to hold them
