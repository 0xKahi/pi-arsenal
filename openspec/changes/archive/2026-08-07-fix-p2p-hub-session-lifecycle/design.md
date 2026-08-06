## Context

See `proposal.md` for motivation. Pi tears down and recreates extension runtimes for `/reload` and successful new, resume, and fork transitions while leaving the operating-system process alive. The current extension stores both WebSocket ownership and runtime callbacks in one `P2pHubState`, does not handle `session_shutdown`, and assumes its module-local activation flag is process-scoped. Active sockets retain the old object after teardown, while the replacement runtime constructs a disconnected object under the same PID.

The registry cannot repair this ownership split: `hostPid` establishes only process liveness, and the reachable port may belong to the orphaned old object. The existing protocol, registry format, manual connection UX, host promotion, and disabled-by-default behavior should remain compatible.

## Goals / Non-Goals

**Goals:**

- Give one compatible p2p service authoritative ownership of networking for the Pi process.
- Replace runtime-dependent callbacks and UI bindings without interrupting membership.
- Make shutdown reason determine whether networking is retained for handoff or closed.
- Bound detached lifetime so extension removal, failed reload, or disabled replacement cannot create a ghost member.
- Keep lifecycle behavior deterministic and testable without real Pi restarts.

**Non-Goals:**

- Persisting or automatically reconnecting hubs across an actual Pi process restart.
- Changing the WebSocket protocol shape, registry format, hub discovery, or host promotion algorithm.
- Preserving in-flight tool invocations or remote prompt execution across runtime replacement.
- Supporting more than one connected hub per Pi process.

## Decisions

### D1: Store a versioned p2p service in a process-global carrier

Use a `globalThis` slot keyed by a package-specific `Symbol.for(...)` to hold a small versioned carrier containing the authoritative p2p service. Every freshly loaded extension runtime resolves this carrier before activation. A compatible existing service is reused; otherwise a new service is created only after an enabled session activates p2p.

A process-global carrier matches the required lifetime and survives module/extension runtime replacement without filesystem inference or reconnect races. The carrier must be narrowly typed and versioned so incompatible future implementations can perform controlled teardown rather than casting arbitrary stale state.

Alternatives considered:

- **Infer ownership from `hostPid` and registry files:** rejected because a client has no registry ownership and PID does not identify an in-memory object.
- **Disconnect and auto-reconnect on every replacement:** rejected because it creates observable membership churn and, for hosts, races with client promotion.
- **Copy connection descriptors and rebuild sockets:** rejected because sockets cannot be recreated without a transport interruption and potential split-brain.

### D2: Separate the process service from a replaceable runtime binding

Refactor state dependencies that reference `ExtensionAPI`, `ExtensionContext`, session activity, message delivery, notifications, and widget rendering into an attachable runtime binding. Network state—role, sockets, hub identity, roster, promotion state, and inbound queues—remains owned by the process service.

Activation attaches one binding and returns tools/commands backed by the shared service. A later compatible attachment atomically replaces any stale binding. Session and agent event handlers affect the service only when they belong to the currently attached binding, preventing late callbacks from an old runtime from mutating current status or resolving prompts.

The binding refreshes the current context on session start and publishes a forced status update after attachment so peers and local UI receive the replacement session's model, context usage, and idle state.

Alternative considered: mutate the existing dependency object in place. This is close to current code but does not establish binding identity, making late old-runtime events and cleanup unsafe.

### D3: Treat shutdown reasons as either handoff or final teardown

Register `session_shutdown` for every activated runtime.

- For `reload`, `new`, `resume`, and `fork`, detach the matching runtime binding, set network-visible local activity to idle, cancel runtime-owned pending prompt operations, and arm a bounded handoff timer while retaining transport ownership.
- A compatible enabled replacement attachment cancels the timer and preserves membership.
- For `quit`, dispose immediately using the existing clean host/client shutdown behavior.
- An explicitly disabled replacement also disposes immediately rather than waiting for timeout.

Use one exported constant for the handoff timeout so fake-timer tests can cover success and expiry. The interval should be long enough for ordinary resource discovery and extension initialization but short enough to avoid a meaningful ghost; five seconds is the initial value.

Alternative considered: retain indefinitely for replacement reasons. Rejected because removing the extension or a failed reload would permanently strand a live host/client until Pi exits.

### D4: Queue chat but reject new remote prompts while detached

Chat is safe to defer. Both trigger-turn chat and steer-only chat received without a runtime binding are queued with their delivery mode, then drained in order after attachment. Normal trigger-turn idle gating and batch limits still apply after draining.

Synchronous remote prompts require an agent runtime and cannot safely cross session identity. A prompt request received while detached receives an immediate response using the existing error field, identifying temporary runtime unavailability. Outgoing pending asks and an incoming prompt owned by the detached runtime are completed with a runtime-replaced error; they are not transferred to the next conversation.

Alternative considered: queue prompt requests. Rejected because callers could wait through an unbounded reload, and executing an old request in a newly selected conversation/session obscures ownership.

### D5: Make lazy registration runtime-scoped and service creation process-scoped

Keep a module-local `registered` guard only for preventing duplicate surface registration within one extension runtime. Do not describe that flag as process-scoped. On enabled activation, resolve/create and attach the process service. On disabled session start, check the process-global carrier even if this runtime never activated; if a preserved service exists, dispose it and clear any local widget.

This preserves the existing requirement that a process which has always been disabled performs no p2p filesystem or network activity. Merely checking an in-memory global slot is not observable p2p activation.

### D6: Restore UI from shared state, never preserve old UI objects

The process service retains no TUI component, `ExtensionContext`, or old `ExtensionAPI` reference after detachment. Attachment triggers the current runtime's change callback immediately. In TUI mode this renders the widget from the shared roster; in non-TUI mode networking remains connected without a widget. Old runtime teardown clears its own widget presentation but does not interpret that as network disconnection during handoff.

### D7: Test lifecycle with independent runtime harnesses

Extend the extension test harness to record `session_shutdown` as well as `session_start`, and instantiate two independent extension API/runtime harnesses against the same process-global carrier. Cover host and client preservation for each replacement reason, absence of membership churn, current-context status refresh, detached chat delivery, detached prompt error, timeout cleanup, disabled replacement, and quit cleanup. Reset the global carrier after each test to prevent cross-test leakage.

State-level tests should use fake timers for the handoff interval and connected peer instances to assert actual transport continuity, rather than validating only accessor flags.

## Risks / Trade-offs

- [A process-global service can retain old implementation code across hot reload] → Version the carrier and document that an incompatible carrier is cleanly replaced; keep runtime-specific behavior outside the retained service so most extension edits take effect immediately.
- [Late events from the old runtime mutate shared state] → Assign each binding a unique token and ignore detach/events that do not match the current token.
- [Replacement initialization exceeds the handoff timeout] → Centralize and conservatively size the timeout; attachment cancels it before UI work begins.
- [Messages accumulate during repeated failed reloads] → The bounded handoff timeout limits queue lifetime and disposal clears queued messages.
- [A host receives a final `quit` event too late for graceful close] → Retain existing crash recovery and client promotion as the fallback.
- [Global carrier leaks between tests or multiple package copies] → Use a package-specific symbol, explicit version checks, and test-only reset/dispose helpers.

## Migration Plan

No registry or configuration migration is required. On first load of the updated extension, no compatible global carrier will exist and the service is created normally when enabled. Rollback is safe after restarting Pi; an older extension instance will use its existing lifecycle behavior and stale registry entries remain subject to current liveness pruning.
