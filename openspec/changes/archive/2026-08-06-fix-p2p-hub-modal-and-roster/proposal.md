## Why

The p2p-hub modal currently changes from an overlay browser to an inline native input during hub creation, does not visually identify the navigated list option, and renders an incomplete and incorrectly classified roster immediately after connecting. These defects make the primary hub-management interface misleading and expose a deeper mismatch between connection readiness, network roles, and self-identification.

## What Changes

- Add `p2p_hub.layout` configuration with `inline` and `overlay` values, defaulting to `inline`.
- Keep the create-name interaction inside the configured custom modal layout by adding a text-focused modal layer that bypasses Vim navigation for printable input while retaining Enter-to-submit and Esc-to-return behavior.
- Render the currently navigated hub-list option with a distinct cursor and accent styling.
- Treat a client join as successful only after the hub's welcome handshake has initialized the assigned identity and roster.
- Make host and client topology explicit in the welcome handshake and local roster while representing “this agent” separately from its network role.
- Render connected hub details from live local roster state so membership and status changes appear without closing and reopening the modal.
- Correct `p2p_ls` role output so every member is reported as `host` or `client`, with self indicated independently.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-hub-config`: Add the configurable modal layout and its default.
- `p2p-hub-command`: Require consistent configured layout through hub creation, visible list selection, text-focused create input, and live/correct detail rosters.
- `p2p-hub-networking`: Define join readiness at completion of the welcome handshake and preserve explicit host/client topology in roster state.
- `p2p-hub-tools`: Correct member role reporting while retaining a separate self marker.

## Impact

Affected areas include the p2p-hub configuration schemas and generated JSON schema, modal presenter/list/create layers, shared modal input and focus routing, WebSocket welcome protocol, `P2pHubState` join and roster representation, `p2p_ls` rendering/details, documentation, and p2p-hub modal/network/tool tests. The welcome message shape is an internal wire-protocol change between local extension instances; interoperability with older p2p-hub instances is not guaranteed.
