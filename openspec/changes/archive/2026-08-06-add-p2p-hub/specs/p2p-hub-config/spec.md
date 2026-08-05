## Purpose

Defines configuration gating for the p2p_hub feature: the config schema entry, lazy activation, runtime guards, and clean deactivation behavior when disabled after activation.

## ADDED Requirements

### Requirement: p2p_hub config section with disabled default

The extension configuration SHALL include a `p2p_hub` section with an `enabled` boolean defaulting to `false`, merged through the existing global and trusted-project configuration layers with project overriding global.

#### Scenario: Default is disabled
- **WHEN** no configuration file sets `p2p_hub`
- **THEN** the feature is disabled

#### Scenario: Project override
- **WHEN** global config sets `p2p_hub.enabled: false` and a trusted project's config sets `p2p_hub.enabled: true`
- **THEN** the feature is enabled for sessions in that project

### Requirement: No observable behavior while disabled before activation

Before the first session where `p2p_hub` is enabled, the extension SHALL register no tools, commands, event listeners (beyond its bootstrap), or widgets, and SHALL open no network connections or registry files.

#### Scenario: Disabled from the start
- **WHEN** pi runs sessions with `p2p_hub.enabled: false` throughout
- **THEN** `p2p_send`/`p2p_ask`/`p2p_ls` and `/p2p-hub` do not exist and no p2p network or filesystem activity occurs

### Requirement: One-time lazy activation

On the first session start where `p2p_hub` is enabled, the extension SHALL activate exactly once per process: registering the tools, the `/p2p-hub` command, the vim key event listener, and widget wiring, seeded with the triggering session's context. Activation SHALL NOT repeat on subsequent sessions.

#### Scenario: Activation on first enabled session
- **WHEN** a session starts with `p2p_hub.enabled: true` for the first time in the process
- **THEN** the tools and command become available within that same session

### Requirement: Runtime guards and active disconnect after disable

After activation, if a later session starts with `p2p_hub` disabled, all handlers, the command, and the vim event listener SHALL early-return without effect, and if a hub connection exists the extension SHALL disconnect from it (shutting down the hub server if hosting, allowing client promotion) and remove the status widget.

#### Scenario: Disabled mid-process while connected
- **WHEN** the extension is active and connected to a hub, and a new session starts with `p2p_hub.enabled: false`
- **THEN** the session disconnects from the hub, the status widget disappears, and invoking `/p2p-hub` produces a disabled notice instead of the modal

#### Scenario: Disabled host hands off the hub
- **WHEN** a hub host's config becomes disabled at session start while clients are connected
- **THEN** the host shuts down its server and the clients promote a new host, keeping the hub alive
