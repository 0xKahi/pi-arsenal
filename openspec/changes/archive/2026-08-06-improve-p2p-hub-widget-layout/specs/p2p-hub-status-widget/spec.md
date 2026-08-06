## MODIFIED Requirements

### Requirement: Status box content and format

The status box SHALL render a terminal-width-aware frame titled with the connected hub's name, one aligned row per hub member (excluding peekers), and a singular or plural member count in the bottom border. The top and bottom borders SHALL span the available widget width, member rows SHALL omit vertical side borders, and each row SHALL show a status indicator, agent name, canonical model ID, and context usage as a progress bar with percentage (for example, `[###-----------] 17%`). Columns SHALL align across member rows by terminal display width. Inter-field spacing SHALL grow only to a bounded maximum so content does not spread excessively on wide terminals. On narrow terminals the layout SHALL remain within the available width by reducing gaps, shortening the context bar, and truncating text with an ellipsis while prioritizing the status indicator, agent name, and numeric context percentage. Rows SHALL update through the existing p2p-hub state-change behavior as members join, leave, or change status, model, or context.

#### Scenario: Rendering members
- **WHEN** the session is connected to a hub with multiple members and enough terminal width for their complete fields
- **THEN** the widget shows one row per member with aligned status, name, model-ID, and context columns, full-width horizontal borders, no vertical row borders, and the member count in the bottom border

#### Scenario: Wide terminal uses bounded spacing
- **WHEN** the terminal becomes substantially wider than the complete preferred member-row content
- **THEN** the horizontal borders expand to the available widget width while inter-field gaps stop growing at their configured maximum

#### Scenario: Narrow terminal degrades without overflow
- **WHEN** the available widget width cannot fit the preferred row layout
- **THEN** the widget reduces spacing, shortens the context bar, and truncates lower-priority text as needed, and every rendered line remains within the available width

#### Scenario: Live updates
- **WHEN** a member's model or context usage changes or a member joins or leaves the hub
- **THEN** the box re-renders through the existing state-update lifecycle with aligned current values and the updated count
