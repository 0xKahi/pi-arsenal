## 1. Retire the configuration surface

- [x] 1.1 Remove `PersonalAgentEntrySchema`, `PersonalAgentsSchema`, the `PersonalAgentEntry` type, and the `personal_agents` field from both the full and partial blocks in `src/schemas/multiverse.config.schema.ts`, leaving `subagents` and `presets` untouched; verify `bun test test/config/multiverse.config.schema.test.ts` passes after deleting the entry-parsing cases and that an unknown `personal_agents` key is now rejected as an unrecognized field
- [x] 1.2 Remove the `personal_agents` concatenation branch from `mergeConfig` in `src/config/config-loader.ts` and the `personal_agents: []` default from `src/schemas/config.schema.ts`, leaving the keyed merges for `subagents` and `presets` unchanged; verify `bun test test/config/config-loader.test.ts` passes after deleting the six layering cases and that the remaining trust, merge, and malformed-block cases still hold
- [x] 1.3 Regenerate the published schema with `bun run buildSchema` and drop the `personal_agents` entries from `assets/config.schema.json`; verify the regenerated file contains no `personal_agents` key and no other diff
- [x] 1.4 Remove the `personal_agents: []` fixture line and the `personalAgents` harness option from the config fixtures in `test/extensions/multiverse/integration/extension.integration.test.ts`, `test/extensions/multiverse/agents/subagent-model-resolver.test.ts`, `test/extensions/multiverse/agents/session-role-state.test.ts`, `test/extensions/multiverse/agents/child-prompt.test.ts`, `test/extensions/multiverse/runtime/child-runtime.test.ts`, `test/extensions/tmux-popup/tmux-popup.extension.test.ts`, and `test/extensions/p2p-council/p2p-council.extension.test.ts`; verify `bun test` reports no type or fixture errors from the removed field

## 2. Conventional directory locations

- [x] 2.1 Add a helper in `src/utils/path.util.ts` that builds the conventional agents directory as `path.join(...paths, 'extensions', EXTENSION_ID, 'agents')`, mirroring the existing `getExtensionConfig`, plus a resolver returning the global directory under `getAgentDir()` and the project directory under `<cwd>/.pi`; verify with unit tests asserting both resolved paths for a given agent directory and cwd
- [x] 2.2 Confirm the helper performs no filesystem access and never throws for a directory that does not exist, so existence stays a discovery concern; verify with a test resolving against a nonexistent root and asserting a returned path rather than an error

## 3. Directory discovery

- [x] 3.1 Replace `resolvePersonalAgentPath`, `resolvePersonalAgentPaths`, and `ResolvedPersonalAgentPath` in `src/extensions/multiverse/agents/subagent-paths.ts` with a `discoverOrderedSubagentPaths` that takes the bundled directory plus optional project and global agents directories and concatenates their `.md` files in the order bundled, project, global, alphabetical within each; verify with unit tests asserting the exact emitted order for a mixed set of directories
- [x] 3.2 Make an absent directory contribute zero paths and zero errors, distinguishing it from a directory that exists but cannot be read, which contributes one error; verify with tests covering a missing directory producing no diagnostic and an unreadable directory producing exactly one
- [x] 3.3 Confirm omitting the project directory argument entirely yields bundled plus global only, so the caller can express an untrusted project by not passing it; verify with a test asserting the emitted path list in that case
- [x] 3.4 Rewrite `test/extensions/multiverse/agents/subagent-paths.test.ts` against the new directory-based surface, deleting the path-expansion and relative-resolution cases; verify `bun test test/extensions/multiverse/agents/subagent-paths.test.ts` passes

## 4. Trust-gated wiring

- [x] 4.1 Wire discovery in `src/extensions/multiverse/multiverse.extension.ts` to pass the bundled directory, the project agents directory only when `initialCtx.isProjectTrusted()` returns true, and the global agents directory always; verify with an activation test asserting that a populated project agents directory contributes no agents when trust is false and contributes them when trust is true
- [x] 4.2 Confirm the global agents directory is still scanned when project trust is false; verify with an activation test asserting a global agent registers in an untrusted project
- [x] 4.3 Remove the `describeFailure` origin-annotation helper and the personal-model extraction block from the activation path, reporting registry failures directly; verify the activation tests covering registration diagnostics pass without the configured-path detail
- [x] 4.4 Confirm a user file declaring a bundled name leaves the bundled agent registered and reports the conflict naming both the winning agent and the skipped file, and that a project file beats a global file of the same name; verify `bun test test/extensions/multiverse/agents/subagent-registry.test.ts` passes with cases for bundled-vs-user, project-vs-global, and same-directory conflicts
- [x] 4.5 Confirm one unreadable or invalid file leaves every other agent registered, and that all user files failing still leaves the bundled roster available; verify with registry tests asserting the resulting available names in both cases
- [x] 4.6 Confirm discovery problems are reported once during activation and not repeated per turn or per spawn call; verify with a test that drives multiple turns and asserts a single notification per problem

## 5. Model resolution

- [x] 5.1 Delete `foldPersonalAgentModels`, `setPersonalAgentModels`, the `personalModels` cache, and the raw-versus-config split from `src/extensions/multiverse/agents/subagent-model-resolver.ts`, collapsing resolution back to `subagents[name].model` then the active preset then the parent session model; verify `bun test test/extensions/multiverse/agents/subagent-model-resolver.test.ts` passes with the inline-model cases removed
- [x] 5.2 Confirm a user agent's model is configured through `subagents[<name>].model` with no special-casing, including a preset override for that name; verify with resolver tests asserting the resolved model for a discovered user agent under settings-only and preset-plus-settings
- [x] 5.3 Confirm unset fields still fall back to the parent session model at runtime; verify with a child-runtime test asserting the resolved model for a user agent whose settings supply only `reasoning`

## 6. Availability and parity

- [x] 6.1 Confirm a registered user agent is governed by `subagents[name].enabled` with no special-casing, so it can be disabled while its file remains on disk; verify with a registry availability test asserting the agent is absent from the roster while its file is still present
- [x] 6.2 Confirm a registered and enabled user agent appears in the parent roster with its metadata, tools, and skills, and is accepted by spawn input validation; verify with prompt-rendering and spawn-validation tests asserting the new name is present and accepted
- [x] 6.3 Confirm a file whose name differs from its frontmatter `name` registers under the frontmatter name; verify with a registry test asserting the registered name for a deliberately mismatched filename
- [x] 6.4 Confirm a child created for a user agent receives that definition's prompt body, the registered subset of its declared tools, and a durable identity entry, and that reopening after the file is deleted fails clearly while preserving the session; verify with child-runtime and identity tests

## 7. Documentation and verification

- [x] 7.1 Rewrite the `personal_agents` section of `README.md` to document the two conventional directories, the bundled-over-project-over-global precedence, the frontmatter-name-authoritative rule, the project-trust requirement, and the no-hot-reload limitation, with a minimal example definition file; verify the documented `subagents` example still validates against the regenerated `assets/config.schema.json`
- [x] 7.2 Run `bun run check` and `bun test` and confirm both pass with no lint, type, or test failures
- [x] 7.3 Manually verify end to end: drop a definition into the global agents directory, confirm it appears in the parent roster, spawn it, confirm it runs under its `subagents[<name>].model` settings, then add a colliding project definition and confirm it wins, and finally confirm an untrusted project contributes no agents
