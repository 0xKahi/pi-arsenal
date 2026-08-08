## Context

The feature is currently implemented as a cross-cutting pi-arsenal sub-extension under `src/extensions/p2p-hub/`. Its name appears in public configuration and commands, user-facing council-group language, persistent registry paths, runtime integration identifiers, TypeScript APIs, tests, generated schema output, and five current OpenSpec capabilities. The feature has not been publicly adopted, so compatibility with the old identity is not a constraint. See `proposal.md` for motivation.

The term “hub” also legitimately describes the extension’s hub-and-spoke network topology. The refactor therefore needs a semantic boundary rather than an indiscriminate textual replacement.

## Goals / Non-Goals

**Goals:**

- Produce one internally consistent `p2p-council` identity across public surfaces, domain concepts, implementation paths, tests, and current specifications.
- Make the clean-break behavior explicit enough that no accidental old config, command, registry, or runtime alias survives.
- Preserve all existing communication, lifecycle, topology, promotion, rendering, and tool behavior.
- Retain technical topology terminology where “hub-and-spoke” describes architecture rather than the product/domain name.

**Non-Goals:**

- Supporting mixed p2p-hub and p2p-council versions.
- Migrating local development config or registry files.
- Renaming the `p2p_send`, `p2p_ask`, or `p2p_ls` tool contracts.
- Renaming generic `P2p*` wire/identity types, host/client connection types, or `.arsenal/p2p-role.yml`.
- Rewriting archived OpenSpec artifacts or historical changelog entries.

## Decisions

### 1. Apply one atomic clean-break rename

Rename the config section, command, event identity, custom message type, widget key, process-global symbol, registry path, domain fields, source/test paths, and TypeScript identifiers in the same change. Do not add aliases, dual reads, fallback paths, or deprecation notices.

This is preferred over a staged migration because there are no public consumers, and compatibility code would create permanent ambiguity and additional lifecycle cases without user value.

### 2. Use “council” for the product domain and retain topology vocabulary

A named communication group is a council: users create, join, inspect, host, leave, and list councils and council members. Corresponding identifiers use the established casing convention:

- kebab-case: `p2p-council`, `/p2p-council`, paths, widget and service symbol segments
- snake_case: `p2p_council` config and custom message/event identities
- PascalCase: `P2pCouncilState`, `P2pCouncilConfig`, `CouncilRegistry`, modal layers
- camelCase: `councilName` and related values
- plural storage directory: `~/.arsenal/p2p-councils/`

“Hub-and-spoke,” WebSocket server/client, host, client, transport, protocol, peer, and generic `P2p*` remain valid technical terms. This boundary avoids misleading names such as “council-and-spoke” and prevents unrelated protocol churn.

### 3. Rename structure together with symbols

Move the implementation and focused test directories to `p2p-council`, rename files whose names contain the old domain, and update imports in the same unit of work. Rename modal layers and registry/state/service identifiers rather than retaining old internal vocabulary behind a new UI label.

A public-only rebrand was rejected because it would leave developers navigating two names for the same capability and make future searches unreliable.

### 4. Treat stored and process-global identities as new identities

Use only `~/.arsenal/p2p-councils/` for discovery and a council-named `Symbol.for(...)` key for process-scoped service retention. Old registry data and old process-global carriers are not adopted.

This intentionally favors a deterministic clean state. In-flight connections should be closed before upgrading during development; hot-reload continuity is required only between council-named runtimes after the refactor.

### 5. Replace current capabilities, preserve historical records

Add the five `p2p-council-*` capabilities with the complete existing behavioral contracts translated to council terminology, and remove all requirements from the corresponding current `p2p-hub-*` capabilities. Do not edit archived changes, which remain an accurate history of how the feature was originally introduced.

This is preferred over retaining `p2p-hub-*` capability paths with council text because capability paths are part of the project’s vocabulary and would otherwise remain misleading indefinitely.

### 6. Use explicit residual-search allowlists

After the rename, searches across active source, tests, generated assets, current specs, and nonhistorical documentation should find no `p2p-hub`, `p2p_hub`, `P2pHub`, or domain-level `Hub*` identifiers. Remaining “hub” occurrences must be reviewed individually and limited to hub-and-spoke topology language or historical artifacts.

A blind zero-occurrence rule was rejected because it would incorrectly erase legitimate architectural terminology and historical records.

## Risks / Trade-offs

- [Mechanical replacement corrupts legitimate topology language] → Review every residual and changed “hub” occurrence semantically; explicitly preserve “hub-and-spoke.”
- [A hidden runtime identifier is missed] → Test registration, custom message rendering, Vim activation, widget lifecycle, and process-scoped reload behavior, then use residual searches as a completion gate.
- [Generated config schema diverges from TypeScript schemas] → Regenerate `assets/config.schema.json` using the project script and assert it contains only the new config key.
- [Local stale development processes or files cause confusing results] → Stop old processes before testing and treat `~/.arsenal/p2p-hubs/` as disposable legacy state rather than reading or deleting it automatically.
- [Large spec replacement obscures an accidental behavioral change] → Translate the existing requirements structurally and limit intentional delta scenarios to the clean-break config, command, and registry behavior.

## Migration Plan

1. Ensure no old p2p-hub host process is expected to survive the development update.
2. Apply the source, test, public-surface, storage, and current-spec vocabulary rename atomically.
3. Regenerate configuration schema output and update current documentation/release notes while leaving historical records unchanged.
4. Run focused council tests, the full suite, type checking, linting, strict OpenSpec validation, and reviewed residual searches.
5. Recreate any desired local councils under the new registry after the updated extension starts.

Rollback is a source rollback. Because no legacy data is migrated or deleted, returning to the old revision restores its old config and registry lookup behavior.
