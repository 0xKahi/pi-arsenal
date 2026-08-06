## MODIFIED Requirements

### Requirement: Membership and status propagation

Members of a hub SHALL maintain an explicit topology that identifies exactly one host connection type and zero or more client connection types, independently of whether a member is the local session. A joining client's welcome handshake SHALL explicitly identify the host and existing clients and carry their identities and statuses. A join SHALL report success only after that welcome handshake has assigned the joiner's final name and initialized its complete roster. Members SHALL subsequently receive join/leave notifications and status updates for all other members. Status updates SHALL carry the member's current activity state (idle, thinking, or the active tool name), canonical model ID, and context usage (tokens and context window), so consumers can render usage without additional queries.

#### Scenario: Join visibility
- **WHEN** a new agent joins a hub with an existing host and clients
- **THEN** existing members are notified of the new client's full identity, and the join operation completes only after the joiner knows the actual host, all existing clients, their statuses, and its final assigned name

#### Scenario: Joining session retains client role
- **WHEN** an agent connects as a client and receives its welcome handshake
- **THEN** its local roster classifies the remote hub owner with connection type `host` and itself and all other non-host members with connection type `client` while separately identifying itself as the local member

#### Scenario: Welcome handshake does not arrive
- **WHEN** a transport connection opens but no valid welcome handshake arrives within the join timeout
- **THEN** the join fails, the partial connection is closed, and the session does not report itself as connected

#### Scenario: Status change propagates
- **WHEN** a member's agent starts running a tool
- **THEN** other members' view of that agent's status reflects `tool:<name>` until the state changes and associates the update with that member's canonical model ID

### Requirement: Process-scoped connection across runtime replacement

A connected hub membership SHALL belong to the running Pi process rather than to one replaceable extension runtime. When Pi replaces the extension runtime for reload, new, resume, or fork while retaining the process, the system SHALL preserve the same transport connection, hub name, host/client connection type, assigned member name, roster, and queued inbound chat messages. The replacement runtime SHALL bind to that connection without producing a member leave/join cycle or creating a second local member. Final Pi process shutdown SHALL close the preserved connection using the existing clean shutdown behavior.

#### Scenario: Hosted hub survives reload
- **WHEN** a Pi process hosting a hub replaces its extension runtime for `/reload`
- **THEN** its server remains reachable on the same port, its registry entry continues to identify the same process, connected clients observe neither a host loss nor a membership cycle, and the replacement runtime reports the same host connection type

#### Scenario: Client connection survives session replacement
- **WHEN** a connected client starts, resumes, or forks a session without exiting Pi
- **THEN** the replacement runtime reports the client connected under the same assigned name and client connection type, and the hub observes no leave or duplicate join

#### Scenario: Final process shutdown
- **WHEN** Pi exits while its process-scoped p2p service is connected
- **THEN** the connection is closed, a hosting process performs clean registry cleanup, and connected clients follow the existing host-loss behavior
