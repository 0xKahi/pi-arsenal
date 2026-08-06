## Purpose

Defines the agent-facing tools for pi-to-pi communication over a connected hub: fire-and-forget messaging, synchronous prompt RPC, and member listing.

## Requirements

### Requirement: p2p_send fire-and-forget messaging

The system SHALL provide a `p2p_send` tool that delivers a text message to a named member of the currently connected hub. The tool SHALL accept an optional `triggerTurn` flag; when true, the message SHALL start an agent turn on the recipient once the recipient is idle, with messages queued and batched while the recipient is busy. When false or omitted, the message SHALL be delivered without starting a turn.

#### Scenario: Send without triggering a turn
- **WHEN** `p2p_send` is called targeting an idle member with `triggerTurn` unset
- **THEN** the recipient receives the message content attributed to the sender and no agent turn is started

#### Scenario: Send with triggerTurn to a busy recipient
- **WHEN** `p2p_send` is called with `triggerTurn: true` while the recipient's agent is mid-turn
- **THEN** the message is queued and delivered as a new turn after the recipient becomes idle, batched with any other queued messages

#### Scenario: Unknown target
- **WHEN** `p2p_send` targets a name not present on the hub
- **THEN** the tool returns an error identifying the unknown target and listing available members

### Requirement: p2p_ask synchronous prompt RPC

The system SHALL provide a `p2p_ask` tool that sends a prompt to a named member and waits for that member's assistant reply, returning the reply text to the caller. The call SHALL fail with a descriptive error if the remote produces no activity within an inactivity window or exceeds a hard ceiling duration, identifying the target and elapsed time.

#### Scenario: Successful ask
- **WHEN** `p2p_ask` sends a prompt to an idle member
- **THEN** the remote agent runs a turn on that prompt and the caller receives the remote assistant's reply text

#### Scenario: Ask times out
- **WHEN** the remote agent produces no response within the inactivity window
- **THEN** `p2p_ask` returns an error naming the target and the elapsed time, and the caller's session continues normally

### Requirement: p2p_ls member listing

The system SHALL provide a `p2p_ls` tool that lists the connected hub's members, including for each: name, actual network connection type (`host` or `client`), whether it is the calling session, canonical model ID, status (idle, thinking, or `tool:<name>` with duration), cwd, description when set, and context usage rendered both numerically (e.g. `45K/272K (17%)`) and as a progress bar (e.g. `[###-----------] 17%`). Structured member details SHALL expose the network classification through a `connectionType` field and SHALL NOT expose the superseded `role` field. The canonical model ID SHALL be used in both human-readable output and structured member details. Self-identification SHALL NOT replace or alter the member's host/client connection type.

#### Scenario: Listing members
- **WHEN** `p2p_ls` is called while connected to a hub whose member uses model ID `gpt-5.6-sol`
- **THEN** the member is listed with `gpt-5.6-sol`, connection type, status, cwd, and context usage in both human-readable output and structured details

#### Scenario: Listing as a client
- **WHEN** `p2p_ls` is called by a client in a hub with one host and two clients
- **THEN** the host is listed with connection type `host`, both clients are listed with connection type `client`, and only the calling client is separately marked as the local member

#### Scenario: Listing as the host
- **WHEN** `p2p_ls` is called by the hub host with connected clients
- **THEN** the calling member is listed with connection type `host` and marked as local, while every other member is listed with connection type `client`

#### Scenario: Structured member connection type
- **WHEN** `p2p_ls` returns structured member details
- **THEN** each member contains `connectionType` with value `host` or `client` and does not contain a `role` field

### Requirement: Tool behavior while disconnected

While the extension is active, all three tools SHALL remain registered regardless of hub connection state. When invoked without a hub connection, each tool SHALL return a non-throwing error result stating that no hub is connected and directing the caller to `/p2p-hub`.

#### Scenario: Tool called while disconnected
- **WHEN** `p2p_ls` is invoked and the session is not connected to any hub
- **THEN** the tool returns an error result indicating no hub connection and referencing the `/p2p-hub` command
