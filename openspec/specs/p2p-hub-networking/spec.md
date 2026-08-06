## Purpose

Defines the hub-and-spoke networking layer for pi-to-pi communication: named hub lifecycle, discovery via a per-user registry, agent identity, membership, host-death promotion, and the peek roster query.

## Requirements

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

### Requirement: Runtime rebinding and detached-runtime handling

The process-scoped connection SHALL allow at most one current extension runtime binding. Rebinding SHALL replace stale API, session context, event, and UI references with those from the current runtime and SHALL publish current idle, model, and context information. While no runtime is attached, inbound chat messages SHALL remain queued for delivery after attachment, remote prompt requests SHALL receive a prompt-response error indicating temporary runtime unavailability, and pending runtime-owned prompt operations SHALL terminate rather than survive into an unrelated runtime. If no replacement runtime attaches within a bounded handoff interval, the process-scoped connection SHALL shut down cleanly.

#### Scenario: Replacement runtime binds
- **WHEN** a replacement enabled runtime starts while the process-scoped service is connected
- **THEN** it becomes the sole active binding, receives queued chat messages according to their requested turn behavior, and publishes status using the replacement session's current model and context

#### Scenario: Chat arrives during runtime handoff
- **WHEN** a hub member sends chat while the connected process has no attached extension runtime during replacement
- **THEN** the message remains queued and is delivered once the replacement runtime binds, without creating a duplicate hub member

#### Scenario: Prompt arrives during runtime handoff
- **WHEN** a member sends a synchronous remote prompt while the target process has no attached extension runtime
- **THEN** the target remains connected and promptly returns an error indicating that its runtime is temporarily unavailable

#### Scenario: Replacement runtime never attaches
- **WHEN** an extension runtime shuts down for replacement but no enabled replacement binds within the handoff interval
- **THEN** the process-scoped connection closes cleanly and does not remain as a ghost host or client
