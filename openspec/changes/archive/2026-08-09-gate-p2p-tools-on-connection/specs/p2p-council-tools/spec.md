## ADDED Requirements

### Requirement: Tool activation gated on council connection

The p2p tools SHALL be active only while the extension is enabled and the process-scoped council
state is connected. While no council connection exists, `p2p_send`, `p2p_ask`, and `p2p_ls` SHALL
be absent from the model's tool list, from the system prompt's available-tools listing, and from
its guidelines section, so that a disconnected agent receives no indication that p2p messaging
exists. Deactivation SHALL NOT unregister the tools: their definitions remain resolvable so that
restored history continues to render p2p tool calls correctly.

#### Scenario: Fresh session with no council connection
- **WHEN** a session starts with `p2p_council.enabled: true` and the process holds no council connection
- **THEN** `p2p_send`, `p2p_ask`, and `p2p_ls` are not offered to the model and no p2p tool text appears in the system prompt

#### Scenario: Restored history renders while tools are inactive
- **WHEN** a session restores history containing prior p2p tool calls and no council connection exists
- **THEN** those tool calls render with their own renderers rather than Pi's fallback rendering, while the tools stay inactive

#### Scenario: Disabled feature
- **WHEN** a session starts with `p2p_council.enabled: false`
- **THEN** the p2p tools are inactive regardless of any connection state

### Requirement: Tool activation follows user connection actions

Joining or creating a council SHALL activate the three p2p tools, and manually disconnecting from a
council SHALL deactivate them. Activation state SHALL follow only these deliberate user actions and
the per-session reconciliation; automatic connection churn SHALL NOT change it. In particular, when
a client loses its host and the extension is retrying or promoting itself to host, the tools SHALL
remain active, because the user has not left the council.

#### Scenario: User creates a council
- **WHEN** the user creates a council from the `/p2p-council` modal and hosting starts successfully
- **THEN** the three p2p tools become available to the model without requiring a new session

#### Scenario: User joins a council
- **WHEN** the user joins an existing council from the `/p2p-council` modal and the join succeeds
- **THEN** the three p2p tools become available to the model without requiring a new session

#### Scenario: User disconnects
- **WHEN** the user disconnects from the connected council in the `/p2p-council` modal
- **THEN** the three p2p tools are withdrawn from the model and their prompt text is removed

#### Scenario: Failed join leaves tools inactive
- **WHEN** the user attempts to join a council and the connection fails
- **THEN** the tools remain inactive

#### Scenario: Host loss during promotion
- **WHEN** a connected client loses its host and the extension is retrying the connection or promoting itself to host
- **THEN** the tools remain active throughout, because the user did not disconnect

### Requirement: Connection state reconciled at session start

On every session start the extension SHALL reconcile tool activation against the current enablement
and connection state, so that a council connection preserved across a session replacement is
reflected in the new session's tool list and a session that begins without a connection does not
expose the tools.

#### Scenario: Preserved connection across session replacement
- **WHEN** a session is reloaded, forked, resumed, or replaced while the process-scoped council connection is live
- **THEN** the new session offers the three p2p tools without the user reconnecting

#### Scenario: Session start without a connection
- **WHEN** a session starts while the process holds no council connection
- **THEN** the p2p tools are not offered, even if the host runtime pre-activated all extension tools during startup

## MODIFIED Requirements

### Requirement: Tool behavior while disconnected

While the extension is active, all three tools SHALL remain registered regardless of council
connection state, though they are only active while connected. If a tool is nevertheless invoked
without a council connection, it SHALL return a non-throwing error result stating that no council
is connected and directing the caller to `/p2p-council`, rather than throwing or terminating the
turn. This covers calls that were issued while connected but resolve after the connection ends,
and calls made during automatic reconnection or host promotion.

#### Scenario: Tool called while disconnected
- **WHEN** `p2p_ls` is invoked and the session is not connected to any council
- **THEN** the tool returns an error result indicating no council connection and referencing the `/p2p-council` command

#### Scenario: Connection ends while a call is in flight
- **WHEN** the user disconnects while a p2p tool call issued earlier in the same turn is still executing
- **THEN** the call resolves with the no-connection error result instead of failing the turn
