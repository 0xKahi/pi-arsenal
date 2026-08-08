## 1. Configuration and Extension Identity

- [x] 1.1 Rename the p2p config schema file, exported config types, root schema key, config-loader accessor and merge behavior from `p2p_hub`/`P2pHub*` to `p2p_council`/`P2pCouncil*`.
- [x] 1.2 Update the extension bootstrap import and registration API to the p2p-council module and verify `p2p_hub` is not accepted as an activation alias.
- [x] 1.3 Rename command, Vim event, custom message, widget, notification, and process-global service identifiers to their kebab-case or snake_case council forms as appropriate.

## 2. Council Domain and Networking

- [x] 2.1 Move `src/extensions/p2p-hub/` to `src/extensions/p2p-council/` and rename state, service, modal, and other domain-bearing filenames and imports.
- [x] 2.2 Rename domain types, functions, fields, and local values from `P2pHub`/`Hub*`/`hub*` to `P2pCouncil`/`Council*`/`council*`, preserving generic `P2p*` types and host/client connection types.
- [x] 2.3 Rename the discovery registry and record vocabulary and change its sole default storage location to `~/.arsenal/p2p-councils/` without reading, migrating, or deleting `~/.arsenal/p2p-hubs/`.
- [x] 2.4 Rename council-specific protocol fields and networking notifications while preserving wire operations, connection lifecycle, promotion, peek, runtime handoff, and legitimate hub-and-spoke topology terminology.

## 3. Command, Widget, and Tool Presentation

- [x] 3.1 Rename the modal entry point and list/create/detail layers to councils and update all labels, actions, validation errors, and connection notices to council terminology.
- [x] 3.2 Update the status widget controller, key, title/content terminology, and state bindings to use the council APIs without changing layout or lifecycle behavior.
- [x] 3.3 Update p2p tool descriptions, prompt guidance, disconnected errors, list output, and inbound-message presentation to refer to councils and `/p2p-council`, while retaining the `p2p_send`, `p2p_ask`, and `p2p_ls` names.

## 4. Tests, Schema, and Documentation

- [x] 4.1 Move focused tests from `test/extensions/p2p-hub/` to `test/extensions/p2p-council/`, rename test imports and identifiers, and translate behavior assertions to council terminology.
- [x] 4.2 Extend config, command, and registry tests to prove the old config key does not enable the feature, `/p2p-hub` is not registered, and the old registry directory is not discovered or migrated.
- [x] 4.3 Regenerate `assets/config.schema.json` and verify it exposes `p2p_council` with the existing defaults and layout constraints and no `p2p_hub` property.
- [x] 4.4 Update nonhistorical documentation and release notes to use p2p-council terminology, leaving archived OpenSpec changes and historical changelog entries unchanged.

## 5. Verification

- [x] 5.1 Run the renamed focused council config, state, protocol, modal, widget, communication-presentation, registry, identity, format, extension, and tool test suites and resolve regressions.
- [x] 5.2 Run the full test suite, type checking, and linting and resolve failures.
- [x] 5.3 Review searches across active source, tests, generated assets, current documentation, and current specs for `p2p-hub`, `p2p_hub`, `P2pHub`, and domain-level `Hub*`; retain only explicitly justified topology or historical occurrences.
- [x] 5.4 Validate `rename-p2p-hub-to-p2p-council` with strict OpenSpec validation and resolve all artifact errors.
