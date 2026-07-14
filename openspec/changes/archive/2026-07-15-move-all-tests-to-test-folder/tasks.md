## 1. Relocate remaining source-adjacent tests

- [x] 1.1 Create `test/config/` and move `src/config/config-loader.test.ts` to `test/config/config-loader.test.ts`.
- [x] 1.2 Create `test/utils/` and move `src/utils/shell.util.test.ts` to `test/utils/shell.util.test.ts`.
- [x] 1.3 Update the relocated tests' relative imports to reference their existing production modules under `src/`.

## 2. Verify external test organization

- [x] 2.1 Confirm no `*.test.ts` files remain under `src/` and the relocated tests are in their mirrored `test/` paths.
- [x] 2.2 Run `bun test` and confirm the complete suite, including relocated tests, is discovered and passes.
