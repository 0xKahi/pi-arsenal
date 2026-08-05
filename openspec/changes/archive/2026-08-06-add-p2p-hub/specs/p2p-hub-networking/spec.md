## Purpose

Defines the hub-and-spoke networking layer for pi-to-pi communication: named hub lifecycle, discovery via a per-user registry, agent identity, membership, host-death promotion, and the peek roster query.

## ADDED Requirements

### Requirement: Named hubs as independent localhost servers

The system SHALL support multiple concurrently running hubs, each identified by a unique name and served on its own `127.0.0.1` port. Agents connected to one hub SHALL NOT be visible to or reachable from agents on another hub.

#### Scenario: Two hubs are isolated
- **WHEN** agent A is connected to hub "frontend" and agent B is connected to hub "infra"
- **THEN** neither agent appears in the other's member list and messages cannot be exchanged between them

#### Scenario: Creating a hub
- **WHEN** an agent creates a hub with a name not present in the registry
- **THEN** a server is started on an available localhost port, the creating agent becomes the hub host, and a registry entry is written for the hub

#### Scenario: Creating a hub whose name already exists
- **WHEN** an agent attempts to create a hub with a name that has a live registry entry
- **THEN** the creation is rejected with an error identifying the existing hub

### Requirement: Hub registry with staleness detection

The system SHALL maintain a per-user registry of hubs, one file per hub at `~/.arsenal/p2p-hubs/<name>.json`, recording at least the hub name, port, host process id, and creation time. Registry writes SHALL be atomic. Before presenting or connecting to a registered hub, the system SHALL validate the entry (host process liveness and/or connect probe) and SHALL prune entries that fail validation.

#### Scenario: Stale entry pruned
- **WHEN** a registry entry's host process is dead and no server answers on the recorded port
- **THEN** the entry is removed and the hub is not listed as available

#### Scenario: Clean shutdown removes the entry
- **WHEN** a hub host disconnects intentionally and no clients remain to promote
- **THEN** the hub's registry entry is removed

### Requirement: Agent identity resolution

An agent's identity SHALL consist of a name, an optional description, its model, its cwd, its status, and its context usage. Name and description SHALL be read from `<cwd>/.arsenal/p2p-role.yml` (keys `name`, `description`) where cwd is the directory pi was launched from, with no upward directory traversal. When the file is absent or omits `name`, the name SHALL default to the basename of the cwd. The hub SHALL deduplicate colliding names by appending a numeric suffix.

#### Scenario: Default name from cwd
- **WHEN** an agent launched in `/some/path/plugin_repository` with no `.arsenal/p2p-role.yml` connects to a hub
- **THEN** it is registered under the name `plugin_repository`

#### Scenario: Custom identity from p2p-role.yml
- **WHEN** `<cwd>/.arsenal/p2p-role.yml` contains `name: reviewer` and `description: reviews PRs`
- **THEN** the agent registers as `reviewer` and its description is visible to other members

#### Scenario: Name collision
- **WHEN** a second agent registers with a name already taken on the hub
- **THEN** the hub assigns it a deduplicated name (e.g. `reviewer-2`) and informs the joining agent

### Requirement: Membership and status propagation

Members of a hub SHALL receive join/leave notifications and status updates for all other members. Status updates SHALL carry the member's current activity state (idle, thinking, or the active tool name), model, and context usage (tokens and context window), so consumers can render usage without additional queries.

#### Scenario: Join visibility
- **WHEN** a new agent joins a hub
- **THEN** existing members are notified of the new member's full identity, and the joiner receives the current roster

#### Scenario: Status change propagates
- **WHEN** a member's agent starts running a tool
- **THEN** other members' view of that agent's status reflects `tool:<name>` until the state changes

### Requirement: Host-death promotion

When the hub host terminates without a clean hub shutdown, remaining clients SHALL race, after a jittered delay, to bind the hub's recorded port. Exactly one client SHALL win (port binding is the arbiter), become the new host, and atomically update the registry entry with its own process id while preserving the hub name and port. Losing clients SHALL reconnect to the new host as clients. The hub SHALL remain addressable under the same name and port across promotion.

#### Scenario: Promotion after host crash
- **WHEN** a hub host process dies while two clients are connected
- **THEN** one client becomes the new host on the same port, the other reconnects as its client, and the registry entry reflects the new host

#### Scenario: Manual disconnect does not trigger promotion for the leaver
- **WHEN** a client disconnects from a hub intentionally
- **THEN** it does not attempt to rejoin or promote, and remaining members continue undisturbed

### Requirement: Peek roster query

The system SHALL support a peek operation: a short-lived connection to a hub that requests the current roster (host and clients with full identity: name, model, context usage, status, description, cwd) without registering as a member. Peekers SHALL NOT appear in any member list, status update, or member-visible notification.

#### Scenario: Peek returns roster without joining
- **WHEN** an agent peeks a hub it is not connected to
- **THEN** it receives the hub's current roster and the hub's members observe no join or leave event
