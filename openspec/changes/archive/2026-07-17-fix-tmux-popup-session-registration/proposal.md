## Why

The `tmux_popup` tool is only available in the first session of a pi process. When the user starts a new session (`/new`), resumes, or forks, pi rebuilds the per-session tool registry and re-invokes the cached extension factory — but a module-level `registered` flag in `tmux-popup.extension.ts` survives (pi caches the factory without re-evaluating the module), so `registerTmuxPopup` returns early and the tool is silently missing for every session after the first.

The guard protects against nothing: pi's `registerTool` is a `Map.set` keyed by tool name, so duplicate registration is harmless. The guard's process-wide lifetime is mismatched with pi's per-session tool registry, and it actively causes the bug.

## What Changes

- Remove the module-level `registered` flag and early-return guard from `registerTmuxPopup` so registration logic runs on every `session_start` (startup, new, resume, fork, reload).
- Remove the now-unneeded `resetTmuxPopupRegistrationState()` test helper and its usage in tests.
- Remove (or downgrade) the per-registration `ctx.ui.notify('Registering tmux-popup tool', 'info')` so it does not fire noisily on every session start.
- Keep all conditional registration behavior: config load failure still notifies and skips registration; `tmux_popup.enabled: false` still skips registration.
- Add test coverage for re-registration across session rebinds (a second `session_start` with a fresh pi binding registers the tool again).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tmux-popup`: The "Conditional tool visibility" requirement is strengthened — the registration decision (config load, trust, enabled flag) SHALL be evaluated on every session start within a pi process, not only the first one. Subsequent sessions (new/resume/fork/reload) get the tool when enabled, and pick up config/trust changes.

## Impact

- `src/extensions/tmux-popup/tmux-popup.extension.ts` — delete guard flag, early return, `registered = true`, and `resetTmuxPopupRegistrationState`; adjust/remove the info notify.
- `test/extensions/tmux-popup/tmux-popup.extension.test.ts` — drop `resetTmuxPopupRegistrationState()` setup call; add re-registration-across-sessions test.
- No changes to tool behavior, config schema, or public API surface. No breaking changes.
