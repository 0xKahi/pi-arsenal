---
"@0xkahi/pi-arsenal": patch
---

- Move `typebox` from `dependencies` to `peerDependencies` (`*`) so the host-provided copy is used at runtime, avoiding duplicate module instances and the pi extension-loader warning.
- Upgrade pi dev dependencies (`@earendil-works/pi-ai`, `pi-coding-agent`, `pi-tui`) to `^0.99.1`.
- Update test mocks to the new `ExtensionToolContext` type passed to tool `execute` in pi v0.99.
