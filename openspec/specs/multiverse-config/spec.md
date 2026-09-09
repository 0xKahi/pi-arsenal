# multiverse-config Specification

## Purpose

Defines the user-facing Multiverse configuration for enablement, the initial parent persona, global child concurrency, and per-subagent model and availability settings.

## Requirements

### Requirement: Multiverse configuration block
The system SHALL expose a `multiverse` configuration block with `enabled` defaulting to `false`, `defaultAgent` accepting `default` or `megamind` and defaulting to `default`, global `maxConcurrency`, and settings keyed by bundled subagent name. It SHALL use the project's normal global-then-project partial merge behavior. Invalid Multiverse configuration SHALL disable Multiverse behavior and identify the problem without disabling unrelated arsenal features. Absent, explicitly disabled, and invalid configuration SHALL all leave persisted child markers behaviorally inactive.

#### Scenario: Absent configuration
- **WHEN** no Multiverse configuration exists
- **THEN** orchestration, parent-persona injection, and child prompt/tool restrictions are inactive, including in existing marked child sessions

#### Scenario: Enabled defaults
- **WHEN** only `multiverse.enabled` is true
- **THEN** `defaultAgent` is `default`, `maxConcurrency` is `5`, and bundled subagents use documented defaults

#### Scenario: Partial project override
- **WHEN** trusted project configuration overrides one nested Multiverse value
- **THEN** unrelated resolved global values are retained

### Requirement: Disabled Multiverse is inactive
When `multiverse.enabled` is false, the system SHALL use the Default parent state, deactivate `spawn`, refuse spawn execution and persona activation, and contribute no Multiverse prompt or child tool restrictions. Persisted markers and saved preferences SHALL remain unchanged. Other arsenal features SHALL continue according to their own configuration.

#### Scenario: Disabled child reopen
- **WHEN** a user opens a marked child with Multiverse disabled
- **THEN** it runs with ordinary Pi prompt and tool behavior, subject to other active extensions, rather than Multiverse restrictions

#### Scenario: Re-enable through reload
- **WHEN** the user enables Multiverse and reloads a marked child
- **THEN** its stored identity and currently installed definition determine enabled child activation again

#### Scenario: Invalid block isolates failure
- **WHEN** a Multiverse configuration block fails validation
- **THEN** Multiverse behavior is inactive while unrelated arsenal features retain their own configured behavior

### Requirement: Global concurrency limit
`maxConcurrency` SHALL be one integer from `1` through `10`, defaulting to `5`, and SHALL bound all simultaneously running child interactions in a batch irrespective of subagent type. Per-subagent concurrency settings SHALL not exist.

#### Scenario: Limit applies across types
- **WHEN** capacity is five and a batch mixes create and continue tasks across subagents
- **THEN** at most five interactions run at once in any combination

#### Scenario: Invalid limit
- **WHEN** the configured value is outside `1..10`
- **THEN** validation identifies the accepted range and offending value

#### Scenario: Per-subagent limit rejected
- **WHEN** a subagent settings object contains a concurrency field
- **THEN** the Multiverse block fails validation as an unrecognized field, Multiverse orchestration is disabled, and unrelated features continue loading

### Requirement: Per-subagent settings
The settings map SHALL accept non-empty string agent names, with initial defaults for `explorer`, `fixer`, and `visualizer`. Each settings object SHALL accept `enabled` and an optional `model` object. Registered names without explicit settings SHALL default to enabled with parent-model fallback. Configuration SHALL NOT register an agent by itself. Global/project overrides SHALL merge settings by name without a hardcoded name list. A disabled subagent SHALL not be offered for new children. While Multiverse is enabled, a persisted child naming a disabled subagent SHALL remain stored but SHALL not run as a Multiverse child until that definition becomes available again. With top-level Multiverse disabled, subagent settings SHALL impose no restrictions on directly opened sessions.

#### Scenario: Settings for a registered non-bundled agent
- **WHEN** configuration includes settings for a registered name outside the initial shipped roster
- **THEN** those settings are accepted and merged with global/project overrides in the same way as any other name

#### Scenario: Settings do not create targets
- **WHEN** configuration names an agent without a registered definition
- **THEN** it does not become an available spawn target

