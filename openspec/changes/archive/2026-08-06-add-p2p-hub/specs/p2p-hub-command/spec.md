## Purpose

Defines the `/p2p-hub` command and its modal interface: the sole user-facing surface for discovering, inspecting, creating, connecting to, and disconnecting from hubs.

## ADDED Requirements

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

### Requirement: Hub detail view via peek

Selecting a hub in the list SHALL open a detail view showing the hub's name, its host, and its clients — each with agent name, model, context usage (progress bar with percentage), status, description, and cwd — along with connect and disconnect actions. For hubs the session is not connected to, the roster SHALL be obtained via the peek operation without joining. For the currently connected hub, the roster SHALL reflect live local state.

#### Scenario: Viewing an unjoined hub
- **WHEN** the user selects an unjoined hub from the list
- **THEN** the detail view shows that hub's host and clients from a peek snapshot, and the hub's members observe no join event

#### Scenario: Connecting from the detail view
- **WHEN** the user activates the connect action on a hub while not connected to it
- **THEN** the session joins that hub, and if it was connected to a different hub it first disconnects from it

#### Scenario: Disconnecting from the detail view
- **WHEN** the user activates the disconnect action on the currently connected hub
- **THEN** the session leaves the hub and the modal reflects the disconnected state

### Requirement: Create-hub view

The `create new` entry SHALL open a view with a text input for the hub name. Pressing Enter with a valid, non-colliding name SHALL create the hub and connect the session to it as host. While the create view is focused, printable characters (including vim navigation letters) SHALL be treated as text input, not navigation.

#### Scenario: Creating and connecting
- **WHEN** the user enters the name `my-hub` in the create view and presses Enter
- **THEN** a hub named `my-hub` is created, the session becomes its host, and the modal reflects the connected state

#### Scenario: Typing vim letters in the name field
- **WHEN** the user types `j` or `k` while the create view's name input is focused
- **THEN** the characters are appended to the name and no list navigation occurs

#### Scenario: Rejecting a duplicate name
- **WHEN** the user submits a name that matches a live registered hub
- **THEN** the modal shows an error and no hub is created

### Requirement: Vim navigation

The modal SHALL support vim-style navigation (j/k and arrows for movement, Enter to confirm, Esc/q to dismiss or pop back a view) consistent with the vendored modal library's vim scheme. Dismissing from a pushed view SHALL return to the hub list; dismissing from the hub list SHALL close the modal.

#### Scenario: Navigating and backing out
- **WHEN** the user presses `j` twice on the hub list, Enter to open a detail view, then Esc
- **THEN** selection moved down two entries, the detail view opened, and Esc returned to the hub list with the modal still open
