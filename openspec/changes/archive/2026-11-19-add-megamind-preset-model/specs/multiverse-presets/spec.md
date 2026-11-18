# Spec Delta

## MODIFIED Requirements

### Requirement: Preset switching interaction
Parent sessions SHALL allow preset selection through the modal's existing Vim navigation and confirmation behavior. Successful confirmation SHALL activate the focused preset and close the modal without changing parent persona or agent availability. Only an explicit named preset confirmation can apply a parent model action. Cancel SHALL leave selection unchanged. Child sessions SHALL show preset selection as disabled and confirmation SHALL have no effect. Long lists and agent previews SHALL remain navigable within the available terminal dimensions.

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

## ADDED Requirements

### Requirement: Explicit parent model action
Confirming a named preset in a parent session SHALL apply its supplied `megamind` fields to the current host session immediately, independently of persona. Missing provider and model ID SHALL use their current parent values. Omitted reasoning SHALL retain the current level subject to host model limits. Automatic lineup selection SHALL NOT apply a parent action.

#### Scenario: Switch the parent and children together
- **WHEN** a parent in either persona confirms a preset with megamind and fixer entries
- **THEN** the next parent turn uses the requested parent settings and subsequent fixer spawns use their existing child resolution with the selected preset

#### Scenario: Configured initial selection
- **WHEN** a session starts, reopens, switches or reloads with a named defaultPreset containing megamind
- **THEN** the child lineup initializes without changing the host model or reasoning; explicitly confirming that same active name applies its parent action

#### Scenario: No restoration
- **WHEN** the parent changes persona, confirms the built-in default, or confirms a preset with a missing or empty megamind entry
- **THEN** its parent model and reasoning remain unchanged

#### Scenario: Reasoning only
- **WHEN** the parent confirms a preset whose megamind entry supplies reasoning alone
- **THEN** only the parent thinking level changes, within the current model's supported levels

#### Scenario: Unavailable model
- **WHEN** the requested parent model cannot be resolved or selected
- **THEN** the user is notified and the previous parent settings and active lineup remain unchanged

### Requirement: Parent action preview
A named preset with parent fields SHALL display a separately labeled parent action preview, distinct from any child row. Inspection SHALL NOT change session state or claim that the model is available.

#### Scenario: Inspect without applying
- **WHEN** a user highlights a named preset containing megamind
- **THEN** the picker identifies which model and reasoning confirmation would request for the parent without applying them
