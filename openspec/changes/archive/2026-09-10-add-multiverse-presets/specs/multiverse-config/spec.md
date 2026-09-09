## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Published configuration schema
The published JSON schema SHALL describe the Multiverse block, defaults, allowed values, and nested subagent fields for editor completion and validation. It SHALL include optional `defaultPreset` and `presets`, arbitrary preset and agent names, and optional model fields with their accepted values and fallback descriptions.

#### Scenario: Editor completion
- **WHEN** a user edits arsenal configuration with schema support
- **THEN** every Multiverse field is offered with its description and default where applicable

#### Scenario: Preset editor completion
- **WHEN** a user edits an agent model inside a preset
- **THEN** provider, modelId, and reasoning are described as optional and unsupported model fields are rejected
