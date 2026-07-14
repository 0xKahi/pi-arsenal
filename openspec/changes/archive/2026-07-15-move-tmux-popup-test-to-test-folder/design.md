## Context

The four tmux popup test files currently sit with their implementation in `src/extensions/tmux-popup/`. The project has no existing top-level test directory. This change reorganizes test-only code without changing the tmux popup feature or its Bun test runner.

## Goals / Non-Goals

**Goals:**
- Place all tmux popup tests under a dedicated top-level `test/` directory.
- Preserve the existing test cases, mocks, and coverage.
- Update relative imports to target production modules under `src/`.

**Non-Goals:**
- Changing tmux popup runtime behavior or configuration.
- Reorganizing tests outside the tmux popup area.
- Changing the test runner, scripts, or dependencies.

## Decisions

- Use `test/extensions/tmux-popup/` as the destination, mirroring the source hierarchy. This keeps test ownership discoverable while separating production and test code.
- Move all four tmux popup `*.test.ts` files together rather than a single test file. The request applies to the tmux popup test suite, and a complete move prevents mixed test placement in that module.
- Rewrite only source-relative imports after the move. Package imports remain unchanged, minimizing behavioral risk.

## Risks / Trade-offs

- [Incorrect relative imports could prevent tests from loading] → Update imports based on the new directory depth and run the targeted Bun test suite.
- [Bun test discovery could omit the new directory] → Run the full test command to verify discovery after relocation.
