## Why

Tests still live beside production code in `src/config/` and `src/utils/`, while newer tmux popup tests already use the external `test/` tree. Consolidating tests makes production directories easier to navigate and gives the project one predictable location for test discovery.

## What Changes

- Move the remaining `*.test.ts` files from `src/` into corresponding paths under `test/`.
- Update relocated tests' relative imports so they continue to exercise the same production modules and shared source configuration.
- Preserve Bun test discovery and test behavior after relocation.

## Capabilities

### New Capabilities
- `test-suite-organization`: Defines the project-wide external placement and continued discovery of tests.

### Modified Capabilities

- None.

## Impact

- Affected source-adjacent tests: `src/config/config-loader.test.ts` and `src/utils/shell.util.test.ts`.
- Affected test layout: `test/config/` and `test/utils/` will be added alongside existing `test/extensions/` tests.
- No public API, dependency, or runtime behavior changes.
