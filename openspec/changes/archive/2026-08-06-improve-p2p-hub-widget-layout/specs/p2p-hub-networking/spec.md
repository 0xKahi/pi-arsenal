## MODIFIED Requirements

### Requirement: Agent identity resolution

An agent's identity SHALL consist of a name, an optional description, its canonical Pi model ID, its cwd, its status, and its context usage. The canonical model ID SHALL be sourced from the active model's `id` value rather than its human-readable display name. Name and description SHALL be read from `<cwd>/.arsenal/p2p-role.yml` (keys `name`, `description`) where cwd is the directory pi was launched from, with no upward directory traversal. When the file is absent or omits `name`, the name SHALL default to the basename of the cwd. The hub SHALL deduplicate colliding names by appending a numeric suffix.

#### Scenario: Default name from cwd
- **WHEN** an agent launched in `/some/path/plugin_repository` with no `.arsenal/p2p-role.yml` connects to a hub
- **THEN** it is registered under the name `plugin_repository`

#### Scenario: Custom identity from p2p-role.yml
- **WHEN** `<cwd>/.arsenal/p2p-role.yml` contains `name: reviewer` and `description: reviews PRs`
- **THEN** the agent registers as `reviewer` and its description is visible to other members

#### Scenario: Canonical model identity
- **WHEN** the active model has ID `gpt-5.6-sol` and display name `GPT-5.6 Sol`
- **THEN** the agent identity advertises `gpt-5.6-sol` as its model

#### Scenario: Name collision
- **WHEN** a second agent registers with a name already taken on the hub
- **THEN** the hub assigns it a deduplicated name (e.g. `reviewer-2`) and informs the joining agent

### Requirement: Membership and status propagation

Members of a hub SHALL maintain an explicit topology that identifies exactly one host and zero or more clients, independently of whether a member is the local session. A joining client's welcome handshake SHALL explicitly identify the host and existing clients and carry their identities and statuses. A join SHALL report success only after that welcome handshake has assigned the joiner's final name and initialized its complete roster. Members SHALL subsequently receive join/leave notifications and status updates for all other members. Status updates SHALL carry the member's current activity state (idle, thinking, or the active tool name), canonical model ID, and context usage (tokens and context window), so consumers can render usage without additional queries.

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
- **THEN** other members' view of that agent's status reflects `tool:<name>` until the state changes and associates the update with that member's canonical model ID
