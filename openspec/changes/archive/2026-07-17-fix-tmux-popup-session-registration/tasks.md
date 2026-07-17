## 1. Remove the process-wide registration guard

- [x] 1.1 In `src/extensions/tmux-popup/tmux-popup.extension.ts`, delete the module-level `let registered = false;` declaration, the `if (registered) return;` early exit, and the `registered = true;` assignment so `registerTmuxPopup` evaluates config and registers on every invocation
- [x] 1.2 Delete the `resetTmuxPopupRegistrationState()` export from `src/extensions/tmux-popup/tmux-popup.extension.ts`
- [x] 1.3 Remove the `ctx.ui.notify('pi-arsenal: Registering tmux-popup tool', 'info')` call (keep the error notify on config load failure)

## 2. Update tests

- [x] 2.1 In `test/extensions/tmux-popup/tmux-popup.extension.test.ts`, remove the `resetTmuxPopupRegistrationState` import and its call in `beforeEach`
- [x] 2.2 Replace the `'is idempotent'` test (which asserts the buggy once-per-process behavior) with a re-registration test: call `registerTmuxPopup` twice with two fresh `pi` mocks (simulating pi rebinding extensions for a new session) and assert the tool is registered both times
- [x] 2.3 Adjust the `'registers the tool when enabled'` test if it asserted the removed info notification (verify no stale notify expectations remain)

## 3. Verify

- [x] 3.1 Run the test suite (`bun test`) and confirm all tests pass
- [x] 3.2 Manual smoke test: start pi in tmux with `tmux_popup.enabled: true`, confirm the tool exists, run `/new`, and confirm `tmux_popup` is still available in the new session
