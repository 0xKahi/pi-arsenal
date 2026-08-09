# Gate p2p tools on council connection

## Why

Today the p2p tools are activated purely from `p2p_council.enabled`, so an enabled-but-disconnected
agent still sees `p2p_send`, `p2p_ask`, and `p2p_ls` in its tool list and in its system prompt. That
is a capability the agent cannot use and should not know about: joining a council is a deliberate
user action taken through `/p2p-council`, never an agent action. The tools should be invisible until
the user has actually connected this session to a council.

## What Changes

- Tool activation is keyed on connection state rather than config alone: the three p2p tools are
  active if and only if the feature is enabled **and** the process-scoped council state is connected.
- Activation is driven by the three user-initiated transitions in the modal (create council, join
  council, manual disconnect) plus a single reconcile on every `session_start`.
- The `session_start` reconcile becomes mandatory rather than incidental. Pi force-activates every
  registered extension tool during `_buildRuntime` (at both process construction and `/reload`) via
  `_refreshToolRegistry({ includeAllExtensionTools: true })`, so the reconcile is what re-establishes
  the invariant on each session start.
- The unconditional `setP2pToolsActive(pi, enabled)` call in `registerP2pCouncil` is removed; it
  activates the tools while disconnected, which is the behavior being fixed.
- Tools remain **registered** unconditionally at extension load. Only activation changes. Restored
  history keeps its renderers.
- Not a breaking change for users: with the feature disabled the observable behavior is identical,
  and with it enabled the tools appear as soon as a council is joined.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-council-tools`: the existing "Tool behavior while disconnected" requirement assumes the tools
  are callable while disconnected. Once deactivated they are no longer in `agent.state.tools`, so
  they are not callable at all. That requirement is narrowed to the residual races where a call can
  still land without a connection, and a new requirement covers activation gating and prompt
  invisibility.

## Impact

- `src/extensions/p2p-council/p2p-council.extension.ts` — move the reconcile into the inner
  `session_start` handler where `state` is non-optional; drop the `enabled`-only activation.
- `src/extensions/p2p-council/modal/create-council-layer.ts` and `modal/council-detail-layer.ts` —
  signal the connection transition after a successful create/join/disconnect.
- `src/extensions/p2p-council/modal/open-p2p-council-modal.ts` — thread the transition callback to
  the layers so UI code does not need an `ExtensionAPI` handle.
- `openspec/specs/p2p-council-tools/spec.md` — modified requirements.
- No change to `p2p-council-config`, `p2p-council-networking`, `p2p-council-command`, or the status
  widget. No protocol, registry, or wire-format change. No configuration schema change.

### Out of scope

- The stale `activation` guard when `p2p_council.enabled` flips false→true within a single extension
  instance. Reload is unaffected (fresh instance plus `globalThis` service recovery), and the
  naive fix re-registers event handlers into Pi's handler lists, duplicating the vim keybinding.
  Fixing it correctly requires splitting `activateP2pCouncil` into register-once and rebind halves,
  which is its own change.
- Any idle-gating of the tool-list write (`waitForIdle`, `agent_settled` deferral, or refusing to
  connect while the agent is running). See `design.md` for why the runtime makes this unnecessary.
