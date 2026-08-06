## MODIFIED Requirements

### Requirement: Status box visibility tied to connection

The system SHALL render a p2p-hub status box only while the Pi process is connected to a hub and the current runtime is enabled, and SHALL remove it entirely when the process disconnects or the feature becomes disabled. The box SHALL be rendered via the extension widget mechanism with below-editor placement and SHALL NOT replace or modify the footer, so custom footer renderings from other plugins are unaffected. After an enabled extension runtime replaces another runtime in the same connected Pi process, the replacement runtime SHALL immediately restore the status box from the preserved connection state.

#### Scenario: Appears on connect
- **WHEN** the session connects to a hub
- **THEN** the status box appears below the editor without altering the footer

#### Scenario: Disappears on disconnect
- **WHEN** the Pi process disconnects from its hub (including hub dissolution)
- **THEN** the status box is removed and no residual widget content remains

#### Scenario: Coexists with a custom footer
- **WHEN** another plugin has installed a custom footer and the session connects to a hub
- **THEN** the custom footer continues to render unchanged with the status box shown above it

#### Scenario: Restored after runtime replacement
- **WHEN** an enabled replacement TUI runtime binds to an existing connected process-scoped p2p service
- **THEN** the status box immediately shows the preserved hub and roster without requiring the user to reconnect
