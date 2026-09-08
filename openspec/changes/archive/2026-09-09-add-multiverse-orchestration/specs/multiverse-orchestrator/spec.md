## Purpose

Defines the Megamind parent persona, its dynamic appended prompt, durable switching between parent personas, and the separation between parent and child session roles.

## ADDED Requirements

### Requirement: Megamind parent persona
The system SHALL provide `megamind` as an orchestration-focused parent persona and `default` as the unmodified host persona. Megamind SHALL be selectable only while Multiverse is enabled in a parent session.

#### Scenario: Megamind selected
- **WHEN** an eligible parent session selects Megamind
- **THEN** its next turn receives the orchestration prompt and the batch tool is active

#### Scenario: Default selected
- **WHEN** an eligible parent session selects Default
- **THEN** its next turn receives no Megamind contribution and the batch tool is inactive

### Requirement: Megamind prompt reflects the live roster
The Megamind contribution SHALL be assembled before each applicable agent run from the enabled, registered in-memory roster without reloading definitions or resolving availability again. It SHALL NOT advertise disabled or invalid targets. Unknown tool or skill names SHALL NOT alone exclude an agent. The prompt SHALL describe the configured concurrency and batch limit accurately, and roster entries SHALL use names and parent-facing metadata rather than child prompt bodies or generated tool lists.

#### Scenario: Roster changes
- **WHEN** the enabled valid roster differs between sessions
- **THEN** each Megamind prompt describes only its own live roster

#### Scenario: No usable subagent
- **WHEN** no subagent definition is enabled and valid
- **THEN** Megamind falls back to Default, the batch tool remains inactive, and the user is informed

### Requirement: Resolved activation is reused
Before each agent run, Multiverse SHALL build/apply prompt policy using the resolved registry and current configuration, without reapplying active tools or repeating availability diagnostics. Persona selection SHALL update active state and tools directly without pending-persona or settled-event state; the next run SHALL consume that state.

#### Scenario: Repeated turns reuse activation
- **WHEN** a Megamind parent processes multiple prompts without reactivation
- **THEN** each receives a newly built contribution from the same in-memory roster without repeated availability warnings or Multiverse tool-set mutations

#### Scenario: Current prompt configuration
- **WHEN** the configuration provider reports a different concurrency value before a Megamind turn
- **THEN** the prompt reflects that value without requiring a cloned configuration or cached prompt

### Requirement: Parent prompt is appended
Megamind content SHALL be appended to the host's current parent system prompt rather than replacing it. It SHALL preserve host, user, project, and other-extension prompt contributions and SHALL appear exactly once per applicable turn.

#### Scenario: Host prompt survives
- **WHEN** Megamind runs with existing host and extension prompt content
- **THEN** that content remains and Megamind content is appended

#### Scenario: No accumulation
- **WHEN** several consecutive turns run as Megamind
- **THEN** each turn contains one Megamind contribution

### Requirement: Parent-agent selection is durable and append-only
Each explicit parent-agent switch SHALL append an `arsenal-parent-agent` custom entry naming `default` or `megamind`. On a parent session start or reload, the system SHALL restore the last physically recorded syntactically valid selection in the session file, irrespective of the active conversation branch. When no selection entry exists, the configured `defaultAgent` SHALL apply. When enabled Multiverse has no available subagent, the runtime SHALL fall back to Default and notify the user without rewriting the recorded preference. When Multiverse is disabled, activation SHALL use Default without restoring preferences, issuing roster diagnostics, rewriting saved entries, or registering the Multiverse command and key-event entry points.

#### Scenario: Switch to Megamind persists
- **WHEN** the user switches a parent session to Megamind and later reopens it
- **THEN** Megamind is restored from the latest parent-agent entry

#### Scenario: Later switch wins
- **WHEN** a session contains several parent-agent entries
- **THEN** the last physically recorded valid entry determines the current parent persona

#### Scenario: No recorded selection
- **WHEN** a parent session contains no parent-agent entry
- **THEN** the configured default parent persona is used when eligible, otherwise Default is used with a notice

#### Scenario: Recorded Megamind currently unavailable
- **WHEN** the latest recorded selection is Megamind but no subagent is available in enabled Multiverse
- **THEN** the runtime uses Default, preserves the recorded preference for a future eligible reopen, and informs the user

#### Scenario: Disabled preference remains stored
- **WHEN** Multiverse is disabled in a session with a recorded Megamind preference
- **THEN** it uses Default without restoring or rewriting that preference and without issuing a roster warning

### Requirement: Multiverse persona-switching modal
While Multiverse is enabled, the system SHALL register a `/multiverse` command and matching `PI_VIM_KEY_EVENT` that open the same TUI modal. The modal SHALL use Vim navigation and contain `[Switch Agent]` and `[Child Sessions]` tabs. The child-sessions tab SHALL display a coming-soon placeholder in V1. The switch tab SHALL list Default and Megamind and initially select the active persona. Selecting Megamind SHALL append its prompt and activate the batch tool from the next turn. Selecting Default SHALL remove the contribution and deactivate the tool from the next turn. Each successful selection SHALL append the durable preference and update the displayed agent name. A running turn SHALL retain the persona with which it started.

#### Scenario: Switching to Megamind
- **WHEN** a Default parent switches to Megamind
- **THEN** the following turn has both the appended prompt and active batch tool

#### Scenario: Switching to Default
- **WHEN** a Megamind parent switches to Default
- **THEN** the following turn has neither the Megamind contribution nor active batch tool

#### Scenario: Command and key event share the modal
- **WHEN** an enabled TUI user invokes `/multiverse` or emits its Pi Vim key event
- **THEN** the same two-tab modal opens with Vim navigation

#### Scenario: Child sessions placeholder
- **WHEN** the user opens the Child Sessions tab in V1
- **THEN** the modal displays a coming-soon message without offering session actions

#### Scenario: Disabled feature exposes no switch entry point
- **WHEN** Multiverse is disabled at session activation
- **THEN** neither its command nor its Pi Vim key-event handler is activated

### Requirement: Child identity overrides parent selection
While Multiverse is enabled, a session containing a valid `arsenal-subagent` identity SHALL be treated exclusively as a child. Parent-agent entries SHALL be ignored there, parent-agent switching SHALL be rejected, Megamind SHALL not be injected, and the batch tool SHALL remain inactive.

#### Scenario: Parent switch attempted in a child
- **WHEN** Multiverse is enabled and the user attempts to select Default or Megamind while a child session is open
- **THEN** both options are visibly disabled, confirmation has no effect, and the child role remains active

#### Scenario: Child contains historical parent entry
- **WHEN** Multiverse is enabled and a child session contains a parent-agent entry
- **THEN** its child identity remains authoritative and the parent entry has no effect
