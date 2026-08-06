## Purpose

Defines the `/p2p-hub` command and its modal interface: the sole user-facing surface for discovering, inspecting, creating, connecting to, and disconnecting from hubs.

## Requirements

### Requirement: /p2p-hub opens the hub modal

The system SHALL provide a `/p2p-hub` command that opens a modal showing the currently connected hub (if any) and the list of available hubs from the registry, plus a `create new` entry. Hub connection and disconnection SHALL be performed exclusively through this modal (no auto-connect at startup). The modal SHALL also open in response to the extension's vim key event (`PI_VIM_KEY_EVENT_ID`).

#### Scenario: Opening the modal while connected
- **WHEN** the user runs `/p2p-hub` while connected to hub "frontend"
- **THEN** the modal shows "frontend" marked as the current/connected hub and lists other available hubs and the `create new` entry

#### Scenario: Opening via vim key event
- **WHEN** the `PI_VIM_KEY_EVENT_ID` event is emitted while the extension is enabled
- **THEN** the hub modal opens exactly as it does for `/p2p-hub`

#### Scenario: Stale hubs excluded
- **WHEN** the modal opens and a registry entry fails liveness validation
- **THEN** that hub is not shown in the available list

### Requirement: Configured modal presentation

The hub list, its pushed detail views, and its create-name view SHALL use the configured p2p-hub modal layout for their entire interaction. `inline` SHALL use inline framing and placement, while `overlay` SHALL use a centered bordered overlay; entering hub creation SHALL NOT switch an overlay interaction to an inline native prompt.

#### Scenario: Inline presentation
- **WHEN** `p2p_hub.layout` is `inline` and the user opens the hub modal and selects `create new`
- **THEN** both the hub list and create-name view remain in the inline custom modal

#### Scenario: Overlay presentation
- **WHEN** `p2p_hub.layout` is `overlay` and the user opens the hub modal and selects `create new`
- **THEN** both the hub list and create-name view remain in the same overlay interaction

### Requirement: Visible hub-list selection

The hub list SHALL visually distinguish exactly the currently navigated option using an accent-colored cursor and selected text. Non-selected options SHALL use non-selected indentation and styling, and a connected marker SHALL retain its connection-status styling independently of selection.

#### Scenario: Moving list selection
- **WHEN** the user moves from one hub-list option to another
- **THEN** the accent cursor and selected text move to the newly selected option and the previous option returns to non-selected styling

### Requirement: Hub detail view via peek

Selecting a hub in the list SHALL open a detail view showing the hub's name, its actual host, and its actual clients — each with agent name, canonical model ID, context usage (progress bar with percentage), status, description, and cwd — along with connect and disconnect actions. For hubs the session is not connected to, the roster SHALL be obtained via the peek operation without joining. For the currently connected hub, the roster SHALL reflect live local state, classify the viewing session by its actual host/client role, and update while the view remains open.

#### Scenario: Viewing an unjoined hub
- **WHEN** the user selects an unjoined hub whose member uses model ID `gpt-5.6-sol`
- **THEN** the detail view shows that hub's host and clients from a peek snapshot with `gpt-5.6-sol` as the member's model, and the hub's members observe no join event

#### Scenario: Connecting from the detail view
- **WHEN** the user activates the connect action on a hub while not connected to it
- **THEN** the session joins that hub, any previous hub connection is disconnected first, and the detail view immediately shows the established host and complete client roster with the joining session classified as a client

#### Scenario: Live roster change while detail remains open
- **WHEN** the connected hub's membership, member status, or member model changes while its detail view is open
- **THEN** the open detail view reflects the new live roster, status, or canonical model ID without requiring the user to close and reopen the modal

#### Scenario: Disconnecting from the detail view
- **WHEN** the user activates the disconnect action on the currently connected hub
- **THEN** the session leaves the hub and the modal reflects the disconnected state

### Requirement: Create-hub view

The `create new` entry SHALL push a text-focused view inside the current custom modal and configured layout. Pressing Enter with a valid, non-colliding name SHALL create the hub and connect the session to it as host. While the create view is focused, all printable characters, including Vim navigation and dismiss letters, SHALL be treated as text input; Esc SHALL return to the hub list without creating a hub.

#### Scenario: Creating and connecting
- **WHEN** the user enters the name `my-hub` in the create view and presses Enter
- **THEN** a hub named `my-hub` is created, the session becomes its host, and the modal reflects the connected state

#### Scenario: Typing vim letters in the name field
- **WHEN** the user types `j`, `k`, `g`, or `q` while the create view's name input is focused
- **THEN** each character is appended to the name and no list navigation or dismissal occurs

#### Scenario: Cancelling creation
- **WHEN** the user presses Esc while the create-name view is focused
- **THEN** the create view is popped, the existing hub list is shown in the same configured layout, and no hub is created

#### Scenario: Rejecting a duplicate name
- **WHEN** the user submits a name that matches a live registered hub
- **THEN** the create view shows an error and no hub is created

### Requirement: Vim navigation

Outside a text-focused view, the modal SHALL support vim-style navigation (j/k and arrows for movement, Enter to confirm, Esc/q to dismiss or pop back a view) consistent with the vendored modal library's vim scheme. A text-focused view SHALL receive raw input before the Vim scheme, with Esc reserved for popping the view. Dismissing from a pushed view SHALL return to the hub list; dismissing from the hub list SHALL close the modal.

#### Scenario: Navigating and backing out
- **WHEN** the user presses `j` twice on the hub list, Enter to open a detail view, then Esc
- **THEN** selection moves down two entries, the detail view opens, and Esc returns to the hub list with the modal still open

#### Scenario: Dismiss letter is text while entering a name
- **WHEN** the user presses `q` in the create-name view
- **THEN** `q` is entered into the name rather than dismissing the view
