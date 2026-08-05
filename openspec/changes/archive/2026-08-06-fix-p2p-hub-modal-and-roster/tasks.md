## 1. Configuration and Presentation

- [x] 1.1 Add the `p2p_hub.layout` inline/overlay enum to full and partial configuration schemas with `inline` as the default, and extend config-loader tests for defaults, overrides, and invalid values.
- [x] 1.2 Pass the latest resolved p2p-hub layout into modal presentation for both command and Vim-event entry points, replacing the hardcoded overlay selection.
- [x] 1.3 Regenerate `assets/config.schema.json` and document the layout option and default in README configuration examples.

## 2. Shared Modal Text-Layer Support

- [x] 2.1 Extend the modal-layer contract with a generic text-focused/raw-input policy that preserves navigation-first behavior by default.
- [x] 2.2 Update `ModalDialog` routing so a text-focused top layer receives every key except shell-reserved Esc before tab cycling and Vim navigation, while the layer owns Enter submission.
- [x] 2.3 Propagate dialog focus to active focusable layers across focus changes, layer pushes, and layer pops so embedded inputs support cursor and IME positioning.
- [x] 2.4 Add shared modal tests proving normal layers retain Vim navigation, text-focused layers receive `j/k/g/q` and Enter raw, Esc pops them, and focus follows the active layer.

## 3. Hub List and Create Flow

- [x] 3.1 Make hub-list row rendering consume the selected flag, using an accent cursor/text for the active option, equal-width non-selected indentation, and independent success styling for the connected marker.
- [x] 3.2 Add a pushed create-hub layer with an embedded single-line input, busy state, trimming/validation, Enter-to-create, Esc-to-return, and inline duplicate/startup errors.
- [x] 3.3 Replace the native `ctx.ui.input()` create handoff and modal completion action with the pushed create layer, retaining the current configured frame and presentation throughout.
- [x] 3.4 Refresh the root hub list and connected title/state after successful creation without closing and remounting the custom modal.
- [x] 3.5 Expand hub modal tests to verify selected styling, inline and overlay layout forwarding, printable Vim letters in names, Esc cancellation, duplicate errors, and successful in-modal creation.

## 4. Join Handshake and Explicit Topology

- [x] 4.1 Change the welcome protocol to carry the assigned joiner name, explicit host identity, explicit existing-client identities, and statuses; update parsing fixtures and protocol tests.
- [x] 4.2 Keep client joins pending after WebSocket open and resolve success only after the welcome payload has been fully applied.
- [x] 4.3 Add a bounded welcome-handshake timeout and ensure pre-welcome close, error, disposal, invalid payload, and timeout paths close the partial socket and restore disconnected state.
- [x] 4.4 Refactor roster entries to use `role: host | client` plus `isSelf`, and populate correct topology for hosts, clients, new-member notifications, disconnects, and promotion/rejoin flows.
- [x] 4.5 Extend state tests to assert that `await joinHub()` returns an initialized roster without sleeps, host/client roles and self flags are correct with multiple clients, and missing welcome fails cleanly.

## 5. Live Detail and Tool Output

- [x] 5.1 Make connected hub detail rendering derive host/client groups from the live local roster on each render while retaining cached peek snapshots for unjoined hubs.
- [x] 5.2 Ensure state changes request a render while a detail layer is open; add explicit subscription and cleanup only if the existing UI update path does not provide that guarantee.
- [x] 5.3 Update `p2p_ls` human output and structured details to report actual host/client roles and a separate local/self marker.
- [x] 5.4 Add detail-layer tests for immediate correct post-connect grouping and live joins/leaves/status changes without reopening, plus tool tests for host-side and client-side role/self output.

## 6. Verification

- [x] 6.1 Run the p2p-hub and shared modal test suites and resolve regressions, including promotion and messaging behavior under the new roster model.
- [x] 6.2 Run repository type checking, linting, schema generation consistency checks, and the full test suite.
- [x] 6.3 Mirror or record the generic text-focused modal enhancement for upstream pi-qol so the vendored modal libraries do not silently diverge.
