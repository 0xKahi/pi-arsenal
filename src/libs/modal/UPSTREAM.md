# Upstream synchronization notes

This modal library is vendored from **pi-qol** and should normally remain copy-compatible with it.

## Pending upstream enhancement: text-focused layers

This copy adds a generic modal-layer enhancement that must be mirrored into pi-qol before the next vendor refresh:

- `ModalLayer.inputPolicy: 'navigation-first' | 'text-focused'`, defaulting to navigation-first.
- Optional layer focus propagation through `ModalLayer.focused`.
- Raw input ownership for a text-focused top layer before tab/Vim navigation, with Esc retained by the shell.
- `ModalTabContext.popLayer()` and layer `dispose()` cleanup.
- Shared routing/focus coverage in `test/libs/modal/modal-dialog.test.ts`.

When syncing either direction, port these contracts and tests together; do not overwrite this behavior with an older pi-qol modal directory.
