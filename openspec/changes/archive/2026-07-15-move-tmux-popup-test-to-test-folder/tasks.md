## 1. Relocate tmux popup tests

- [x] 1.1 Create `test/extensions/tmux-popup/` and move the four tmux popup `*.test.ts` files from `src/extensions/tmux-popup/` into it.
- [x] 1.2 Update each relocated test's relative imports so it references the corresponding production modules and shared configuration code under `src/`.

## 2. Verify test organization

- [x] 2.1 Run the tmux popup test suite and confirm all relocated tests are discovered and pass.
- [x] 2.2 Run the full project test command and confirm the relocated suite introduces no test-discovery or import-resolution failures.
