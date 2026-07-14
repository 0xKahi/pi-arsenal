## 1. Configuration Foundation

- [x] 1.1 Complete the tmux popup full and partial Zod schemas, inferred types, defaults, bounds, and root schema composition needed for layered overrides.
- [x] 1.2 Implement the shared `ConfigLoader` to load defaults, global configuration, and trusted project configuration with per-feature shallow merging and final validation.
- [x] 1.3 Add configuration tests covering defaults, valid overrides, dimension failures, trusted project layering, untrusted project exclusion, and malformed configuration behavior.

## 2. Tmux Popup Utilities

- [x] 2.1 Implement path normalization that removes one optional leading `@`, expands current-user `~`, requires an absolute path, and rejects `~other-user` paths.
- [x] 2.2 Implement existing-file validation that accepts files and file-targeting symlinks while rejecting missing paths and directories.
- [x] 2.3 Implement POSIX shell argument escaping for the model-controlled file path and test spaces, apostrophes, and shell metacharacters.
- [x] 2.4 Implement a detached tmux process launcher that supplies `display-popup`, percentage dimensions, `-E`, and the popup command as separate arguments, resolves on successful spawn, reports spawn errors, ignores standard I/O, and unreferences the child.

## 3. Tool Registration and Execution

- [x] 3.1 Define the `tmux_popup` Pi tool with a single documented `filePath` parameter, concise prompt metadata, and result details suitable for tool output.
- [x] 3.2 Implement the tool execution guards and flow for `$TMUX`, path normalization, existing-file validation, shell-safe command construction, detached popup initiation, and thrown tool errors.
- [x] 3.3 Wire configuration initialization and idempotent conditional registration into the extension entry point so disabled or invalidly configured tools are absent and enabled tools become immediately available.
- [x] 3.4 Add tests with mocked Pi and process boundaries covering disabled visibility, enabled registration, tmux-session rejection, argument construction, spawn success, spawn failure, and non-waiting behavior.

## 4. Package Documentation and Validation

- [x] 4.1 Generate and commit `assets/config.schema.json` with the documented `tmux_popup` configuration fields and correct pi-arsenal metadata.
- [x] 4.2 Document installation, global and trusted project configuration locations, the `tmux_popup` path contract, tmux requirement, command-prefix trust boundary, and fire-and-forget behavior in the package README.
- [x] 4.3 Run formatting/linting, type checking, tests, and package schema generation checks; resolve all failures and verify the published package manifest includes every required runtime source and generated artifact.
