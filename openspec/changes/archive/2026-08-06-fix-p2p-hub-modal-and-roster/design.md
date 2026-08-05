## Context

See `proposal.md` for motivation and the delta specs for observable behavior. The hub browser is a custom `ModalDialog` using `VimNavigationScheme`; its layer stack currently routes navigation before raw input and has no focus contract for an embedded `Input`. Hub creation therefore exits the custom overlay and uses native `ctx.ui.input()`. The hub list already receives a selected flag through `ListTab`, but its row renderer ignores it.

On the network side, a client currently resolves `joinHub()` when the WebSocket transport opens, before `welcome` assigns the final name and initializes membership. The local roster type uses mutually exclusive `host | client | you` values even though topology and self-identification are independent dimensions. The welcome message supplies a flat ordered member list, and the detail layer caches rendered lines, producing incorrect host selection and stale membership.

The modal library is vendored verbatim from pi-qol today. This change intentionally introduces a small generic enhancement that can be carried back to the source library rather than implementing a p2p-specific input-routing exception.

## Goals / Non-Goals

**Goals:**
- Preserve one inline or overlay custom-modal interaction across list, detail, and name-entry layers.
- Give text-focused layers predictable raw-input ownership and correct focus/IME behavior.
- Define “joined” as an application-level handshake state rather than merely an open transport.
- Represent network topology and local identity without overloading one field.
- Keep connected detail rendering live while retaining snapshot semantics for peeked hubs.

**Non-Goals:**
- Supporting arbitrary forms or multiple simultaneous focused controls in the modal shell.
- Maintaining wire compatibility with unreleased or older p2p-hub protocol instances.
- Changing hub discovery, promotion, routing, or the configured overlay geometry.
- Adding automatic connection or persistence behavior.

## Decisions

### D1: Add a generic text-focused layer input policy

Extend the modal-layer contract with an explicit input policy, defaulting to the existing navigation-first behavior. When the active top layer is text-focused, `ModalDialog` SHALL reserve Esc for shell dismissal and route every other key directly to the layer before tab cycling or `NavigationScheme.consume()`. The layer owns Enter submission and forwards editing keys and printable characters to its embedded `Input`.

This ensures `j`, `k`, `g`, and `q` are text without weakening Vim behavior elsewhere. Detecting only Esc at the shell boundary is deliberate: running the key through `VimNavigationScheme` would incorrectly turn `q` into dismiss. A p2p-specific bypass inside the hub dialog was rejected because raw-input ownership is a reusable modal concern.

The modal shell will propagate its focused state to the active focusable layer, update focus when layers are pushed or popped, and continue propagating focus to its existing filter input. This follows Pi's container-with-embedded-input requirement for cursor and IME positioning.

### D2: Implement hub creation as a pushed layer

Replace the `{ action: 'create' }` completion/native-input handoff with a `CreateHubLayer` containing a Pi TUI `Input`. Selecting `create new` pushes this layer in the existing dialog, so the presenter and configured frame do not change. Esc pops back to the same list. Enter trims and validates the name, performs creation asynchronously with a busy state, renders duplicate/startup errors in place, and on success transitions the modal back to connected hub state rather than mounting another UI surface.

The root list must be refreshable after successful creation so the new connected hub can be shown and selected. The create-layer completion callback will refresh registry-backed items and pop the layer (or otherwise replace it with the connected detail using shell services); the exact internal method can follow the least invasive layer-stack API as long as the observable flow remains in one modal.

A second custom modal was rejected because it would discard list selection/layer state and make Esc reconstruction more complex. Native `ctx.ui.input()` was rejected because it cannot inherit the custom overlay layout.

### D3: Resolve layout at each modal invocation

Add a shared `inline | overlay` schema value to `p2p_hub`, defaulting to `inline`, and pass the value into `presentModal`. Resolve it from the same latest trusted/global configuration used by runtime enablement whenever the command or Vim event opens the modal. This permits configuration changes across sessions without baking layout into activation-time state.

