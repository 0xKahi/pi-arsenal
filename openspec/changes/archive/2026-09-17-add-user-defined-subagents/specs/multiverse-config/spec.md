## MODIFIED Requirements

### Requirement: Multiverse configuration block
The system SHALL expose a `multiverse` configuration block with `enabled` defaulting to `false`, `defaultAgent` accepting `default` or `megamind` and defaulting to `default`, global `maxConcurrency`, and settings keyed by subagent name. It SHALL use the project's normal global-then-project partial merge behavior. Invalid Multiverse configuration SHALL disable Multiverse behavior and identify the problem without disabling unrelated arsenal features. Absent, explicitly disabled, and invalid configuration SHALL all leave persisted child markers behaviorally inactive.

#### Scenario: Absent configuration
- **WHEN** no Multiverse configuration exists
- **THEN** orchestration, parent-persona injection, and child prompt/tool restrictions are inactive, including in existing marked child sessions

#### Scenario: Enabled defaults
- **WHEN** only `multiverse.enabled` is true
- **THEN** `defaultAgent` is `default`, `maxConcurrency` is `5`, and bundled subagents use documented defaults

#### Scenario: Partial project override
- **WHEN** trusted project configuration overrides one nested Multiverse value
- **THEN** unrelated resolved global values are retained

### Requirement: Per-subagent settings
The settings map SHALL accept non-empty string agent names, with initial defaults for `explorer`, `fixer`, and `visualizer`. Each settings object SHALL accept `enabled` and an optional `model` object. Registered names without explicit settings SHALL default to enabled with parent-model fallback. The settings map SHALL NOT register an agent by itself. Settings SHALL apply uniformly to every registered agent, whether its definition came from the bundled directory or a user agents directory, so a user-supplied definition SHALL be disableable through `subagents[name].enabled` without removing its file. Global/project overrides SHALL merge settings by name without a hardcoded name list. A disabled subagent SHALL not be offered for new children. While Multiverse is enabled, a persisted child naming a disabled subagent SHALL remain stored but SHALL not run as a Multiverse child until that definition becomes available again. With top-level Multiverse disabled, subagent settings SHALL impose no restrictions on directly opened sessions.

#### Scenario: Settings for a registered non-bundled agent
- **WHEN** configuration includes settings for a registered name outside the initial shipped roster
- **THEN** those settings are accepted and merged with global/project overrides in the same way as any other name

#### Scenario: Settings do not create targets
- **WHEN** configuration names an agent in the settings map without a registered definition
- **THEN** it does not become an available spawn target

#### Scenario: User agent disabled through settings
- **WHEN** a definition discovered from a user agents directory registers an agent and the settings map sets `enabled` to false for that name
- **THEN** the agent is absent from the new-child roster while its definition file remains present

#### Scenario: Disabled new target
- **WHEN** a subagent is disabled
- **THEN** it is absent from the new-child roster and rejected for creation

#### Scenario: Existing disabled child
- **WHEN** an old child names a subagent that is currently disabled
- **THEN** continuation fails clearly without deleting the child session

### Requirement: Published configuration schema
The published JSON schema SHALL describe the Multiverse block, defaults, allowed values, and nested subagent fields for editor completion and validation. It SHALL include optional `defaultPreset` and `presets`, arbitrary preset and agent names, and optional model fields with their accepted values and fallback descriptions.

#### Scenario: Editor completion
- **WHEN** a user edits arsenal configuration with schema support
- **THEN** every Multiverse field is offered with its description and default where applicable

#### Scenario: Preset editor completion
- **WHEN** a user edits an agent model inside a preset
- **THEN** provider, modelId, and reasoning are described as optional and unsupported model fields are rejected
