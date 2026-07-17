## MODIFIED Requirements

### Requirement: Conditional tool visibility
The extension SHALL evaluate the registration decision on every session start within a pi process — including startup, new-session, resume, fork, and reload — and SHALL register the `tmux_popup` tool only when the resolved `tmux_popup.enabled` value is `true` for that session. A disabled tool SHALL NOT appear among Pi's available tools. Registration in one session SHALL NOT suppress registration in subsequent sessions of the same process.

#### Scenario: Feature disabled by default
- **WHEN** a session starts without enabling `tmux_popup`
- **THEN** `tmux_popup` is not registered or visible to the model

#### Scenario: Feature enabled
- **WHEN** a session starts with valid configuration enabling `tmux_popup`
- **THEN** `tmux_popup` is registered and available during that session

#### Scenario: Subsequent session in the same process
- **WHEN** the tool was registered in an earlier session of the same pi process and a new session starts (new, resume, fork, or reload) with valid configuration enabling `tmux_popup`
- **THEN** `tmux_popup` is registered and available in that new session

#### Scenario: Configuration change between sessions
- **WHEN** the resolved `tmux_popup.enabled` value changes between one session start and the next within the same process
- **THEN** the new session reflects the newly resolved value, registering the tool only when it is `true`
