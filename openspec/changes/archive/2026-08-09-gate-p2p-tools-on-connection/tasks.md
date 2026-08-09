# Tasks

## 1. Move the gate into the activated runtime

- [x] 1.1 In `src/extensions/p2p-council/p2p-council.extension.ts`, change `setP2pToolsActive` usage so the desired state is `enabled && connected` rather than `enabled` alone; keep the existing try/catch and no-op-when-unchanged behavior.
- [x] 1.2 Add the reconcile to the inner `session_start` handler inside `activateP2pCouncil` (next to `state.refreshRuntime(bindingToken)`), using the non-optional `state` in scope.
- [x] 1.3 Remove the unconditional `setP2pToolsActive(pi, enabled)` call from `registerP2pCouncil`'s `session_start` handler. Explicitly deactivate the tools in the `enabled: false` branch before `disposePreservedService`, because no activated-runtime reconcile exists in that branch.
- [x] 1.4 Update the block comment above `registerP2pCouncil` so it describes activation as connection-gated rather than config-gated, and keeps the existing rationale for eager tool registration.

## 2. Document the non-obvious constraints

- [x] 2.1 Comment the reconcile: Pi force-activates every extension tool in `_buildRuntime` via `_refreshToolRegistry({ includeAllExtensionTools: true })` at both startup and `/reload`, *before* `session_start` is emitted, so this handler is what re-establishes the invariant. Not redundant.
- [x] 2.2 Comment the explicit activate/deactivate calls: no idle gating is needed because the agent loop snapshots its context per run and both builds the payload and dispatches tool calls from that snapshot, so a call can only be emitted from a payload that contained the tool.
- [x] 2.3 Add a comment in `index.ts` noting that the config-init `session_start` handler must stay registered before `registerP2pCouncil`, since Pi runs handlers in registration order and the reconcile reads config.

## 3. Wire the user transitions

- [x] 3.1 Add an optional `onConnectionChange?: (connected: boolean) => void` parameter to `openP2pCouncilModal` and thread it to the create and detail layers.
- [x] 3.2 In `modal/create-council-layer.ts`, invoke the callback with `true` after `createCouncil` reports success, and not on failure.
- [x] 3.3 In `modal/council-detail-layer.ts`, invoke the callback with `true` after a successful `joinCouncil` and with `false` after `disconnect('manual')`; do not invoke it when a join fails.
- [x] 3.4 In `activateP2pCouncil`, pass a callback that applies the same activation helper used by the reconcile, so both paths share one code path.

## 4. Tests

- [x] 4.1 In `test/extensions/p2p-council/p2p-council.extension.test.ts`, assert the p2p tools are inactive after a session start with `enabled: true` and no connection.
- [x] 4.2 Assert the tools are active after a session start when a connected process-scoped service already exists (the reload/fork/resume case).
- [x] 4.3 Assert the reconcile removes the tools when the session starts with them pre-activated, simulating Pi's `includeAllExtensionTools` behavior.
- [x] 4.4 Assert the tools remain inactive when `enabled: false`, regardless of connection state.
- [x] 4.5 Assert a create-council transition activates the tools and a manual disconnect deactivates them, with no duplicate entries in the active-tools list across repeated connect/disconnect cycles.
- [x] 4.6 Assert a failed join leaves the tools inactive.
- [x] 4.7 Assert the tools stay active while the state is disconnected due to host loss and promotion retry, confirming activation is not derived from `isConnected()` alone.
- [x] 4.8 Add or update a modal-layer test covering that the connection callback fires on success and does not fire on failure.

## 5. Verify

- [x] 5.1 Confirm the tools remain registered while inactive so restored history still renders p2p tool calls with their own renderers.
- [x] 5.2 Run the full test suite and the project's lint/format check.
- [x] 5.3 Run `openspec validate --change gate-p2p-tools-on-connection --strict`.
