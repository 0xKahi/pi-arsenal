# Design: gate p2p tools on council connection

## Context

Tool activation is currently a static read of `p2p_council.enabled` taken once per session in
`registerP2pCouncil`. The invariant we want is dynamic:

> The p2p tools are active **iff** `enabled && state.isConnected()`.

The council state is process-scoped (installed on `globalThis` under a `Symbol.for` carrier, so it
survives runtime replacement), while the tool list is session-scoped. The design has to bridge those
two lifetimes.

## Goals / Non-Goals

**Goals**

- A disconnected agent gets no signal that p2p messaging exists — no tool schemas, no prompt text.
- Activation follows deliberate user intent, not connection churn.
- No regression in rendering of restored history.

**Non-Goals**

- Letting the agent initiate or request a council connection.
- Fixing the stale `activation` guard (see "Deferred").
- Any change to the wire protocol, registry, widget, or config schema.

## Decisions

### Commanded transitions, not a derived reconciler

An earlier option was to subscribe to the state's change stream and re-derive activation from
`isConnected()` on every change. Rejected.

`disconnect` / `createCouncil` / `joinCouncil` have exactly three call sites outside the state
machine, and all three are the user pressing a key in the modal:

```
create-council-layer.ts   state.createCouncil(name)
council-detail-layer.ts   state.disconnect('manual')
council-detail-layer.ts   state.joinCouncil(entry)
```

So the commanded set is complete, not a shortcut. It also avoids two problems the derived approach
has:

1. **Promotion churn.** `schedulePromotion` / `attemptPromotion` retry indefinitely; there is no
   terminal automatic disconnect. A client that loses its host sits at
   `connectionType: 'disconnected'` while still semantically a member. A derived reconciler would
   withdraw the tools for the whole retry window — potentially forever. Commanding from user intent
   gets this right without a special case.
2. **Change-stream volume.** `emitChange` fires on every status tick and on every
   `tool_execution_start`/`end`. A derived reconciler would need edge detection with per-session
   reset state; the commanded design needs none.

### The `session_start` reconcile is mandatory, not incidental

The council outlives sessions; the tool list does not. A connection preserved across
reload/new/resume/fork therefore needs one read at session start.

It is also load-bearing for a second, less obvious reason. Pi force-activates every registered
extension tool during runtime construction:

```
_buildRuntime({ ..., includeAllExtensionTools: true })      agent-session.js:158 (startup), :2061 (reload)
  _refreshToolRegistry()                                    agent-session.js:~2003
    else if (options?.includeAllExtensionTools) {
        for (const tool of wrappedExtensionTools) nextActiveToolNames.push(tool.name);
    }
    setActiveToolsByName([...new Set(nextActiveToolNames)]);
```

This runs *before* `session_start` is emitted. So every session begins with the p2p tools forced on,
and the reconcile is what turns them off. This must be commented in the code — the reconcile looks
redundant otherwise and will be "cleaned up".

**Corollary:** deactivating the tools at extension load is futile. Pi overwrites it immediately, and
during load the runtime's actions are throwing stubs, so the call likely never took effect anyway
(`setP2pToolsActive` swallows everything in a bare `catch {}`). The plan does not attempt it.

The window is safe: no agent turn runs between `_buildRuntime` and the `session_start` emit.

### Reconcile inside `activateP2pCouncil`, not `registerP2pCouncil`

The reconcile goes in the inner `session_start` handler registered by `activateP2pCouncil`
(alongside `state.refreshRuntime(bindingToken)`), because:

- `state` there is non-optional and definitely bound; the outer handler only has `activation?.state`.
- Reaching that handler already implies `enabled`.
- In the outer handler, `activation` is assigned on the line *after* where the reconcile would sit,
  so on the very first session start it would read `undefined`.

The unconditional `setP2pToolsActive(pi, enabled)` in `registerP2pCouncil` is removed. The disabled
branch explicitly deactivates the tools before preserving its existing `disposePreservedService`
behavior, because `activateP2pCouncil` (and therefore its inner reconcile) does not run while disabled.

### No idle gating

We considered awaiting `ctx.waitForIdle()` before connecting/disconnecting, deferring the tool-list
write to `agent_settled`, and refusing the action while the agent is running. All rejected: the
inconsistent state is unreachable.

