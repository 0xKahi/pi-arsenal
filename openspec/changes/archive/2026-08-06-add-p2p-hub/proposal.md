# Proposal: add-p2p-hub

## Why

Pi agents running in separate terminals have no way to communicate with each other. The pi-link extension (reference: `/Users/kahi/Desktop/code/editor_extras/pi_plugins/pi-link`) proves the hub-and-spoke model works, but it supports only a single global network on a fixed port, has no agent descriptions or model visibility, and its UX (naming, status indicator, connection flow) does not fit pi-arsenal's conventions. We want first-class multi-agent coordination inside pi-arsenal: multiple isolated communication networks ("hubs"), a modal-driven connection UX, richer agent identity, and a clean status widget.

## What Changes

- New `p2p_hub` sub-extension in pi-arsenal providing pi-to-pi communication over localhost WebSockets using a hub-and-spoke model (adapted from pi-link).
- Three new agent tools, registered when `p2p_hub` is enabled in config (lazy-loading pattern):
  - `p2p_send` — fire-and-forget message to another agent, optional `triggerTurn: true` to kick off the remote LLM.
  - `p2p_ask` — synchronous RPC: send a prompt to another agent and wait for its assistant reply.
  - `p2p_ls` — list connected agents with name, model, status (idle/thinking/tool:...), cwd, description, and context usage.
- Multiple named hubs: each hub is its own WebSocket server on its own port, discovered via a per-user registry at `~/.arsenal/p2p-hubs/<name>.json` (unlike pi-link's single hardcoded port 9900).
- Hub host death triggers client promotion: remaining clients race to re-bind the hub's port; the winner becomes the new host and the hub name/port stay stable.
- Agent identity: name defaults to `basename(cwd)`; users can override name and add a description via `<cwd>/.arsenal/p2p-role.yml`. Model name and description are carried on the wire (pi-link does not send these).
- New `/p2p-hub` command opening a vim-navigable modal (built on the pi-qol modal library): list available hubs + current connection, peek into hub details (host/clients with full identity), connect/disconnect, and create a new hub. Supports the `PI_VIM_KEY_EVENT_ID` event for external key-event triggering.
- Connection is manual-only via the modal; no auto-connect at startup.
- Status widget rendered via `setWidget` with `belowEditor` placement (never touches `setFooter`, so custom footers from other plugins are unaffected). Shows connected agents with model and context usage as a loading bar (`[###----] 17%`); visible only while connected to a hub.
- New `p2p_hub` config section (default `enabled: false`) merged through the existing global/project config loader.

## Capabilities

### New Capabilities

- `p2p-hub-networking`: hub lifecycle (create/host/join/leave), per-hub WebSocket servers, hub registry with staleness detection, host-death promotion, wire protocol (register/welcome/chat/prompt/status/peek), and agent identity resolution (`p2p-role.yml`, defaults, dedup).
- `p2p-hub-tools`: the `p2p_send`, `p2p_ask`, and `p2p_ls` agent tools, including disconnected-state behavior, triggerTurn/idle-gated inbox delivery, and RPC timeouts.
- `p2p-hub-command`: the `/p2p-hub` modal command — hub list view, hub detail (peek) view, create-hub view, vim navigation, and `PI_VIM_KEY_EVENT_ID` handling.
- `p2p-hub-status-widget`: the below-editor status box rendering connected agents, models, and context-usage bars, shown only while connected.
- `p2p-hub-config`: config schema (`p2p_hub.enabled`), lazy activation on first enabled session, runtime guards, and active hub disconnect when disabled mid-process.

### Modified Capabilities

<!-- none — existing specs (test-suite-organization, tmux-popup, tmux-popup-test-organization) are unaffected -->

## Impact

- **New code**: `src/extensions/p2p-hub/` (constants already scaffolded: `COMMAND_NAME`, `PI_VIM_KEY_EVENT_ID`).
- **Modified code**: `src/schemas/config.schema.ts` (+ new `p2p-hub.config.schema.ts`), `src/config/config-loader.ts` (`mergeConfig`), `index.ts` (register the sub-extension bootstrap).
- **Vendored library**: copy of the pi-qol modal library (`pi-qol/src/libs/modal`) into this repo (designed to be copied verbatim; self-contained with dependency-audit test).
- **New dependencies**: `ws` (WebSocket server/client, as used by pi-link), a YAML parser for `p2p-role.yml`.
- **Filesystem**: reads `<cwd>/.arsenal/p2p-role.yml`; reads/writes `~/.arsenal/p2p-hubs/<name>.json` registry files.
- **Network**: localhost-only (`127.0.0.1`) WebSocket servers on ephemeral ports, one per hub.
- **Tests**: new test suites for protocol, registry, promotion, identity resolution, config gating, and modal views following the repo's test-suite-organization spec.
