## Why

Tmux popup tests currently live beside production source files, mixing test and implementation concerns. Moving them into the project test directory will make the source layout clearer and establish a consistent home for extension tests.

## What Changes

- Relocate the tmux popup test files from `src/extensions/tmux-popup/` to the project test directory.
- Update relocated tests so their imports continue to resolve the tmux popup implementation and shared configuration modules.
- Preserve the existing test coverage and test-runner behavior.

## Capabilities

### New Capabilities

- `tmux-popup-test-organization`: Defines the required external location and coverage preservation for tmux popup tests.

### Modified Capabilities

None.

## Impact

- Affected files: tmux popup `*.test.ts` files and their import paths.
- Test organization changes only; no runtime APIs, configuration behavior, or dependencies change.
