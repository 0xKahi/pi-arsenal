## ADDED Requirements

### Requirement: Process-scoped connection across runtime replacement

A connected hub membership SHALL belong to the running Pi process rather than to one replaceable extension runtime. When Pi replaces the extension runtime for reload, new, resume, or fork while retaining the process, the system SHALL preserve the same transport connection, hub name, host/client role, assigned member name, roster, and queued inbound chat messages. The replacement runtime SHALL bind to that connection without producing a member leave/join cycle or creating a second local member. Final Pi process shutdown SHALL close the preserved connection using the existing clean shutdown behavior.

#### Scenario: Hosted hub survives reload
- **WHEN** a Pi process hosting a hub replaces its extension runtime for `/reload`
- **THEN** its server remains reachable on the same port, its registry entry continues to identify the same process, connected clients observe neither a host loss nor a membership cycle, and the replacement runtime reports the same host connection

#### Scenario: Client connection survives session replacement
- **WHEN** a connected client starts, resumes, or forks a session without exiting Pi
- **THEN** the replacement runtime reports the client connected under the same assigned name and the hub observes no leave or duplicate join

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
