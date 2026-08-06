## MODIFIED Requirements

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
