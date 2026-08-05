## MODIFIED Requirements

### Requirement: Membership and status propagation

Members of a hub SHALL maintain an explicit topology that identifies exactly one host and zero or more clients, independently of whether a member is the local session. A joining client's welcome handshake SHALL explicitly identify the host and existing clients and carry their identities and statuses. A join SHALL report success only after that welcome handshake has assigned the joiner's final name and initialized its complete roster. Members SHALL subsequently receive join/leave notifications and status updates for all other members. Status updates SHALL carry the member's current activity state (idle, thinking, or the active tool name), model, and context usage (tokens and context window), so consumers can render usage without additional queries.

#### Scenario: Join visibility
- **WHEN** a new agent joins a hub with an existing host and clients
- **THEN** existing members are notified of the new client's full identity, and the join operation completes only after the joiner knows the actual host, all existing clients, their statuses, and its final assigned name

#### Scenario: Joining session retains client role
- **WHEN** an agent connects as a client and receives its welcome handshake
- **THEN** its local roster classifies the remote hub owner as host and itself and all other non-host members as clients while separately identifying itself as the local member

#### Scenario: Welcome handshake does not arrive
- **WHEN** a transport connection opens but no valid welcome handshake arrives within the join timeout
- **THEN** the join fails, the partial connection is closed, and the session does not report itself as connected

#### Scenario: Status change propagates
- **WHEN** a member's agent starts running a tool
- **THEN** other members' view of that agent's status reflects `tool:<name>` until the state changes
