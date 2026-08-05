## Purpose

Defines the always-visible connection status box: a compact bordered widget showing hub members, their models, and context usage while the session is connected to a hub.

## ADDED Requirements

### Requirement: Status box visibility tied to connection

The system SHALL render a p2p-hub status box only while the session is connected to a hub, and SHALL remove it entirely when the session disconnects. The box SHALL be rendered via the extension widget mechanism with below-editor placement and SHALL NOT replace or modify the footer, so custom footer renderings from other plugins are unaffected.

#### Scenario: Appears on connect
- **WHEN** the session connects to a hub
- **THEN** the status box appears below the editor without altering the footer

#### Scenario: Disappears on disconnect
- **WHEN** the session disconnects from its hub (including hub dissolution)
- **THEN** the status box is removed and no residual widget content remains

#### Scenario: Coexists with a custom footer
- **WHEN** another plugin has installed a custom footer and the session connects to a hub
- **THEN** the custom footer continues to render unchanged with the status box shown above it

### Requirement: Status box content and format

The status box SHALL render a bordered frame titled `p2p-hub`, one row per hub member (excluding peekers) showing a status indicator dot, the agent name, its model, and its context usage as a progress bar with percentage (e.g. `[###-----------] 17%`), and a member count in the bottom border. Rows SHALL update as members join, leave, or change status/context.

#### Scenario: Rendering members
- **WHEN** the session is connected to a hub with two other members
- **THEN** the box shows two rows, each with a dot, agent name, model, and a context-usage bar with percentage, and the border shows the member count

#### Scenario: Live updates
- **WHEN** a member's context usage changes or a member leaves the hub
- **THEN** the box re-renders to reflect the new usage or the removed row and updated count