`setActiveToolsByName` reassigns `agent.state.tools` to a **new array**
(`agent-session.js:631`). The agent loop takes a shallow copy of its context at run start
(`agent-loop.js:66,79`) and both builds the request payload and dispatches tool calls from that same
snapshot (`agent-loop.js:394`). A tool call can therefore only be emitted from a payload that
contained the tool, and the executor resolves against the same list. The
`Tool <name> not found` path cannot be reached by this change. Pi's own comment on
`setActiveToolsByName` says it: *"Changes take effect on the next agent turn."*

Rejecting the alternatives on their own merits as well:

- **Refuse while busy** — disconnect is the escape hatch; gating it on the thing being escaped is
  backwards. Worse, `p2p_ask` lets a *remote* peer trigger a local turn, so a peer could hold the
  user's disconnect hostage.
- **`waitForIdle` in the modal** — `waitForIdle` exists only on `ExtensionCommandContext`, not on
  `ExtensionContext`. The modal is reachable from the `/p2p-council` command (which has it) *and*
  from the vim key event via `latestCtx` (which does not), so it would work on one path and silently
  not on the other. It also freezes the modal layer behind `busy = true` with no cancel affordance.
- **Defer to `agent_settled`** — needs a pending-write state machine, and "user disconnected but
  tools linger" is itself a violation of the invariant being built.

### "No signal" is satisfied by the same call

`setActiveToolsByName` also invokes `_rebuildSystemPrompt(validToolNames)`, which regenerates the
available-tools snippets and the guidelines bullets from the active set. So one call removes the tool
schemas, the `promptSnippet` entries, and the `promptGuidelines` bullets together.

Slash commands are not a leak: `BuildSystemPromptOptions` (`core/system-prompt.d.ts:5`) has no
commands field, and `pi.getCommands()` is extension-facing introspection that never reaches the
model. `/p2p-council` can stay registered whenever the feature is enabled.

### Threading the transition into the modal

The modal layers hold `state` but no `ExtensionAPI`. Preferred approach: pass an optional
`onConnectionChange?: (connected: boolean) => void` through `openP2pCouncilModal` to
`create-council-layer` and `council-detail-layer`, invoked after a create/join succeeds and after a
manual disconnect. This keeps `ExtensionAPI` out of UI code and keeps the layers testable.

Alternative considered: re-reconcile once after the modal closes. Simpler, but it loses the
transition when the user connects and leaves the modal open — the tools would not appear until the
modal is dismissed. Rejected.

## Risks / Trade-offs

- **Ordering dependency on `_buildRuntime`.** The design relies on Pi emitting `session_start` after
  the forced activation. If that ordering ever changes, the tools would be exposed for a window.
  Mitigated by the reconcile being idempotent and by a code comment naming the dependency.
- **Handler registration order in `index.ts`.** The config-init handler is registered before
  `registerP2pCouncil`, and Pi runs handlers in registration order, so config is populated when the
  reconcile runs. Fragile but currently correct; worth a comment.
- **Weaker invariant than a reconciler.** Because the tool list is only written at four moments, a
  manual tool toggle by the user survives longer than it would under continuous enforcement. This is
  the intended trade: less surprising, and the security-relevant direction (tools present while never
  connected) is still impossible.

## Deferred

**Stale `activation` when `enabled` flips false→true within one extension instance.**
`disposePreservedService` disposes the state but leaves the `activation` guard set, so a later
enabled session hits `if (activation) return` and binds nothing.

Reachability is narrow. `/reload` re-instantiates extensions
(`agent-session.js:2051`: `oldRunner.invalidate()` → `resourceLoader.reload()` → `_buildRuntime`),
giving a fresh `activation`, and `activateP2pCouncil` recovers the live council through the
`globalThis` symbol carrier. Project trust resolves before the first `session_start`. What remains is
editing config on disk and then `/new` or `/resume` in the same process.

The one-line fix (clearing `activation`) is wrong: `activateP2pCouncil` also calls `pi.on(...)` and
`pi.events.on(PI_VIM_KEY_EVENT_ID, ...)`, and Pi stores handlers as lists
(`Extension.handlers: Map<string, HandlerFn[]>`), so re-activating within a live instance duplicates
them — the vim keybinding would open the modal twice. A correct fix splits `activateP2pCouncil` into
a register-once half and a rebindable half. Separate change.
