## MODIFIED Requirements

### Requirement: Agent identity resolution

An agent's identity SHALL consist of a name, an optional description, its canonical Pi model ID, its cwd, its status, and its context usage. The canonical model ID SHALL be sourced from the active model's `id` value rather than its human-readable display name. Name and description SHALL be read from `<cwd>/.arsenal/p2p-role.yml` (keys `name`, `description`) where cwd is the directory pi was launched from, with no upward directory traversal. When the file is absent or omits `name`, the name SHALL default to the basename of the cwd. This resolved name is the session's default name. A connection request MAY supply a user-chosen registration name that overrides the default name for that connection; when no override is supplied, the default name SHALL be used. An override SHALL affect only the name and SHALL NOT be persisted to `<cwd>/.arsenal/p2p-role.yml`, so the resolved default name is unchanged for later connections. The description SHALL always come from `<cwd>/.arsenal/p2p-role.yml` and SHALL NOT be overridable per connection. The council SHALL deduplicate colliding names by appending a numeric suffix, applying the same deduplication to a default name and to an overridden name. Registration paths that are not user-initiated — reconnection after a dropped link and promotion to host — SHALL re-register under the session's current name without prompting for a new one.

#### Scenario: Default name from cwd
- **WHEN** an agent launched in `/some/path/plugin_repository` with no `.arsenal/p2p-role.yml` connects to a council
- **THEN** it is registered under the name `plugin_repository`

#### Scenario: Custom identity from p2p-role.yml
- **WHEN** `<cwd>/.arsenal/p2p-role.yml` contains `name: reviewer` and `description: reviews PRs`
- **THEN** the agent registers as `reviewer` and its description is visible to other members

#### Scenario: Per-connection name override
- **WHEN** an agent whose default name is `reviewer` connects supplying the registration name `reviewer-api`
- **THEN** it is registered as `reviewer-api`, its description still comes from `<cwd>/.arsenal/p2p-role.yml`, and the file is not modified

#### Scenario: Override does not change the default name
- **WHEN** an agent whose default name is `reviewer` connects as `reviewer-api`, disconnects, and resolves its identity again
- **THEN** its default name is still `reviewer`

#### Scenario: Canonical model identity
- **WHEN** the active model has ID `gpt-5.6-sol` and display name `GPT-5.6 Sol`
- **THEN** the agent identity advertises `gpt-5.6-sol` as its model

#### Scenario: Name collision
- **WHEN** a second agent registers with a name already taken on the council
- **THEN** the council assigns it a deduplicated name (e.g. `reviewer-2`) and informs the joining agent

#### Scenario: Overridden name collision
- **WHEN** an agent registers with the overridden name `reviewer-api` on a council that already has a member named `reviewer-api`
- **THEN** the council assigns it a deduplicated name such as `reviewer-api-2` and informs the joining agent

#### Scenario: Reconnection keeps the current name
- **WHEN** an agent connected as `reviewer-api` loses its link and reconnects, or is promoted to host
- **THEN** it re-registers under its current name without prompting the user for a name
