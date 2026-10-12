# Tasks

## 1. Child runtime loads codemode on declaration

- [x] 1.1 In `src/extensions/multiverse/runtime/child-runtime.ts`, have `ChildRuntime.resourcePolicy(definition)` return `extensionFactories`. Use `[{ name: 'codemode', factory: createCodemodeExtension(), replaceable: true }]` when `definition.tools` includes a local `'codemode'` constant, and `[]` otherwise, with no `builtin` flag (design D1/D2). Verify with `bun run type-check`.
- [x] 1.2 In `test/extensions/multiverse/runtime/child-runtime.test.ts`, add stubbed-loader cases. A definition with `codemode` yields one non-builtin, replaceable `codemode` factory entry, and one without it yields an empty `extensionFactories`. Verify with `bun test test/extensions/multiverse/runtime/child-runtime.test.ts`.
- [x] 1.3 In `test/extensions/multiverse/integration/child-runtime.integration.test.ts`, add real-session cases using the fake model server's recorded requests. With a definition declaring `['read', 'codemode']`, the request declares `codemode`, and a codemode script can call `read` but cannot call `edit` or `spawn`. With `['read']` alone, the request has no `codemode`. Verify with `bun test test/extensions/multiverse/integration/child-runtime.integration.test.ts`.

## 2. Activation treats codemode as known

- [x] 2.1 In `src/extensions/multiverse/multiverse.extension.ts`, add `'codemode'` to the known-tool set used by the unknown-tool roster warning (design D3). Verify with `bun run type-check`.
- [x] 2.2 Add or extend a wiring test (e.g. `test/extensions/multiverse/multiverse-wiring.test.ts`) whose parent `getAllTools` lacks `codemode`. A definition declaring `codemode` and `bogus` warns about `bogus` only. Verify with `bun test test/extensions/multiverse/multiverse-wiring.test.ts`.

## 3. Bundled definitions and prompts

- [x] 3.1 Add `- codemode` to the frontmatter `tools` of `src/extensions/multiverse/agents/subagent-prompts/explorer.md`, `fixer.md`, and `visualizer.md`. Verify the registry still loads all three (`bun test test/extensions/multiverse/agents`).
- [x] 3.2 In each of the three prompt bodies, add a `codemode` entry to `<tools>` and a short rule to `<rules>`: batch independent calls with `Promise.allSettled`, filter large output inside the script, and only use tools this agent already has. Keep the existing read-only rules intact for explorer and visualizer. Verify by reading the three files and confirming `<tools>`/`<rules>` are well-formed.
- [x] 3.3 Update `docs/multiverse.md` and the `README.md` definition-format section to note that `codemode` may be listed in `tools`, loads only for agents that declare it, and doesn't depend on user codemode settings. Verify the docs render and their examples remain valid frontmatter.
- [x] 3.4 Add a changeset describing the feature (`bun run changeset`, patch or minor per repo convention). Verify the new file exists under `.changeset/`.

## 4. Integration check

- [x] 4.1 Run `bun run check` and `bun test`. Verify both pass with no new lint, type, or test failures.
- [x] 4.2 Run `openspec validate add-codemode-to-subagents --strict` and verify it passes.
