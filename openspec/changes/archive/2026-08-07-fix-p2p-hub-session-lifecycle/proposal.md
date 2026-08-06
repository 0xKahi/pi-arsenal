## Why

A p2p hub connection currently outlives the extension runtime that created it when Pi reloads extensions or replaces the current session without exiting the process. The replacement runtime creates a disconnected `P2pHubState` while the old WebSocket transport and registry entry can remain live under the same PID, leaving Pi unaware of its own existing membership and potentially creating ghost hosts or clients.

## What Changes

- Make p2p hub connectivity explicitly process-scoped while keeping extension APIs, session context, event handlers, and UI bindings runtime-scoped.
- Preserve the connected hub, host/client role, assigned member name, roster, transport sockets, and queued inbound messages across `/reload` and same-process new, resume, and fork session transitions.
- Rebind each replacement extension runtime to the existing process-scoped connection and immediately restore connected tool, command, status, and widget behavior.
- Define safe behavior during the short interval when transport exists without an attached session runtime, including message queuing and temporary rejection of remote prompt execution.
- Ensure deliberate disable, manual disconnect, and Pi process exit still tear down connectivity according to existing semantics, without leaking ghost transports or registry entries.
- Add lifecycle tests covering both hosted and client connections across every Pi runtime-replacement reason.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-hub-networking`: Define process-scoped connection ownership, preservation across extension runtime replacement, runtime rebinding, detached-runtime message handling, and final process teardown.
- `p2p-hub-config`: Clarify that lazy activation is once per extension runtime while reusing any process-scoped p2p service, and retain deliberate disconnect when configuration becomes disabled.
- `p2p-hub-status-widget`: Require a replacement TUI runtime to restore the connected widget immediately from preserved process-scoped state.

## Impact

- Primarily affects `src/extensions/p2p-hub/p2p-hub.extension.ts` and `src/extensions/p2p-hub/p2p-hub-state.ts`, with likely introduction of a process-lifetime service or runtime-binding abstraction.
- Extends p2p extension lifecycle tests to model `session_shutdown` and replacement `session_start` events for reload, new, resume, and fork transitions.
- Does not change the localhost WebSocket protocol, registry file format, tool schemas, command syntax, or configuration schema.
- Changes internal lifecycle ownership and cleanup behavior; no user-facing breaking change is intended.
