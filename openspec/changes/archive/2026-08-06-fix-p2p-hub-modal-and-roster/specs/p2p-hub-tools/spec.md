## MODIFIED Requirements

### Requirement: p2p_ls member listing

The system SHALL provide a `p2p_ls` tool that lists the connected hub's members, including for each: name, actual network role (`host` or `client`), whether it is the calling session, model, status (idle, thinking, or `tool:<name>` with duration), cwd, description when set, and context usage rendered both numerically (e.g. `45K/272K (17%)`) and as a progress bar (e.g. `[###-----------] 17%`). Self-identification SHALL NOT replace or alter the member's host/client role.

#### Scenario: Listing members
- **WHEN** `p2p_ls` is called by a client in a hub with one host and two clients
- **THEN** the host is listed with role `host`, both clients are listed with role `client`, and only the calling client is separately marked as the local member

#### Scenario: Listing as a client
- **WHEN** `p2p_ls` is called by a client in a hub with one host and two clients
- **THEN** the host is listed with role `host`, both clients are listed with role `client`, and only the calling client is separately marked as the local member

#### Scenario: Listing as the host
- **WHEN** `p2p_ls` is called by the hub host with connected clients
- **THEN** the calling member is listed with role `host` and marked as local, while every other member is listed with role `client`
