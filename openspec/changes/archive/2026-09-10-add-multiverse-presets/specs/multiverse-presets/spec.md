## Purpose

Defines convenient named model lineups for Multiverse subagents, including partial-field inheritance, non-persistent selection, and an inspectable preset picker.

## ADDED Requirements

### Requirement: Field-level preset inheritance
For each registered agent, supplied fields in the selected named preset SHALL override corresponding fields in `subagents.<agent>.model`. Omitted fields SHALL retain subagent configuration values; remaining missing values SHALL use existing parent-model and parent-reasoning fallback behavior. The built-in default SHALL contribute no overrides. Resolution SHALL NOT mutate source configuration.

#### Scenario: Partial override
- **WHEN** the fixer's subagent settings specify provider A, model X, and low reasoning and the active preset supplies only high reasoning
- **THEN** its effective configuration is provider A, model X, and high reasoning

#### Scenario: Agent absent from preset
- **WHEN** an active preset omits explorer
- **THEN** explorer uses its existing subagent model configuration and existing parent fallback

#### Scenario: Parent inheritance
- **WHEN** neither the preset nor the subagent settings supplies a model field
- **THEN** the existing parent-session fallback supplies that field at interaction time

#### Scenario: Switch back to default
- **WHEN** a user selects the built-in default after a named preset
- **THEN** all preset overrides are removed and original subagent settings remain unchanged

### Requirement: Non-persistent preset selection
Each parent session SHALL initialize its active preset from a valid `defaultPreset`, or the built-in default otherwise. Explicit switches SHALL remain in memory for that session only and SHALL NOT write configuration or persist a preset-selection preference. Starting, reopening, switching to a different session, or reloading the extension SHALL initialize selection from configuration again. Parent-persona switches and conversation-branch navigation within the same live session SHALL NOT reset it. If the selected preset no longer exists in current configuration, its effective selection SHALL be the built-in default.

#### Scenario: Configured initial preset
- **WHEN** a parent session starts with `defaultPreset: "smart"` and a configured smart preset
- **THEN** smart is initially active

#### Scenario: No configured initial preset
- **WHEN** defaultPreset is absent or does not name a configured preset
- **THEN** the built-in default is initially active

#### Scenario: Reopening does not restore a manual switch
- **WHEN** a user selects a different preset and later reopens the session
- **THEN** selection initializes from current configuration rather than the earlier manual choice

#### Scenario: Same-process session transition
- **WHEN** a user changes to a different parent session without restarting the process
- **THEN** the previous session's in-memory choice is not carried into the new session

#### Scenario: Persona or branch change
- **WHEN** a parent changes persona or navigates its conversation branch in the same live session
- **THEN** its selected preset remains unchanged

#### Scenario: Selected preset removed
- **WHEN** the configuration provider no longer contains the selected preset
- **THEN** subsequent model resolution and the preset picker use the built-in default

### Requirement: Preset picker
The Presets tab SHALL list a built-in `[default]` option first and every configured named preset. It SHALL mark exactly the effective active selection with `(active)` and initially focus it. Each preset SHALL display the available registered agents beneath its heading with modelId, provider, and reasoning previews after field inheritance. The preview SHALL distinguish unresolved parent inheritance rather than invent values, and SHALL NOT claim successful authentication or runtime availability. A configured preset named `default` SHALL remain separately selectable and visibly distinguishable from the built-in default.

#### Scenario: Sparse preset preview
- **WHEN** smart overrides only explorer and fixer retains its baseline settings
- **THEN** smart's preview shows both available agents with their respective effective model configurations

#### Scenario: No named presets
- **WHEN** presets is absent or empty
- **THEN** the tab still offers the active built-in default and its agent previews

#### Scenario: Named default collision
- **WHEN** configuration includes a preset named default
- **THEN** both the built-in default and the configured default are distinguishable and selecting either activates only that option

#### Scenario: No available agents
- **WHEN** the available agent roster is empty
- **THEN** preset options remain visible with a clear empty-roster message rather than fabricated agents

#### Scenario: Preview is not an availability probe
- **WHEN** a preset references an unavailable provider or model
- **THEN** the picker can display its configured values without authenticating, opening a child, or promising that the model will run

### Requirement: Preset switching interaction
Parent sessions SHALL allow preset selection through the modal's existing Vim navigation and confirmation behavior. Confirmation SHALL activate the focused preset and close the modal without changing parent persona, parent model, or agent availability. Cancel SHALL leave selection unchanged. Child sessions SHALL show preset selection as disabled and confirmation SHALL have no effect. Long lists and agent previews SHALL remain navigable within the available terminal dimensions.

#### Scenario: Parent selects a named preset
- **WHEN** a parent focuses smart and confirms
- **THEN** smart becomes active, the modal closes, and the next modal opening marks smart active

#### Scenario: Cancel picker
- **WHEN** a user moves focus to another preset and cancels
- **THEN** the previously active preset remains active

#### Scenario: Child attempts a switch
- **WHEN** a child session opens the Presets tab and confirms an option
- **THEN** switching is visibly disabled and no preset or child model is changed

#### Scenario: Long picker
- **WHEN** presets and agent rows exceed the terminal viewport
- **THEN** users can navigate all preset choices, inspect their agent rows, and confirm the focused preset without overflowing the modal bounds
