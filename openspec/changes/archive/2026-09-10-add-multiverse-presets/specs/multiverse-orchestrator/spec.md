## MODIFIED Requirements

### Requirement: Multiverse persona-switching modal
While Multiverse is enabled, the system SHALL register a `/multiverse` command and matching `PI_VIM_KEY_EVENT` that open the same TUI modal. The modal SHALL use Vim navigation and contain `[Switch Agents]`, `[Presets]`, and `[Child Sessions]` tabs. The child-sessions tab SHALL display a coming-soon placeholder in V1. The switch tab SHALL list Default and Megamind and initially select the active persona. Selecting Megamind SHALL append its prompt and activate the batch tool from the next turn. Selecting Default SHALL remove the contribution and deactivate the tool from the next turn. Each successful persona selection SHALL append the durable preference and update the displayed agent name. A running turn SHALL retain the persona with which it started. The Presets tab SHALL offer model lineup inspection and non-persistent selection as specified by multiverse-presets, independently of persona selection.

#### Scenario: Switching to Megamind
- **WHEN** a Default parent switches to Megamind
- **THEN** the following turn has both the appended prompt and active batch tool

#### Scenario: Switching to Default
- **WHEN** a Megamind parent switches to Default
- **THEN** the following turn has neither the Megamind contribution nor active batch tool

#### Scenario: Command and key event share the modal
- **WHEN** an enabled TUI user invokes `/multiverse` or emits its Pi Vim key event
- **THEN** the same three-tab modal opens with Vim navigation

#### Scenario: Child sessions placeholder
- **WHEN** the user opens the Child Sessions tab in V1
- **THEN** the modal displays a coming-soon message without offering session actions

#### Scenario: Disabled feature exposes no switch entry point
- **WHEN** Multiverse is disabled at session activation
- **THEN** neither its command nor its Pi Vim key-event handler is activated

#### Scenario: Preset switching is separate from persona switching
- **WHEN** a parent selects a preset through the Presets tab
- **THEN** its parent persona and persisted persona preference remain unchanged
