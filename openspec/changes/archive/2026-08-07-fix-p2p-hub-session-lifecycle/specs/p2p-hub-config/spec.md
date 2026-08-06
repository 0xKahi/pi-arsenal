## MODIFIED Requirements

### Requirement: One-time lazy activation

On each extension runtime's first session start where `p2p_hub` is enabled, the extension SHALL register its tools, `/p2p-hub` command, vim key event listener, and widget wiring exactly once for that runtime. Activation SHALL reuse and bind to an existing compatible process-scoped p2p service when one was preserved from a replaced runtime; otherwise it SHALL create one service for the Pi process. Subsequent session-start events delivered to the same extension runtime SHALL NOT repeat registration or binding.

#### Scenario: Activation on first enabled session
- **WHEN** a session starts with `p2p_hub.enabled: true` and no process-scoped p2p service exists
- **THEN** the service is created and the tools and command become available within that same session

#### Scenario: Activation after runtime replacement
- **WHEN** an enabled replacement runtime starts while a compatible connected process-scoped p2p service exists
- **THEN** the runtime registers its surfaces once and binds them to that existing connection instead of creating a disconnected service

### Requirement: Runtime guards and active disconnect after disable

After activation, if a later session starts with `p2p_hub` disabled, all handlers, the command, and the vim event listener SHALL early-return without effect, and if a process-scoped hub connection exists the extension SHALL disconnect it (shutting down the hub server if hosting, allowing client promotion) and remove the status widget. A replacement runtime that starts disabled SHALL also terminate a connection preserved by the prior runtime rather than leaving it detached until the handoff timeout.

#### Scenario: Disabled mid-process while connected
- **WHEN** the extension is active and connected to a hub, and a new session starts with `p2p_hub.enabled: false`
- **THEN** the process-scoped service disconnects from the hub, the status widget disappears, and invoking `/p2p-hub` produces a disabled notice instead of the modal

#### Scenario: Disabled host hands off the hub
- **WHEN** a hub host's config becomes disabled at session start while clients are connected
- **THEN** the host shuts down its server and the clients promote a new host, keeping the hub alive

#### Scenario: Reload applies disabled configuration
- **WHEN** a connected runtime is replaced and the replacement runtime loads with `p2p_hub.enabled: false`
- **THEN** the preserved connection is closed deliberately during replacement and no ghost process-scoped service remains
