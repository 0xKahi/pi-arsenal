## Context

The repository currently has an external `test/` tree for tmux popup tests, but `config-loader.test.ts` and `shell.util.test.ts` remain beside production code in `src/`. Bun discovers both layouts through `bun test`. Moving the remaining tests requires adjusting their relative imports without changing their assertions or production modules.

## Goals / Non-Goals

**Goals:**
- Place every project `*.test.ts` file under `test/`, preserving the source-area directory structure.
- Keep tests importing the same production code and passing through Bun's standard test command.

**Non-Goals:**
- Change production behavior, test assertions, test framework, or test commands.
- Reorganize non-test source files or rename production modules.

## Decisions

- Mirror source paths below `test/`: move `src/config/config-loader.test.ts` to `test/config/config-loader.test.ts` and `src/utils/shell.util.test.ts` to `test/utils/shell.util.test.ts`. This matches the existing `test/extensions/tmux-popup/` convention and makes test ownership discoverable.
- Update only relative imports needed by the move (`../../src/...`), leaving test code and fixtures unchanged. This minimizes behavioral risk versus introducing aliases or test-specific configuration.
- Use `bun test` for verification because it is the repository's existing complete test-discovery command.

## Risks / Trade-offs

- [Incorrect relative import after relocation] → Update imports based on the new mirrored paths and run the full Bun test suite.
- [A test remains under `src/`] → Search for `*.test.ts` before and after the move to confirm the external tree is the sole test location.
