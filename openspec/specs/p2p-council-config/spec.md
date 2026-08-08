## Purpose

Defines configuration gating for the p2p_council feature: the config schema entry, lazy activation, runtime guards, and clean deactivation behavior when disabled after activation.

## Requirements

### Requirement: p2p_council config section with disabled default

The extension configuration SHALL include a `p2p_council` section with an `enabled` boolean defaulting to `false` and a `layout` value accepting `inline` or `overlay` and defaulting to `inline`. The section SHALL be merged through the existing global and trusted-project configuration layers with project values overriding global values.

#### Scenario: Default is disabled
- **WHEN** no configuration file sets `p2p_council`
- **THEN** the feature is disabled and its modal layout resolves to `inline`

#### Scenario: Project override
- **WHEN** global config sets `p2p_council.enabled: false` and `p2p_council.layout: inline`, and a trusted project's config sets `p2p_council.enabled: true` and `p2p_council.layout: overlay`
- **THEN** the feature is enabled with overlay modal presentation for sessions in that project

#### Scenario: Invalid layout
- **WHEN** configuration sets `p2p_council.layout` to a value other than `inline` or `overlay`
- **THEN** configuration validation fails with an error identifying the invalid value

#### Scenario: Legacy config does not enable the council
- **WHEN** configuration contains `p2p_hub.enabled: true` but does not enable `p2p_council`
- **THEN** the p2p-council feature remains disabled and the legacy section is not treated as a council configuration alias

### Requirement: No observable behavior while disabled before activation

Before the first session where `p2p_council` is enabled, the extension SHALL register no tools, commands, event listeners (beyond its bootstrap), or widgets, and SHALL open no network connections or registry files.

#### Scenario: Disabled from the start
- **WHEN** pi runs sessions with `p2p_council.enabled: false` throughout
- **THEN** `p2p_send`/`p2p_ask`/`p2p_ls` and `/p2p-council` do not exist and no p2p network or filesystem activity occurs

### Requirement: One-time lazy activation

On each extension runtime's first session start where `p2p_council` is enabled, the extension SHALL register its tools, `/p2p-council` command, vim key event listener, and widget wiring exactly once for that runtime. Activation SHALL reuse and bind to an existing compatible process-scoped p2p service when one was preserved from a replaced runtime; otherwise it SHALL create one service for the Pi process. Subsequent session-start events delivered to the same extension runtime SHALL NOT repeat registration or binding.

#### Scenario: Activation on first enabled session
- **WHEN** a session starts with `p2p_council.enabled: true` and no process-scoped p2p service exists
- **THEN** the service is created and the tools and command become available within that same session

#### Scenario: Activation after runtime replacement
- **WHEN** an enabled replacement runtime starts while a compatible connected process-scoped p2p service exists
- **THEN** the runtime registers its surfaces once and binds them to that existing connection instead of creating a disconnected service

### Requirement: Runtime guards and active disconnect after disable

After activation, if a later session starts with `p2p_council` disabled, all handlers, the command, and the vim event listener SHALL early-return without effect, and if a process-scoped council connection exists the extension SHALL disconnect it (shutting down the council server if hosting, allowing client promotion) and remove the status widget. A replacement runtime that starts disabled SHALL also terminate a connection preserved by the prior runtime rather than leaving it detached until the handoff timeout.

#### Scenario: Disabled mid-process while connected
- **WHEN** the extension is active and connected to a council, and a new session starts with `p2p_council.enabled: false`
- **THEN** the process-scoped service disconnects from the council, the status widget disappears, and invoking `/p2p-council` produces a disabled notice instead of the modal

#### Scenario: Disabled host hands off the council
- **WHEN** a council host's config becomes disabled at session start while clients are connected
- **THEN** the host shuts down its server and the clients promote a new host, keeping the council alive

#### Scenario: Reload applies disabled configuration
- **WHEN** a connected runtime is replaced and the replacement runtime loads with `p2p_council.enabled: false`
- **THEN** the preserved connection is closed deliberately during replacement and no ghost process-scoped service remains
