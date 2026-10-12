# Design

## Context

- SDK children are built in `ChildRuntime.create()` (`src/extensions/multiverse/runtime/child-runtime.ts`). It creates a `DefaultResourceLoader` from `ChildRuntime.resourcePolicy(definition)` and then calls `createAgentSession({ tools: definition.tools })`. `resourcePolicy` already filters per definition (`skillsOverride`).
- In pi-coding-agent 1.1.0, only the CLI wires in `builtin:codemode`. SDK sessions have to pass `createCodemodeExtension()` through `DefaultResourceLoader`'s `extensionFactories` (pi `docs/sdk.md`). Today no factories are passed, so a declared `codemode` never resolves in a child.
- Once child activation runs, `PiToolManager.overrideActive` limits active tools to the definition's registered tools (`multiverse.extension.ts`, child branch).
- The unknown-tool warning (`multiverse.extension.ts`, roster loop) checks declared tools against the **parent's** `pi.getAllTools()`.
- Pi's codemode only lets scripts call `_getCallableTools()`: active direct tools plus tools with `codemode`/`deferred` exposure. Children load no MCP extension, so in practice only the child's active tools are callable.

## Goals / Non-Goals

**Goals:**
- Load codemode only in children whose definition declares it, so the frontmatter `tools` list stays the single source of truth.
- Keep the change local to child construction, with no new configuration surface.

**Non-Goals:**
- Honoring the user's `defaultTools`, `-builtin:codemode`, or `--no-extensions` for children.
- Overriding `codemode.mode` or `codemode.inlineBudget` for children. Children read the user's settings as Pi normally would.
- Loading MCP or `tool_search` in children.
- Injecting `codemode` into user-supplied definitions.
- Changing behavior when a child session is reopened directly in the CLI. There, the CLI's own built-in codemode applies.

## Decisions

### D1: Add the extension factory conditionally in `resourcePolicy`
`resourcePolicy(definition)` also returns `extensionFactories`. The list is `[codemode inline extension]` when `definition.tools` includes `'codemode'`, and `[]` otherwise. It sits next to `skillsOverride`, the existing per-definition filter, and both production and the `createResourceLoader` test seam can see it.
- *Alternative: always load it and rely on `overrideActive` to deactivate it.* Rejected. Undeclared children would still run an extension they never use, and the user asked for declaration-gated loading.
- *Alternative: inject `codemode` into `definition.tools` at parse time.* Rejected. It breaks "frontmatter is the source of truth" and changes how user definitions behave.

### D2: Pass it as a named, replaceable inline extension that is not a built-in
Use the entry `{ name: 'codemode', factory: createCodemodeExtension(), replaceable: true }`.
- Leaving `builtin: true` off keeps the resource loader's built-in filtering away from it. That's why `-builtin:codemode` and `--no-extensions` settings don't remove it, which matches the "regardless of user settings" decision.
- `replaceable: true` makes Pi drop it, instead of reporting a conflict, when another loaded extension already registers a `codemode` tool. This is what the CLI does.
- Use a local `'codemode'` constant for the tool name. `CODEMODE_TOOL_NAME` isn't exported from the package root.

### D3: Treat `codemode` as known in the unknown-tool warning
The warning compares against the parent's tool registry, which only contains codemode when the user enabled it in the CLI. Add `codemode` to the known set so bundled agents don't warn falsely for users who disabled it in the parent.

### D4: Prompt guidance per agent
Each bundled prompt gets a `codemode` line in `<tools>` and a short rule in `<rules>`: batch independent calls with `Promise.allSettled`, filter large output inside the script, and only call tools this agent already has. The read-only agents (explorer, visualizer) keep their "never modify" rules, which codemode cannot get around (see Context).

## Risks / Trade-offs

- [The user sets `codemode.mode: "only"`, which hides direct tools in children too] → Accept for now: tools stay reachable through scripts. Revisit if subagent quality drops.
- [A future change loads MCP in children, and scripts can then call MCP tools beyond the allowlist] → The spec requirement "Child codemode scripts are limited to the child's tools" makes that a contract any such change has to keep.
- [Pi changes `_getCallableTools` semantics in a later release] → Covered by the runtime spec scenarios. An integration test asserts a read-only child can't reach `edit`/`spawn`.
- [The ADDED "Bundled subagents declare codemode" requirement extends the existing rule that bundled tool lists come from the maintainer's bundle] → Documented as an explicit addition rather than rewriting the existing requirement.
- [Each codemode child pays extension load and VM cost] → Only children that opt in pay it.
