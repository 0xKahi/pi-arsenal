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
The Megamind prompt SHALL be assembled at runtime from subagents that are currently enabled and successfully loaded. It SHALL NOT advertise disabled or invalid targets.

#### Scenario: Roster changes
- **WHEN** the enabled valid roster differs between sessions
- **THEN** each Megamind prompt describes only its own live roster

#### Scenario: No usable subagent
- **WHEN** no subagent definition is enabled and valid
- **THEN** Megamind falls back to Default, the batch tool remains inactive, and the user is informed

### Requirement: Parent prompt is appended
Megamind content SHALL be appended to the host's current parent system prompt rather than replacing it. It SHALL preserve host, user, project, and other-extension prompt contributions and SHALL appear exactly once per applicable turn.

#### Scenario: Host prompt survives
- **WHEN** Megamind runs with existing host and extension prompt content
- **THEN** that content remains and Megamind content is appended

#### Scenario: No accumulation
- **WHEN** several consecutive turns run as Megamind
- **THEN** each turn contains one Megamind contribution

### Requirement: Parent-agent selection is durable and append-only
Each explicit parent-agent switch SHALL append an `arsenal-parent-agent` custom entry naming `default` or `megamind`. On a parent session start or reload, the system SHALL restore the last physically recorded syntactically valid selection in the session file, irrespective of the active conversation branch. When no selection entry exists, the configured `defaultAgent` SHALL apply. If the selected persona is not currently eligible because Multiverse is disabled or no subagent is available, the runtime SHALL fall back to Default and notify the user without rewriting the recorded preference.

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
- **WHEN** the latest recorded selection is Megamind but Multiverse is disabled or no subagent is available
- **THEN** the runtime uses Default, preserves the recorded preference for a future eligible reopen, and informs the user

### Requirement: Parent prompt and tool switch together
Selecting Megamind SHALL append its prompt and activate the batch tool from the next turn. Selecting Default SHALL remove the contribution and deactivate the tool from the next turn. A running turn SHALL retain the persona with which it started.

#### Scenario: Switching to Megamind
- **WHEN** a Default parent switches to Megamind
- **THEN** the following turn has both the appended prompt and active batch tool

#### Scenario: Switching to Default
- **WHEN** a Megamind parent switches to Default
- **THEN** the following turn has neither the Megamind contribution nor active batch tool

### Requirement: Child identity overrides parent selection
A session containing a valid `arsenal-subagent` identity SHALL be treated exclusively as a child. Parent-agent entries SHALL be ignored there, parent-agent switching SHALL be rejected, Megamind SHALL not be injected, and the batch tool SHALL remain inactive.

#### Scenario: Parent switch attempted in a child
- **WHEN** the user attempts to select Default or Megamind while a child session is open
- **THEN** the switch is rejected and the child role remains active

#### Scenario: Child contains historical parent entry
- **WHEN** a child session contains a parent-agent entry
- **THEN** its child identity remains authoritative and the parent entry has no effect
