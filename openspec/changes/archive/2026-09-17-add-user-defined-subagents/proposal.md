## Why

Multiverse's subagent roster is closed: definitions are discovered from one bundled directory, so users cannot add specialists tuned to their own stack, workflow, or model budget. Every downstream system is already name-driven and the specs already treat registered definitions (not a hardcoded roster) as the source of truth, so the only thing preventing user-defined agents is discovery.

## What Changes

- Discover definitions from two conventional user directories in addition to the bundled one: a global `<getAgentDir()>/extensions/pi-arsenal/agents/` and a project `<cwd>/.pi/extensions/pi-arsenal/agents/`, mirroring where the extension's `config.json` already lives. Each directory is scanned for `.md` files and sorted alphabetically.
- Add no configuration field. The existing name-keyed `subagents` map (`{ enabled, model? }`) and `presets` map apply to user agents exactly as they do to bundled ones.
- Register definitions in a fixed source order: bundled, then project, then global. The registry's existing first-registration-wins deduplication turns that order into precedence, so a bundled definition always beats a user file and a project file beats a global one of the same name.
- Scan the project directory only when the host reports the project trusted. The multiverse extension itself gates the project directory on `isProjectTrusted()`; the global directory is always scanned.
- Take an agent's name from its frontmatter `name`, which remains required. The `<agent-name>.md` filename is conventional only and is neither parsed nor required to match.
- Let per-agent model configuration for a user agent flow through `subagents[<name>].model`, exactly as for a bundled agent.
- Treat a missing agents directory as normal: an absent directory contributes zero paths silently. Only a directory that exists but cannot be read, or an individual file that fails to parse, validate, or deduplicate, is reported.
- Isolate failures per file — one bad file never disables Multiverse or blocks the others — and report problems once at activation.
- Register user agents indistinguishably from bundled ones: roster, spawn validation, model resolution, child prompt and tools, and durable child identity all key off the declared name.

Non-goals for this change: hot-reloading edited definition files, overriding or shadowing bundled subagents, any permission model beyond the definition's declared tool list, reconciling a filename against its frontmatter name, and user-supplied definition paths of any kind.

## Capabilities

### New Capabilities

None. This change widens existing capabilities rather than introducing a new one.

### Modified Capabilities

- `multiverse-config`: lightly touched. It states that user agents use the existing name-keyed `subagents` map for settings, and keeps its existing "Configuration SHALL NOT register an agent by itself" boundary intact — the filesystem now registers agents, not configuration.
- `multiverse-agents`: carries nearly all of the change. It adds discovery of user-defined definition files from the two conventional directories, the bundled-over-project-over-global registration precedence for name collisions, the trust gate on the project directory, and skip-and-warn handling for individual bad files.

## Impact

- `src/utils/path.util.ts` — new helper for the conventional agents directory, alongside `getExtensionConfig`.
- `src/extensions/multiverse/agents/subagent-paths.ts` — two-directory discovery; the configured-path resolution helpers are removed.
- `src/extensions/multiverse/multiverse.extension.ts` — wiring the discovered directories into registration, plus the `isProjectTrusted()` gate on the project directory.
- `src/extensions/multiverse/agents/subagent-model-resolver.ts` — the desugaring layer is removed; resolution returns to its original two configured layers plus the parent fallback.
- `src/schemas/multiverse.config.schema.ts`, `src/config/config-loader.ts`, and `assets/config.schema.json` — revert to their pre-change state; no new field, no merge primitive, no schema addition.
- No changes to prompt rendering, spawn validation, child runtime construction, or session persistence: all are already keyed by agent name.
