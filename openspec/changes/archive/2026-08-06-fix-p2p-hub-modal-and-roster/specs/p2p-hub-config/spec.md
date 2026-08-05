## MODIFIED Requirements

### Requirement: p2p_hub config section with disabled default

The extension configuration SHALL include a `p2p_hub` section with an `enabled` boolean defaulting to `false` and a `layout` value accepting `inline` or `overlay` and defaulting to `inline`. The section SHALL be merged through the existing global and trusted-project configuration layers with project values overriding global values.

#### Scenario: Default is disabled
- **WHEN** no configuration file sets `p2p_hub`
- **THEN** the feature is disabled and its modal layout resolves to `inline`

#### Scenario: Project override
- **WHEN** global config sets `p2p_hub.enabled: false` and `p2p_hub.layout: inline`, and a trusted project's config sets `p2p_hub.enabled: true` and `p2p_hub.layout: overlay`
- **THEN** the feature is enabled with overlay modal presentation for sessions in that project

#### Scenario: Invalid layout
- **WHEN** configuration sets `p2p_hub.layout` to a value other than `inline` or `overlay`
- **THEN** configuration validation fails with an error identifying the invalid value
