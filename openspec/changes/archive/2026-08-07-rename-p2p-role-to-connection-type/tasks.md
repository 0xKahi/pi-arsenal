## 1. State and Roster Terminology

- [x] 1.1 Rename `P2pRole`, the local state field, `getRole()`, and topology-related local variables/comments to the corresponding connection-type names while preserving the existing values and control flow.
- [x] 1.2 Rename `P2pRosterEntry.role` to `connectionType` and update roster construction for local, host, and client views.

## 2. Consumers and Tool Contract

- [x] 2.1 Update the hub detail modal and other roster consumers to construct and select members through `connectionType` without changing their rendered host/client grouping.
- [x] 2.2 Update `p2p_ls` descriptions and rendering terminology, rename structured member details from `role` to `connectionType`, and ensure the old field is omitted while human-readable `[host]`/`[client]` output remains unchanged.
- [x] 2.3 Review remaining p2p `role` matches and retain unrelated assistant-message and `.arsenal/p2p-role.yml` identity usages unchanged.

## 3. Tests and Verification

- [x] 3.1 Update state, runtime-rebinding, modal, and tool tests to use `getConnectionType()` and roster `connectionType` assertions.
- [x] 3.2 Add or update `p2p_ls` assertions verifying structured members expose `connectionType`, omit `role`, and preserve correct host/client and `isSelf` classifications.
- [x] 3.3 Run the focused p2p-hub test suite and project type checks, then confirm searches find no superseded topology API names.
