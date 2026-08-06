## Why

`P2pHubState` uses `role` for the transport relationship of a member (`host`, `client`, or `disconnected`), which can be confused with an agent's functional role or identity. Naming this concept `connectionType` makes the state model and exposed roster data accurately communicate what the value represents.

## What Changes

- Rename the p2p hub state concept and related APIs from `role`/`P2pRole` to `connectionType`/`P2pConnectionType`.
- Rename the per-member roster property from `role` to `connectionType` while preserving the `host` and `client` values and independent `isSelf` marker.
- **BREAKING**: Rename the structured `p2p_ls` member detail field from `role` to `connectionType`.
- Update p2p hub UI consumers, tests, and terminology to use connection type consistently without changing connection, routing, promotion, or display behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-hub-networking`: Define host/client/disconnected as connection types in the state and roster contract rather than agent roles.
- `p2p-hub-tools`: Rename the structured `p2p_ls` member field to `connectionType` while keeping the human-readable host/client classification.

## Impact

Affected areas include `P2pHubState`, `P2pRosterEntry`, the p2p detail modal, `p2p_ls` rendering and structured results, and related unit tests. The structured `p2p_ls` result and TypeScript state/roster APIs receive a breaking field/type rename; wire protocol values and runtime behavior remain unchanged.