The generated JSON schema and README are outputs of the source schema/documentation contract and must be updated together.

### D4: Use selected-aware row rendering

Consume the selected boolean already supplied by `ListTab`. Selected rows receive an accent cursor and accent label; unselected rows receive equal-width indentation. The connected suffix retains success styling so selection and connection remain visually independent. No changes to `ListNavigator` or key handling are required.

### D5: Make the welcome handshake explicit and authoritative

Change the welcome payload from an implicitly ordered flat member list to explicit host and client identities plus statuses and the joiner's assigned name. The host emits this payload only after registering and deduplicating the joining client.

`connectAsClient()` will keep a join attempt pending after transport open. It resolves success only when a valid welcome has been applied. Close, socket error, disposal, or a handshake timeout before welcome resolves failure and cleans up the partial socket and state. The timeout will use a dedicated bounded constant rather than allowing a peer that accepts TCP/WebSocket but never welcomes to hang the command.

`handleIncoming(welcome)` remains the single place that applies the authoritative assigned name, topology, statuses, notifications, and initial status push; the connection attempt is completed immediately after that application. This avoids duplicating handshake state mutation in socket callbacks.

Resolving on WebSocket `open` was rejected because it exposes a connected role with an empty roster and makes every caller invent a delay.

### D6: Separate topology role from self-identification

Change local roster entries to contain:

```text
role: host | client
isSelf: boolean
```

For a host, the local member is `{ role: host, isSelf: true }` and connected peers are clients. For a client, the welcome host is `{ role: host, isSelf: false }`, the local member is `{ role: client, isSelf: true }`, and all other members are clients. Member-joined messages always add clients; promotion rebuilds state through the host path.

Modal grouping uses `role` only. Human and structured `p2p_ls` output uses `role` for topology and `isSelf` for the `(you)` marker/boolean. This removes the impossible state where `you` substitutes for `client`.

### D7: Derive connected detail content from live state

Keep asynchronous cached lines for an unjoined hub's immutable peek result. When the viewed entry is the currently connected hub, derive the roster grouping from `state.getRoster()` during render rather than retaining the lines produced when the layer opened or connection toggled. Connected detail layers subscribe to state changes and request a TUI render so membership, roles, statuses, and context update immediately; modal-layer disposal unregisters that subscription.

After connecting, the handshake-complete join guarantee ensures the first connected render is already authoritative. Dynamic rendering remains simpler for the small roster, while the explicit subscription and disposal lifecycle guarantees that state changes render even when the surrounding widget path does not.

## Risks / Trade-offs

- [Text-focused routing changes the shared vendored modal library] → Keep navigation-first as the default, add focused tests for routing/focus, and mirror the generic enhancement back to pi-qol when practical.
- [A peer from an older extension version sends the former welcome shape] → Treat it as an invalid/incomplete handshake and fail within the timeout; this feature has no compatibility requirement with pi-link or older p2p protocol versions.
- [Async creation finishes after the user tries to dismiss] → Mark the layer busy, define deterministic Esc behavior during work, and guard callbacks against completing a disposed dialog.
- [Dynamic detail rendering depends on state changes requesting a TUI render] → Add an integration-style test that holds the detail open through a join/status change; if widget updates do not guarantee a render, expose a lightweight state-change subscription with explicit layer cleanup rather than reverting to cached content.
- [Handshake timeout values can reject a severely stalled local host] → Use a conservative local timeout and surface a descriptive connection failure; localhost registration should normally complete immediately.
- [ANSI styling is invisible in existing identity-theme tests] → Add a recording theme or assert ANSI/theme calls so selection behavior is actually covered.

## Migration Plan

1. Ship source config schema, generated schema, modal behavior, protocol, and consumers atomically in one package version.
2. Existing configurations continue to parse and receive the new `inline` default; users wanting current floating behavior set `p2p_hub.layout: overlay`.
3. Existing live hubs should be restarted after upgrading so every participant uses the explicit welcome payload.
4. Rollback restores the former package; `layout` will be ignored or rejected by the older schema and may need removal from configuration.
