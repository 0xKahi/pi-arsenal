# Design: add-p2p-hub

## Context

See `proposal.md` — Why. Key constraints shaping the approach:

- **pi-link as the base** (`/Users/kahi/Desktop/code/editor_extras/pi_plugins/pi-link/index.ts`, ~1,900 lines): proven hub-and-spoke model over `ws` on `127.0.0.1`, JSON message protocol (`register`, `welcome`, `terminal_joined/left`, `chat`, `prompt_request/response`, `status_update`, `compact_*`, `error`), idle-gated batched inbox for `triggerTurn` messages, prompt RPC with inactivity (90s) and hard-ceiling (30min) timeouts, hub-side name dedup (`name-2`). We adapt this, we do not depend on it.
- **Pi widget API reality**: `setWidget` supports only `aboveEditor | belowEditor` placement; `belowEditor` renders **between the editor and the footer** (verified in `interactive-mode.js`). Rendering literally below the footer requires `setFooter`, which would clobber other plugins' custom footers — explicitly forbidden. Decision: `belowEditor` is the placement.
- **Modal library**: `pi-qol/src/libs/modal` is self-contained (imports only Pi host packages) and designed to be vendored verbatim, with a dependency-audit test. Provides `ModalDialog`, `presentModal`, `VimNavigationScheme`, `ListTab`, layer stack (`pushLayer`), `PreviewLayer`, `ListNavigator`.
- **Repo conventions**: sub-extensions live in `src/extensions/<name>/`; config via zod schemas in `src/schemas/` merged by `ConfigLoader` (global + trusted-project); `p2p-hub/constants.ts` already scaffolds `COMMAND_NAME = 'p2p-hub'` and `PI_VIM_KEY_EVENT_ID = piVimKeyEventId('p2p_hub')`.
- **Lazy-loading pattern** (llm-wiki `pi-extensions/personal-extension-format/lazy-loading.md`): bootstrap `session_start` listener, one-time activation, seeded `initialCtx`, runtime `isEnabled()` guards, no teardown (Pi cannot unregister handlers).

## Goals / Non-Goals

**Goals:**
- Multiple isolated, named hubs on one machine with manual connect/disconnect.
- Hub continuity through host death (promotion) with stable hub name and port.
- Zero interference with other plugins' footers or widgets.
- Follow existing pi-arsenal config, constants, and test-organization conventions.

**Non-Goals:**
- Cross-machine networking (localhost only, like pi-link).
- Auto-connect / reconnect-on-startup persistence (manual-only for v1).
- Remote compaction support (`compact_*` messages from pi-link) — dropped from v1 protocol.
- Authentication/encryption between agents (localhost trust model).
- Backwards compatibility or interop with pi-link's protocol or port 9900.

## Decisions

### D1: Server-per-hub with a file registry (over a multiplexing room daemon)

Each hub is its own `WebSocketServer` on `127.0.0.1` with an OS-assigned ephemeral port, hosted by the pi process that created it. Discovery via per-hub registry files.

- *Why*: preserves pi-link's "the host is a pi agent" model (the modal's Host section assumes it); hubs are fully isolated; no daemon lifecycle problem (who runs/restarts a shared daemon, single point of failure for all networks).
- *Alternative considered*: one fixed-port daemon multiplexing named rooms — simpler discovery, but introduces daemon ownership/lifecycle questions and couples all networks to one process.

### D2: Registry at `~/.arsenal/p2p-hubs/<name>.json` — one file per hub

File shape: `{ "name": string, "port": number, "hostPid": number, "createdAt": string }`.

