## Why

The extension has not been publicly adopted yet, making this the safest point to replace the implementation-oriented “p2p-hub” name with the more expressive “p2p-council” domain name. Performing one complete rename now avoids carrying aliases, migration paths, and mixed terminology into the public contract.

## What Changes

- **BREAKING** Rename the extension’s public configuration section from `p2p_hub` to `p2p_council` without accepting the old key.
- **BREAKING** Replace `/p2p-hub` with `/p2p-council` and rename the associated Vim event, custom message type, widget key, notifications, prompts, and UI terminology.
- **BREAKING** Rename named communication groups from hubs to councils throughout modal behavior, state contracts, registry records, protocol fields, and user-facing output.
- **BREAKING** Move discovery storage from `~/.arsenal/p2p-hubs/` to `~/.arsenal/p2p-councils/` without legacy lookup or migration.
- Rename implementation paths and identifiers from `p2p-hub`/`P2pHub`/`Hub*` to `p2p-council`/`P2pCouncil`/`Council*`, including the process-scoped service symbol and tests.
- Keep `p2p_send`, `p2p_ask`, `p2p_ls`, generic peer identity/message names, host/client connection types, `.arsenal/p2p-role.yml`, and technical “hub-and-spoke” topology terminology unchanged.
- Replace the current p2p-hub capability specifications with equivalent p2p-council capabilities while leaving archived changes and historical changelog entries intact.

## Capabilities

### New Capabilities
- `p2p-council-config`: Configuration gating, lazy activation, runtime guards, and deactivation under the `p2p_council` contract.
- `p2p-council-command`: The `/p2p-council` modal for discovering, inspecting, creating, joining, and leaving councils.
- `p2p-council-networking`: Named council lifecycle, discovery registry, membership, promotion, peeking, and process-scoped connection behavior.
- `p2p-council-status-widget`: Connection-driven council roster widget behavior and presentation.
- `p2p-council-tools`: Existing p2p tool behavior expressed against connected councils and the renamed command.

### Modified Capabilities
- `p2p-hub-config`: Remove the superseded p2p-hub configuration capability.
- `p2p-hub-command`: Remove the superseded p2p-hub command capability.
- `p2p-hub-networking`: Remove the superseded named-hub networking capability.
- `p2p-hub-status-widget`: Remove the superseded p2p-hub widget capability.
- `p2p-hub-tools`: Remove the superseded hub-oriented tool capability.

## Impact

- Affects `src/extensions/p2p-hub/`, its registration in `index.ts`, configuration schemas and loader APIs, generated `assets/config.schema.json`, focused tests, current OpenSpec capabilities, and current user-facing documentation or release notes.
- Changes configuration, command, filesystem registry, internal message-renderer identity, Vim integration identity, widget identity, process-global service identity, and internal protocol/property names.
- Existing local development configuration and registry data are intentionally not migrated; users must adopt `p2p_council` and recreate councils.
- No new dependencies and no intended communication, topology, lifecycle, rendering, or tool-name behavior changes beyond the vocabulary and identifiers described above.
