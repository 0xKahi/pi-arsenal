## Purpose

Defines the user-facing Multiverse configuration for enablement, the initial parent persona, global child concurrency, and per-subagent model and availability settings.

## ADDED Requirements

### Requirement: Multiverse configuration block
The system SHALL expose a `multiverse` configuration block with `enabled` defaulting to `false`, `defaultAgent` accepting `default` or `megamind` and defaulting to `default`, global `maxConcurrency`, and settings keyed by bundled subagent name. It SHALL use the project's normal global-then-project partial merge behavior. Invalid Multiverse configuration SHALL disable new orchestration and parent-persona activation and identify the problem without disabling unrelated features or file-level recognition of existing marked children.

#### Scenario: Absent configuration
- **WHEN** no Multiverse configuration exists
- **THEN** new orchestration and parent-persona behavior are inactive, while an explicitly marked existing child remains recognizable so its child restrictions are not lost

#### Scenario: Enabled defaults
- **WHEN** only `multiverse.enabled` is true
- **THEN** `defaultAgent` is `default`, `maxConcurrency` is `5`, and bundled subagents use documented defaults

#### Scenario: Partial project override
- **WHEN** trusted project configuration overrides one nested Multiverse value
- **THEN** unrelated resolved global values are retained

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
The settings map SHALL contain exactly the bundled `explorer`, `fixer`, and `visualizer` keys. Each bundled subagent settings object SHALL accept `enabled` and an optional `model` object. A disabled subagent SHALL not be offered for new children. A persisted child naming a currently disabled subagent SHALL remain stored but SHALL not run until that definition becomes available again.

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

### Requirement: Published configuration schema
The published JSON schema SHALL describe the Multiverse block, defaults, allowed values, and nested subagent fields for editor completion and validation.

#### Scenario: Editor completion
- **WHEN** a user edits arsenal configuration with schema support
- **THEN** every Multiverse field is offered with its description and default where applicable
