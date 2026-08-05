# Tasks: add-p2p-hub

## 1. Foundations (config, deps, vendored modal lib)

- [x] 1.1 Add `ws` and `yaml` dependencies to package.json
- [x] 1.2 Create `src/schemas/p2p-hub.config.schema.ts` (`enabled: boolean` default `false`, full + partial schemas following tmux-popup pattern)
- [x] 1.3 Wire `p2p_hub` into `src/schemas/config.schema.ts` (ConfigSchema, ConfigPartialSchema) and `ConfigLoader.mergeConfig`
- [x] 1.4 Vendor `pi-qol/src/libs/modal` into `src/libs/modal/` unchanged (preserve fork-attribution headers)
- [x] 1.5 Port the modal library's self-containment/dependency-audit test into this repo's test suite

## 2. Identity & registry

- [x] 2.1 Implement identity resolution: parse `<cwd>/.arsenal/p2p-role.yml` (`name`, `description`), fallback `basename(cwd)`, no upward traversal; unit tests for present/absent/partial/invalid YAML
- [x] 2.2 Implement hub registry module: `~/.arsenal/p2p-hubs/<name>.json` read/list, atomic write (temp + rename), delete; entry shape `{name, port, hostPid, createdAt}`
- [x] 2.3 Implement staleness validation (hostPid liveness check + WebSocket connect probe) with pruning; unit tests for stale/live/orphaned entries

## 3. Wire protocol & hub server

- [x] 3.1 Define protocol message types (register, welcome, terminal_joined/left, chat, prompt_request/response, status_update, error, peek/peek_response) with `model` and `description` fields on identity-bearing messages
- [x] 3.2 Implement hub server: create on ephemeral port, client registration with name dedup (`-2` suffix), roster broadcast on join/leave, status_update fan-out, keepalive, registry entry write on listen / delete on clean shutdown
- [x] 3.3 Implement peek handling on the hub: roster response without membership, no join/leave events to members; tests asserting member invisibility
- [x] 3.4 Implement client connection: connect to registry port, register with resolved identity + model + context snapshot, handle welcome/joined/left/status messages
- [x] 3.5 Implement local status tracking (agent_start/end, tool_execution events → idle/thinking/tool:<name>) and push status_update including model and context usage
- [x] 3.6 Tests: hub↔client integration (join, roster, dedup, status propagation, clean shutdown registry removal)

## 4. Promotion

- [x] 4.1 Implement host-death detection on clients (socket close without manual disconnect) and jittered promotion race: bind the registry-recorded port, winner rewrites registry entry (new hostPid, same name/port), losers reconnect as clients
- [x] 4.2 Implement retry loop for the rare both-fail race (connect-first, then bind, then delayed retry — pi-link `initialize()` rhythm)
- [x] 4.3 Tests: promotion with 2+ clients (single winner, stable name/port, registry updated), manual disconnect does not promote

## 5. Tools

- [x] 5.1 Implement `p2p_send`: targeted chat delivery, `triggerTurn` flag, idle-gated batched inbox on receiver (batch caps), unknown-target error listing members
- [x] 5.2 Implement `p2p_ask`: prompt RPC with pending-response map, inactivity + hard-ceiling timeouts, error results naming target and elapsed time
- [x] 5.3 Implement `p2p_ls`: roster formatting with role, model, status+duration, cwd, description, numeric context (`45K/272K (17%)`) and progress bar
- [x] 5.4 Implement disconnected-state behavior for all three tools (polite error referencing `/p2p-hub`)
- [x] 5.5 Tests: tool behaviors including triggerTurn batching, ask timeout, disconnected errors

## 6. /p2p-hub modal

- [x] 6.1 Implement hub list view: `ListTab` with available hubs (stale pruned), current hub marked `(connected)`, `create new` entry, vim scheme
- [x] 6.2 Implement hub detail layer: peek snapshot for unjoined hubs, live local state for the connected hub; render host/clients blocks (name, model, context bar, status, description, cwd) with connect/disconnect actions (connect switches hubs if already connected elsewhere)
- [x] 6.3 Implement create-hub flow: name input, Enter creates + connects, duplicate-name error. DEVIATION from original plan (see design.md D7 addendum): implemented as a native `ctx.ui.input()` dialog opened after the list dialog closes with `{action:'create'}`, rather than a pushed in-dialog text layer - VimNavigationScheme intercepts printable letters as navigation before a pushed layer's `handleInput` ever runs, so raw text entry cannot coexist with it in the same dialog
- [x] 6.4 Register `/p2p-hub` command and `PI_VIM_KEY_EVENT_ID` listener (context-view pattern: `latestCtx`, enabled guard)
- [x] 6.5 Tests: modal navigation (j/k/Enter/Esc, layer push/pop), create-flow dialog handoff, stale hub exclusion, peek-driven detail view

## 7. Status widget

- [x] 7.1 Implement context-usage bar renderer (`[###-----------] 17%`) shared by widget, modal, and `p2p_ls`
- [x] 7.2 Implement status box component: bordered `p2p-hub` frame, per-member rows (status dot, name, model, usage bar), member count in bottom border
- [x] 7.3 Wire visibility: `setWidget(key, factory, {placement: 'belowEditor'})` on connect, `setWidget(key, undefined)` on disconnect/dissolution; re-render on roster/status/context changes; never touch `setFooter`
- [x] 7.4 Tests: appears/disappears with connection state, live row updates, no footer interaction

## 8. Lazy activation & lifecycle

- [x] 8.1 Implement `registerP2pHub` bootstrap (session_start listener only) + one-time `activateP2pHub(initialCtx)` per the lazy-loading pattern (seed `latestCtx`, once-per-process flag)
- [x] 8.2 Add runtime `isEnabled()` guards to every handler, tool, command, and event listener
- [x] 8.3 Implement disable-after-activation cleanup: on disabled session_start with a live connection, disconnect (shut down server if hosting → clients promote) and clear the widget
- [x] 8.4 Register the sub-extension in root `index.ts`
- [x] 8.5 Tests: nothing observable while disabled-before-activation, activation on first enabled session, guards + active disconnect on mid-process disable

## 9. Polish & verification

- [x] 9.1 Organize all new test suites per the test-suite-organization spec
- [x] 9.2 Update README/CHANGELOG with p2p_hub usage (config, `p2p-role.yml`, tools, `/p2p-hub`, status box) - added README section, `.changeset/p2p-hub-network.md`, and regenerated `assets/config.schema.json`
- [ ] 9.3 Manual end-to-end check: two pi sessions — create hub, join, `p2p_ls`, `p2p_send` (both triggerTurn modes), `p2p_ask`, peek from a third session, kill host and observe promotion, disconnect and observe widget removal (requires a live two-terminal pi session; not run in this automated pass)
