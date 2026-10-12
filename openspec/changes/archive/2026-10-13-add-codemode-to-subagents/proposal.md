# Proposal

## Why

Subagents often run many independent reads and searches in a row, and each one costs a model round trip. Large outputs then fill their context. Pi's `codemode` tool lets a model run a short script that batches tool calls in parallel and filters the results before the model sees them. Multiverse children can't use it: they run as SDK sessions, and only the Pi CLI loads `codemode` (as a built-in extension), so listing it in a definition's `tools` does nothing today.

## What Changes

- Child runtimes load Pi's codemode extension **only when the resolved subagent definition declares `codemode` in its `tools`**. Children whose definitions don't declare it never load the extension.
- Child codemode loading does not depend on the user's codemode settings (`defaultTools`, `-builtin:codemode`). The definition's `tools` list is the only opt-in.
- The bundled `explorer`, `fixer`, and `visualizer` definitions declare `codemode` in their frontmatter `tools`. Their prompt `<tools>` and `<rules>` sections describe it and give guidance on batching calls and filtering large output.
- Declaring `codemode` no longer produces an "unknown tool" activation warning when the parent session itself has no codemode tool, because Multiverse supplies it to children.
- User-supplied definitions opt in the same way by listing `codemode` in their `tools`. Nothing is injected implicitly.
- Codemode scripts in a child can only call that child's active tools. This is Pi's existing behavior and is not widened: read-only agents stay read-only, and orchestration tools such as `spawn` stay unreachable.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `multiverse-runtime`: child runtimes conditionally load the codemode extension, based on the resolved definition's declared tools and independent of user codemode settings.
- `multiverse-agents`: bundled definitions declare `codemode`, and `codemode` counts as a known tool for the unknown-tool activation warning.

## Impact

- `src/extensions/multiverse/runtime/child-runtime.ts`: the resource loader for SDK children gets a codemode extension factory when the definition declares `codemode`.
- `src/extensions/multiverse/multiverse.extension.ts`: the unknown-tool warning treats `codemode` as known.
- `src/extensions/multiverse/agents/subagent-prompts/{explorer,fixer,visualizer}.md`: frontmatter `tools` plus the prompt `<tools>`/`<rules>` sections.
- `docs/multiverse.md` and `README.md`: note that `codemode` can be declared in a definition's `tools`.
- Tests under `test/extensions/multiverse/` for child runtime loader options and the activation warning.
- No new dependency. `createCodemodeExtension` is already exported by `@earendil-works/pi-coding-agent` ^1.1.0.