- *Why one-file-per-hub*: with promotion (D3) plus concurrent hubs, a single shared JSON gets read-modify-write races (hub A's clients promoting while hub B cleanly shuts down). Per-hub files make every operation an atomic write-temp-then-rename, replace, or delete.
- *Staleness*: on modal open (and before connect), each entry is validated: `kill -0 hostPid` as a cheap first check, then a WebSocket connect probe; unreachable entries are pruned.
- *Why `~/.arsenal/`*: hubs are localhost-only, so registry is per-user per-machine state; matches the `.arsenal/` naming convention used by `p2p-role.yml`.

### D3: Host death → client promotion race on the same port

When clients detect the hub socket closing (not a manual disconnect), each waits a jittered delay then races to bind the **same port** recorded in the registry. Winner becomes host, atomically rewrites the registry entry with its own `hostPid`, and keeps the hub name; losers reconnect as clients.

- *Why same port*: keeps the registry entry stable — peers and future joiners need no re-discovery; mirrors pi-link's promotion rhythm (jittered `scheduleReconnect`, connect-first-then-bind).
- *Alternative considered*: hub dissolves on host death — simpler, but loses pi-link's resilience and makes long-running agent groups fragile.
- *Race note*: bind-the-port is the mutex; the OS guarantees exactly one winner. Losers' bind fails → they retry connecting as clients.

### D4: Wire protocol = pi-link's protocol, minus compaction, plus identity fields and peek

- `register` gains `description` and `model`; `status_update` gains `model` (model can change mid-session via `/model`). `welcome`/`terminal_joined` carry the full identity roster.
- New `peek` message: a connection may send `{type: "peek"}` instead of `register`; the hub replies with the full roster (host + clients: name, model, context, status, description, cwd) and closes. Peekers are never added to membership, never appear in `p2p_ls` or the status widget.
- `compact_request/response` dropped (non-goal).
- Keep: idle-gated batched inbox for `triggerTurn` sends (batch caps ~20 items / 16K chars), prompt RPC with inactivity + ceiling timeouts, keepalive pings, hub-side name dedup (`-2` suffix).

### D5: Identity resolution

Precedence: `<cwd>/.arsenal/p2p-role.yml` (`name`, `description`) → fallback `name = basename(cwd)`, empty description. Resolved from the literal cwd pi was launched from — no upward directory walking (not all cwds are git repos). Read once at connect time; hub dedups colliding names.

### D6: Lazy activation gated on `p2p_hub.enabled` (default `false`)

Follows the wiki lazy-loading pattern: `registerP2pHub()` installs only a `session_start` bootstrap; the first enabled session runs `activateP2pHub(initialCtx)` once per process, registering the three tools, the `/p2p-hub` command, the `PI_VIM_KEY_EVENT_ID` listener, and widget wiring. Every handler keeps a runtime `isEnabled()` guard.

**p2p-specific extension of the pattern**: if config is disabled after activation, guards alone leave a zombie member visible in other agents' `p2p_ls`. So on the first `session_start` where `isEnabled()` is false *and* a hub connection exists, the extension actively disconnects (and if hosting, shuts the server down, triggering promotion) and clears the widget.

- Tools are **always registered while activated**, and return a polite error (`not connected to a hub — run /p2p-hub to join one`) when disconnected. This keeps tool availability stable for the LLM.

### D7: Modal built on the vendored pi-qol modal library

Vendor `pi-qol/src/libs/modal` into this repo unchanged (it is designed for this; keep fork-attribution headers and add the dependency-audit test). Structure:

- Single `ListTab` root: available hubs (current one marked `(connected)`) + `create new` entry, `VimNavigationScheme`.
- Confirm on a hub → `pushLayer` a **hub detail layer**: peeks the hub (D4) for the roster, renders Host/Clients blocks (name, model, context bar, status, description, cwd) and `[connect]`/`[disconnect]` actions. Live-refreshes for the currently-connected hub from local state; unjoined hubs show the peek snapshot.
- Confirm on `create new` → `pushLayer` a **create layer** with a name input; Enter creates the hub (start server, write registry entry) and connects.
- *Vim vs text-input caveat, resolved during implementation*: the modal shell's `ModalDialog.handleInput` always lets the active `NavigationScheme.consume()` see a key first; only keys the scheme reports as unhandled reach the top layer's `handleInput`. `VimNavigationScheme` handles `j`/`k`/`g`/`G`/Enter/Esc/`q` unconditionally as navigation, so a pushed layer's `handleInput` never receives them as text - there is no in-dialog way to combine this scheme with a raw text field, confirming the modal library's own README warning. Resolution: "create new" closes the hub-list dialog with `{action: 'create'}` instead of pushing a text layer; the caller then opens a native `ctx.ui.input('Create New Hub', 'hub name')` dialog (already provided by `ExtensionUIContext`, no custom `Input` component or scheme needed), calls `state.createHub(name)` on submission, and the vim-scheme list dialog is unaffected. This still satisfies the spec's create-flow scenarios (name entry, Enter-to-create, duplicate-name rejection, letters never triggering navigation) since `ctx.ui.input()` runs entirely outside `VimNavigationScheme`.
- `PI_VIM_KEY_EVENT_ID` handling mirrors `pi-qol/src/extensions/context-view/index.ts`: `pi.events.on(PI_VIM_KEY_EVENT_ID, ...)` opens the modal using `latestCtx`, guarded by `isEnabled()`.

### D8: Status widget via `setWidget(key, factory, { placement: 'belowEditor' })`

Rendered only while connected; `setWidget(key, undefined)` on disconnect. Never calls `setFooter`. Format:

```
┏━ p2p-hub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 ● agent_name  model [###-----------] 17%
 ● agent_name  model [#######-------] 52%
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ count ━━┛
```

Context usage rendered as a bar + percentage everywhere it appears (widget, modal detail view, `p2p_ls` keeps the numeric `45K/272K (17%)` form for LLM readability plus the bar). Dot color reflects status (idle/thinking/tool).

### D9: New dependencies

`ws` (same as pi-link) for WebSocket server/client; a YAML parser (e.g. `yaml`) for `p2p-role.yml`. Both are runtime deps of the plugin.

## Risks / Trade-offs

- [Promotion race split-brain: two clients both think they won] → OS port bind is the arbiter; only one bind succeeds. Losers fall back to client-connect with jittered retry, identical to pi-link's `initialize()` loop.
- [Stale registry entries after host crash] → `hostPid` liveness check + connect probe on modal open and before connect; prune on failure. A crashed hub with surviving clients is healed by promotion (entry rewritten by the new host).
- [Config disabled after activation leaves handlers registered] → inherent to Pi (no unregistration). Mitigated by runtime guards + active disconnect (D6). Documented asymmetry: disabled-before-first-session = nothing observable; disabled-after = inert but registered.
- [Vim keys vs text input in create layer] → create layer consumes raw input while pushed; Esc pops back to list navigation. Needs explicit tests.
- [Widget not literally "below the footer"] → Pi API limitation; `belowEditor` (above footer) accepted as the placement, guaranteed not to conflict with custom footers.
- [`p2p_ask` blocking on a busy/stuck remote] → inherit pi-link's dual timeout (inactivity + hard ceiling); error result names the target and elapsed time.
- [Two agents with the same `basename(cwd)`] → hub-side dedup suffixes (`name-2`); `p2p-role.yml` lets users pick stable names.
- [Peek adds load on hubs from modal browsing] → peek is a single request/response then close; roster is small; acceptable.

## Migration Plan

Greenfield feature, default-disabled. No migration. Rollback = disable `p2p_hub` in config (or remove the extension); registry files under `~/.arsenal/p2p-hubs/` are self-healing (stale entries pruned) and safe to delete.

## Open Questions

- Additional config knobs (port range, registry dir override, `p2p_ask` timeout tuning) — deferred; v1 ships `enabled` only. Adding keys later is additive and non-breaking.
- Exact dot-color mapping for statuses in the widget — cosmetic, decided at implementation with theme colors.
