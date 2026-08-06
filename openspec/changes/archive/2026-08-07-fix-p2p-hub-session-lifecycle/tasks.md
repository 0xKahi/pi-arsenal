## 1. Process-Scoped Service Foundation

- [x] 1.1 Add a package-specific, versioned process-global carrier for resolving, installing, and clearing the authoritative p2p service
- [x] 1.2 Refactor `P2pHubState` runtime-dependent dependencies into an attachable binding with a unique token while leaving transport, role, roster, promotion, and queue state process-scoped
- [x] 1.3 Implement binding attach/detach operations that reject stale runtime callbacks, refresh current context, and force current status propagation

## 2. Runtime Handoff Lifecycle

- [x] 2.1 Add the bounded runtime-handoff timeout constant and timer management, including cancellation on compatible reattachment and clean disposal on expiry
- [x] 2.2 Register `session_shutdown` handling that detaches for reload/new/resume/fork and disposes immediately for final quit
- [x] 2.3 Update lazy activation so each runtime registers surfaces once while reusing the compatible process-scoped service instead of constructing disconnected duplicate state
- [x] 2.4 Make a disabled replacement runtime detect and deliberately dispose a preserved service, while retaining zero network/filesystem activity for processes that were always disabled
- [x] 2.5 Restore the connected widget and current roster immediately when an enabled TUI runtime attaches, and clear only the old runtime's UI during handoff

## 3. Detached Message and Prompt Behavior

- [x] 3.1 Preserve both trigger-turn and steer-only inbound chat messages received while detached and drain them in order through the replacement binding
- [x] 3.2 Return a temporary-runtime-unavailable prompt response for remote prompt requests received while detached
- [x] 3.3 Terminate outgoing pending asks and incoming runtime-owned prompt work with a runtime-replaced error during detach, and clear all retained queues on final disposal

## 4. Lifecycle Test Coverage

- [x] 4.1 Extend the extension test harness with independent runtime instances, `session_shutdown` reasons, process-global carrier reset, and fake handoff timers
- [x] 4.2 Test that a hosted hub preserves its socket, port, registry ownership, role, name, and membership without churn across reload
- [x] 4.3 Test that a client preserves its connection, assigned name, role, and roster without duplicate membership across new, resume, and fork transitions
- [x] 4.4 Test replacement context/status refresh and immediate widget restoration using only the new runtime's API and UI references
- [x] 4.5 Test detached chat queuing, detached prompt rejection, and cancellation of runtime-owned pending prompt operations
- [x] 4.6 Test handoff-timeout cleanup, disabled replacement cleanup, final quit cleanup, and the absence of ghost registry entries or transports

## 5. Verification

- [x] 5.1 Run the focused p2p-hub state, extension, tools, modal, and widget test suites and resolve lifecycle regressions
- [x] 5.2 Run the repository typecheck and full test suite
- [x] 5.3 Validate `fix-p2p-hub-session-lifecycle` with strict OpenSpec validation
