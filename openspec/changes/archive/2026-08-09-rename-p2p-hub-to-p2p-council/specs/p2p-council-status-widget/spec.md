## Purpose

Defines the always-visible connection status box: a compact bordered widget showing council members, their models, and context usage while the session is connected to a council.

## ADDED Requirements

### Requirement: Status box visibility tied to connection

The system SHALL render a p2p-council status box only while the Pi process is connected to a council and the current runtime is enabled, and SHALL remove it entirely when the process disconnects or the feature becomes disabled. The box SHALL be rendered via the extension widget mechanism with below-editor placement and SHALL NOT replace or modify the footer, so custom footer renderings from other plugins are unaffected. After an enabled extension runtime replaces another runtime in the same connected Pi process, the replacement runtime SHALL immediately restore the status box from the preserved connection state.

#### Scenario: Appears on connect
- **WHEN** the session connects to a council
- **THEN** the status box appears below the editor without altering the footer

#### Scenario: Disappears on disconnect
- **WHEN** the Pi process disconnects from its council (including council dissolution)
- **THEN** the status box is removed and no residual widget content remains

#### Scenario: Coexists with a custom footer
- **WHEN** another plugin has installed a custom footer and the session connects to a council
- **THEN** the custom footer continues to render unchanged with the status box shown above it

#### Scenario: Restored after runtime replacement
- **WHEN** an enabled replacement TUI runtime binds to an existing connected process-scoped p2p service
- **THEN** the status box immediately shows the preserved council and roster without requiring the user to reconnect

### Requirement: Status box content and format

The status box SHALL render a terminal-width-aware frame titled with the connected council's name, one aligned row per council member (excluding peekers), and a singular or plural member count in the bottom border. The top and bottom borders SHALL span the available widget width, member rows SHALL omit vertical side borders, and each row SHALL show a status indicator, agent name, canonical model ID, and context usage as a progress bar with percentage (for example, `[###-----------] 17%`). Columns SHALL align across member rows by terminal display width. Inter-field spacing SHALL grow only to a bounded maximum so content does not spread excessively on wide terminals. On narrow terminals the layout SHALL remain within the available width by reducing gaps, shortening the context bar, and truncating text with an ellipsis while prioritizing the status indicator, agent name, and numeric context percentage. Rows SHALL update through the existing p2p-council state-change behavior as members join, leave, or change status, model, or context.

#### Scenario: Rendering members
- **WHEN** the session is connected to a council with multiple members and enough terminal width for their complete fields
- **THEN** the widget shows one row per member with aligned status, name, model-ID, and context columns, full-width horizontal borders, no vertical row borders, and the member count in the bottom border

#### Scenario: Wide terminal uses bounded spacing
- **WHEN** the terminal becomes substantially wider than the complete preferred member-row content
- **THEN** the horizontal borders expand to the available widget width while inter-field gaps stop growing at their configured maximum

#### Scenario: Narrow terminal degrades without overflow
- **WHEN** the available widget width cannot fit the preferred row layout
- **THEN** the widget reduces spacing, shortens the context bar, and truncates lower-priority text as needed, and every rendered line remains within the available width

#### Scenario: Live updates
- **WHEN** a member's model or context usage changes or a member joins or leaves the council
- **THEN** the box re-renders through the existing state-update lifecycle with aligned current values and the updated count
