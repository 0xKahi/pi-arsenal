## Context

pi's extension lifecycle caches the extension **factory** per process (`loader.js`: `extensionCache.set(extensionPath, factory)`), invalidating the cache only on `/reload` (`clearExtensionCache()` in `resource-loader.js`) or a cwd change. Session actions (`/new`, resume, fork) emit `session_shutdown`, rebuild the per-session tool registry, re-invoke the **cached** factory, and emit `session_start` — the extension module is **not** re-evaluated.

`src/extensions/tmux-popup/tmux-popup.extension.ts` guards `registerTmuxPopup` with a module-level `let registered = false` flag. Its lifetime is per-process (module evaluation), while pi's tool registry lifetime is per-session binding:

```
lifetime of `registered` flag:   ├──────────── whole pi process ────────────┤
lifetime of tool registry:       ├── session 1 ──┤├── session 2 ──┤├── ... ──┤
                                        ✓ registers      ✗ guard skips,
                                        flag → true      tool missing
```

Result: the tool registers only for the first session after startup (and after `/reload`, which happens to reset module state). Every `/new`/resume/fork session lacks the tool.

pi's `registerTool` implementation is `extension.tools.set(tool.name, ...)` — a `Map.set` keyed by tool name — so duplicate registration is idempotent and cannot throw.

## Goals / Non-Goals

**Goals:**
- `tmux_popup` is registered (when enabled and config is valid) in every session of a pi process, regardless of how the session was started (startup, new, resume, fork, reload).
- Registration decision re-evaluates config and project trust per session start, so config edits and trust changes take effect without restarting pi.
- Preserve conditional visibility: no registration on config load failure or when `tmux_popup.enabled` is `false`.

**Non-Goals:**
- No changes to the tool's execution behavior, input contract, or config schema.
- No new events or lifecycle handling (e.g., no `session_shutdown` cleanup — pi already discards per-session tool registries).
- No process-wide caching of loaded config.

## Decisions

### Decision: Remove the guard entirely (vs. moving it into the factory closure)

Delete `let registered`, the `if (registered) return;` early exit, `registered = true`, and the `resetTmuxPopupRegistrationState()` helper.

**Why not a closure-scoped flag in `index.ts`'s factory?** A per-binding flag would still wrongly skip the `session_start` with `reason: "reload"`, which pi emits on the **same** binding after `/reload` (`agent-session.js` `reload()` path). Re-running registration there is desirable: it re-reads config. Since duplicate `registerTool` is a harmless `Map.set` overwrite, the guard has zero protective value in any scenario.

**Why not register eagerly in the factory (idiomatic top-level `pi.registerTool`)?** `ConfigLoader.load` requires `ctx.cwd` and `ctx.isProjectTrusted()`, which exist only on `ExtensionContext` (session-scoped), not on the factory-level `ExtensionAPI`. Registration is inherently a per-session decision here.

### Decision: Drop the per-registration info notification

`ctx.ui.notify('pi-arsenal: Registering tmux-popup tool', 'info')` fires on every session start once the guard is removed — noisy and low-value. Remove it. The error notify on config load failure stays (it is actionable).

### Decision: Test re-registration across rebinds

Simulate pi's rebind: call `registerTmuxPopup` twice with two fresh mock `pi` objects (as pi does when re-invoking the factory for a new session) and assert the tool is registered on both. Remove the `resetTmuxPopupRegistrationState()` call from test setup.

## Risks / Trade-offs

- [Config is re-read from disk on every session start] → Negligible: two small JSON files at most, session starts are rare and user-initiated. Also a feature — config changes are picked up.
- [If pi ever fires `session_start` twice on one binding] → Safe: `registerTool` is an idempotent `Map.set`; worst case config is parsed twice.
- [Behavior change: config errors now notify on every session start instead of once] → Acceptable; the error is actionable and repeated visibility is arguably better than a silently missing tool.