#### Scenario: Disabled new target
- **WHEN** a subagent is disabled
- **THEN** it is absent from the new-child roster and rejected for creation

#### Scenario: Existing disabled child
- **WHEN** an old child names a subagent that is currently disabled
- **THEN** continuation fails clearly without deleting the child session

### Requirement: Subagent model configuration
A subagent model object SHALL accept optional `provider`, `modelId`, and recognized `reasoning`. Empty model configuration SHALL mean use the parent session model. Provider and model availability SHALL be resolved at interaction time rather than configuration validation time.

#### Scenario: Empty model
- **WHEN** no subagent model is configured
- **THEN** configuration is valid and the parent model is the runtime candidate

#### Scenario: Unknown reasoning
- **WHEN** `reasoning` is not a recognized level
- **THEN** configuration validation identifies the subagent and value

#### Scenario: Temporarily unavailable model
- **WHEN** a configured provider or model is unavailable during configuration loading
- **THEN** configuration remains valid and runtime resolution handles it

### Requirement: Optional model preset configuration
The Multiverse block SHALL accept optional `defaultPreset` as a string and optional `presets` as a map of non-empty preset names to maps of non-empty agent names. Each agent entry SHALL accept only optional `provider`, `modelId`, and recognized `reasoning`, with the same field validation as subagent model settings. Empty preset maps, empty presets, and empty agent model objects SHALL be valid. Presets SHALL NOT change availability or register agents. A missing `defaultPreset` reference SHALL NOT be a validation error; it SHALL select the built-in default behavior.

#### Scenario: Existing configuration remains valid
- **WHEN** configuration has neither `presets` nor `defaultPreset`
- **THEN** it remains valid and existing subagent model settings are unchanged

#### Scenario: Sparse preset
- **WHEN** a preset contains only `fixer` with `{ "reasoning": "high" }`
- **THEN** it is valid without other agents, provider, or modelId

#### Scenario: Empty preset
- **WHEN** a preset is empty or contains an empty agent model object
- **THEN** it is valid and contributes no model-field overrides for the affected agents

#### Scenario: Missing configured default
- **WHEN** `defaultPreset` does not name an own entry in the resolved presets map, including when that map is absent
- **THEN** Multiverse remains valid and uses the built-in default without disabling the feature

#### Scenario: Invalid preset model
- **WHEN** a preset model contains an unknown field, an invalid field type, or an unrecognized reasoning level
- **THEN** existing Multiverse validation isolation disables only Multiverse and identifies the offending configuration

#### Scenario: Presets do not enable or register agents
- **WHEN** a preset names a disabled or unregistered agent
- **THEN** that entry does not make the agent available for spawning

### Requirement: Layered preset configuration
Global and trusted-project configuration SHALL merge presets by preset name, then agent name, then explicitly supplied model fields. Omitted values and empty objects SHALL preserve lower-layer values. A supplied project `defaultPreset` SHALL override its global value; missing-name fallback SHALL be determined against the final merged presets map.

#### Scenario: Project patches one model field
- **WHEN** a global preset specifies a fixer's provider, modelId, and reasoning and a trusted project supplies only a new reasoning level for that same preset and agent
- **THEN** the provider and modelId remain global, reasoning is overridden, and other agents and presets are retained

#### Scenario: Default references a globally defined preset
- **WHEN** a trusted project sets `defaultPreset` to a preset supplied only by global configuration
- **THEN** the reference resolves successfully after merging

#### Scenario: Untrusted project preset
- **WHEN** an untrusted project supplies presets or a defaultPreset
- **THEN** those project values are ignored under existing configuration trust behavior

### Requirement: Published configuration schema
The published JSON schema SHALL describe the Multiverse block, defaults, allowed values, and nested subagent fields for editor completion and validation. It SHALL include optional `defaultPreset` and `presets`, arbitrary preset and agent names, and optional model fields with their accepted values and fallback descriptions.

#### Scenario: Editor completion
- **WHEN** a user edits arsenal configuration with schema support
- **THEN** every Multiverse field is offered with its description and default where applicable

#### Scenario: Preset editor completion
- **WHEN** a user edits an agent model inside a preset
- **THEN** provider, modelId, and reasoning are described as optional and unsupported model fields are rejected
