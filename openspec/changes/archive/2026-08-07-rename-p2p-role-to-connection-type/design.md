## Context

The p2p state currently models its local transport position with `P2pRole`, a private `role` field, and `getRole()`. Roster entries reuse `role` for each member's host/client classification, and that property flows into the detail modal and the structured `p2p_ls` result. The same codebase also uses “role” for unrelated concepts such as assistant message roles and the `.arsenal/p2p-role.yml` identity configuration, so a broad textual replacement would be incorrect.

The host/client relationship is derived locally from connection topology rather than carried as a generic wire-protocol role field. This allows the terminology to change without a protocol migration or mixed-version interoperability concern.

## Goals / Non-Goals

**Goals:**
- Give the local state and roster topology one consistent `connectionType` vocabulary.
- Preserve the existing `host`, `client`, and `disconnected` values and all routing, promotion, and rendering behavior.
- Make the breaking structured `p2p_ls` field rename explicit and testable.

**Non-Goals:**
- Renaming `.arsenal/p2p-role.yml`, whose “role” describes configured agent identity rather than connection topology.
- Renaming framework or message fields such as an assistant message's `role`.
- Changing wire messages, hub discovery, host promotion, or adding compatibility aliases.

## Decisions

### Rename the complete state-level concept as one atomic change

Rename `P2pRole` to `P2pConnectionType`, the private state field to `connectionType`, and `getRole()` to `getConnectionType()`. Rename `P2pRosterEntry.role` to `connectionType`, then update all modal, tool, and test consumers in the same change.

This avoids retaining two names for the same concept and lets TypeScript expose any missed consumers at compile time. The alternative—renaming only the private field—would leave the misleading public state and roster APIs intact.

### Keep connection-type values and wire representation unchanged

The value union remains `'host' | 'client' | 'disconnected'`; connected roster entries remain limited to `'host' | 'client'`. The network protocol already represents the host and clients structurally, so no message shape or registry format changes are required.

The alternative—renaming values as well as the property—would create unnecessary behavioral and interoperability changes without improving the distinction between agent identity and transport topology.

### Make the structured tool result a hard field rename

Structured `p2p_ls` members will return `connectionType` and omit `role`. Human-readable output will keep its existing bracketed `[host]`/`[client]` presentation because those labels are accurate values and do not claim to be agent responsibilities.

A temporary deprecated `role` alias was considered, but rejected because it would preserve the ambiguity and leave consumers uncertain which field is canonical. The release impact should instead be communicated as a breaking result-schema migration from `role` to `connectionType`.

### Limit terminology updates to connection topology

Implementation review will distinguish topology usages from unrelated role terminology. In particular, `.arsenal/p2p-role.yml`, identity resolver variables referring to that filename, and assistant message `role` fields remain unchanged.

This targeted approach is safer than a repository-wide replacement and preserves the existing agent identity configuration contract.

## Risks / Trade-offs

- **[Risk] Downstream consumers of `getRole()`, roster `role`, or structured `p2p_ls` details break.** → Treat the rename as intentional and atomic, update in-repository consumers and tests, and document `role` → `connectionType` as the migration.
- **[Risk] A topology-related `role` usage is missed.** → Use focused searches plus type checking and the p2p test suite to verify the old state/roster API names are gone.
- **[Risk] An unrelated role concept is renamed accidentally.** → Explicitly exclude identity configuration and assistant-message roles, and review remaining matches after implementation.

## Migration Plan

1. Rename the state type, field, accessor, local variables, and topology comments without changing their values or control flow.
2. Rename the roster property and update the modal and tool consumers.
3. Rename the structured `p2p_ls` result field, preserving human-readable output formatting.
4. Update tests to assert the new names and the absence of the old structured field; run type checks and focused p2p tests.
5. If rollback is required, revert the atomic rename; no stored data or wire-protocol rollback is needed.
