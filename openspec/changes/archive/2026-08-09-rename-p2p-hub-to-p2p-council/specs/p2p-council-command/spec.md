## Purpose

Defines the `/p2p-council` command and its modal interface: the sole user-facing surface for discovering, inspecting, creating, connecting to, and disconnecting from councils.

## ADDED Requirements

### Requirement: /p2p-council opens the council modal

The system SHALL provide a `/p2p-council` command that opens a modal showing the currently connected council (if any) and the list of available councils from the registry, plus a `create new` entry. Council connection and disconnection SHALL be performed exclusively through this modal (no auto-connect at startup). The modal SHALL also open in response to the extension's vim key event (`PI_VIM_KEY_EVENT_ID`).

#### Scenario: Opening the modal while connected
- **WHEN** the user runs `/p2p-council` while connected to council "frontend"
- **THEN** the modal shows "frontend" marked as the current/connected council and lists other available councils and the `create new` entry

#### Scenario: Opening via vim key event
- **WHEN** the p2p-council Vim key event is emitted while the extension is enabled
- **THEN** the council modal opens exactly as it does for `/p2p-council`

#### Scenario: Legacy command is absent
- **WHEN** the p2p-council extension is enabled
- **THEN** `/p2p-council` is registered and `/p2p-hub` is not registered as an alias

#### Scenario: Stale councils excluded
- **WHEN** the modal opens and a registry entry fails liveness validation
- **THEN** that council is not shown in the available list

### Requirement: Configured modal presentation

The council list, its pushed detail views, and its create-name view SHALL use the configured p2p-council modal layout for their entire interaction. `inline` SHALL use inline framing and placement, while `overlay` SHALL use a centered bordered overlay; entering council creation SHALL NOT switch an overlay interaction to an inline native prompt.

#### Scenario: Inline presentation
- **WHEN** `p2p_council.layout` is `inline` and the user opens the council modal and selects `create new`
- **THEN** both the council list and create-name view remain in the inline custom modal

#### Scenario: Overlay presentation
- **WHEN** `p2p_council.layout` is `overlay` and the user opens the council modal and selects `create new`
- **THEN** both the council list and create-name view remain in the same overlay interaction

### Requirement: Visible council-list selection

The council list SHALL visually distinguish exactly the currently navigated option using an accent-colored cursor and selected text. Non-selected options SHALL use non-selected indentation and styling, and a connected marker SHALL retain its connection-status styling independently of selection.

#### Scenario: Moving list selection
- **WHEN** the user moves from one council-list option to another
- **THEN** the accent cursor and selected text move to the newly selected option and the previous option returns to non-selected styling

### Requirement: Council detail view via peek

Selecting a council in the list SHALL open a detail view showing the council's name, its actual host, and its actual clients — each with agent name, canonical model ID, context usage (progress bar with percentage), status, description, and cwd — along with connect and disconnect actions. For councils the session is not connected to, the roster SHALL be obtained via the peek operation without joining. For the currently connected council, the roster SHALL reflect live local state, classify the viewing session by its actual host/client role, and update while the view remains open.

#### Scenario: Viewing an unjoined council
- **WHEN** the user selects an unjoined council whose member uses model ID `gpt-5.6-sol`
- **THEN** the detail view shows that council's host and clients from a peek snapshot with `gpt-5.6-sol` as the member's model, and the council's members observe no join event

#### Scenario: Connecting from the detail view
- **WHEN** the user activates the connect action on a council while not connected to it
- **THEN** the session joins that council, any previous council connection is disconnected first, and the detail view immediately shows the established host and complete client roster with the joining session classified as a client

#### Scenario: Live roster change while detail remains open
- **WHEN** the connected council's membership, member status, or member model changes while its detail view is open
- **THEN** the open detail view reflects the new live roster, status, or canonical model ID without requiring the user to close and reopen the modal

#### Scenario: Disconnecting from the detail view
- **WHEN** the user activates the disconnect action on the currently connected council
- **THEN** the session leaves the council and the modal reflects the disconnected state

### Requirement: Create-council view

The `create new` entry SHALL push a text-focused view inside the current custom modal and configured layout. Pressing Enter with a valid, non-colliding name SHALL create the council and connect the session to it as host. While the create view is focused, all printable characters, including Vim navigation and dismiss letters, SHALL be treated as text input; Esc SHALL return to the council list without creating a council.

#### Scenario: Creating and connecting
- **WHEN** the user enters the name `my-council` in the create view and presses Enter
- **THEN** a council named `my-council` is created, the session becomes its host, and the modal reflects the connected state

#### Scenario: Typing vim letters in the name field
- **WHEN** the user types `j`, `k`, `g`, or `q` while the create view's name input is focused
- **THEN** each character is appended to the name and no list navigation or dismissal occurs

#### Scenario: Cancelling creation
- **WHEN** the user presses Esc while the create-name view is focused
- **THEN** the create view is popped, the existing council list is shown in the same configured layout, and no council is created

#### Scenario: Rejecting a duplicate name
- **WHEN** the user submits a name that matches a live registered council
- **THEN** the create view shows an error and no council is created

### Requirement: Vim navigation

Outside a text-focused view, the modal SHALL support vim-style navigation (j/k and arrows for movement, Enter to confirm, Esc/q to dismiss or pop back a view) consistent with the vendored modal library's vim scheme. A text-focused view SHALL receive raw input before the Vim scheme, with Esc reserved for popping the view. Dismissing from a pushed view SHALL return to the council list; dismissing from the council list SHALL close the modal.

#### Scenario: Navigating and backing out
- **WHEN** the user presses `j` twice on the council list, Enter to open a detail view, then Esc
- **THEN** selection moves down two entries, the detail view opens, and Esc returns to the council list with the modal still open

#### Scenario: Dismiss letter is text while entering a name
- **WHEN** the user presses `q` in the create-name view
- **THEN** `q` is entered into the name rather than dismissing the view
