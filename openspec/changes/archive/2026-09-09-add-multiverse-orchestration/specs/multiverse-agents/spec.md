## Purpose

Defines subagent definitions, activation-scoped availability, durable child identity, and the prompt and tool policies applied while Multiverse is enabled.

## ADDED Requirements

### Requirement: Subagent definition format
Each bundled subagent SHALL be declared in markdown with YAML frontmatter containing `name`, `tools`, `skills`, and non-empty parent-facing `metadata`, followed by a non-empty child prompt body. Invalid YAML, invalid field shapes, missing required fields, or an empty body SHALL prevent that definition from loading and identify the file and problem. Repeated tool and skill names SHALL be deduplicated in first-occurrence order without rejecting the definition.

#### Scenario: Valid definition loads
- **WHEN** a definition has valid required frontmatter and a non-empty body
- **THEN** it is registered under its declared name with its prompt, metadata, and normalized capability lists

#### Scenario: Invalid definition is rejected
- **WHEN** a definition is malformed, incomplete, or has an empty prompt body
- **THEN** it is not registered and the user is shown the file and problem

#### Scenario: Duplicate capabilities are normalized
- **WHEN** a definition repeats a tool or skill name
- **THEN** only its first occurrence is retained and duplication does not make the agent unavailable

### Requirement: Permissive capability handling
Unknown declared tools SHALL NOT prevent an otherwise valid enabled definition from being available. During enabled session activation, the system SHALL notify the user of unknown declared tools, identifying the definition and names, and SHALL rely on Pi to exclude unregistered tools from activation. Warnings SHALL NOT be repeated on every turn or spawn call. Unknown skills SHALL be ignored without warnings or availability rejection in V1; skill support and validation are deferred.

#### Scenario: Unknown tool is advisory
- **WHEN** an otherwise valid enabled definition includes an unregistered tool
- **THEN** activation warns the user, the agent remains available, and only registered declared tools become active

#### Scenario: Unknown skill is ignored
- **WHEN** an otherwise valid definition includes an unknown skill name
- **THEN** it remains available without a skill warning or validation failure

### Requirement: Bundled subagents
V1 SHALL ship `explorer`, `fixer`, and `visualizer` as its initial definitions, each independently enableable. Declared subagent names SHALL be non-empty strings independent of filename and SHALL NOT be restricted to a hardcoded bundled-name list. The registered definitions SHALL be the source of truth for available names. Their initial prompt bodies and tool lists SHALL be sourced from the maintainer's LLW Multiverse bundle, with the accidental trailing `` `;`` excluded from the Visualizer source, and their initial skill lists SHALL be empty. Only enabled, successfully parsed and registered definitions SHALL be accepted as new child targets. Conflicting definitions claiming the same agent name SHALL produce a registration diagnostic rather than silently overwrite one another.

#### Scenario: Enabled roster
- **WHEN** all three bundled definitions are enabled and valid
- **THEN** `explorer`, `fixer`, and `visualizer` are the complete set of new-child targets

#### Scenario: No definition available
- **WHEN** no bundled definition is enabled and valid
- **THEN** no new-child target is offered and the user is informed

#### Scenario: Registered non-bundled name
- **WHEN** a valid definition declares a new name not in the initial shipped roster
- **THEN** it is registered under that name regardless of filename and can be activated or spawned when enabled

#### Scenario: Unregistered child name
- **WHEN** an enabled child identity names an agent absent from the registry
- **THEN** activation reports that the definition is unavailable rather than treating a hardcoded enum as authoritative

#### Scenario: Conflicting registrations
- **WHEN** separate definition files claim the same agent name
- **THEN** the conflict is reported rather than silently replacing an existing registration

### Requirement: Durable child identity
A newly created child session SHALL contain exactly one file-wide `arsenal-subagent` custom identity entry with schema version, subagent name, and parent session ID. While Multiverse is enabled, SDK creation, reload, and CLI reopen SHALL scan the complete session entries, recognize the session as a child, and restore the named role independently of the active conversation branch. While Multiverse is disabled, the marker SHALL remain stored but SHALL impose no role, prompt, or tool behavior.

#### Scenario: New child is marked before its first interaction
- **WHEN** an enabled parent creates a child
- **THEN** its session state contains the identity entry before the first child prompt is processed

#### Scenario: Child is recognized after enabled reopen
- **WHEN** Pi opens a persisted session with a valid child identity while Multiverse is enabled
- **THEN** Multiverse classifies it as the named subagent rather than a parent

#### Scenario: Invalid identity is rejected while enabled
- **WHEN** Multiverse is enabled and a session contains conflicting markers, an unsupported marker version, or an empty subagent name
- **THEN** child activation fails with a diagnostic rather than silently choosing an identity

#### Scenario: Disabled reopen is ordinary Pi
- **WHEN** a persisted child is opened directly while Multiverse is disabled
- **THEN** Multiverse applies neither a child prompt nor child tool restrictions, and the identity remains stored for future enabled activation

### Requirement: Definitions are rolling across activations
Child identity SHALL persist only which subagent the session is, not historical definition contents. An extension instance SHALL load its definitions once and reuse them for its activation, turns, and spawn lookups. Reloading or reopening with Multiverse enabled SHALL adopt the currently installed definition. Editing a definition on disk SHALL NOT hot-update an already active instance on its next turn or spawn lookup.

#### Scenario: Old child adopts an updated definition
- **WHEN** a child created under an older definition is reopened with Multiverse enabled after that definition changes
- **THEN** it uses the newly loaded prompt and tool list

#### Scenario: Definition edit requires reactivation
- **WHEN** a definition file changes during an active extension instance
- **THEN** that instance retains its loaded definition until reload or reopen

#### Scenario: Definition no longer available
- **WHEN** Multiverse is enabled and a persisted child names a disabled, missing, or invalid definition
- **THEN** child activation fails clearly without deleting the session

### Requirement: Enabled child prompt fully replaces the host prompt
While Multiverse is enabled, the resolved child prompt SHALL fully replace the host base prompt. Default host instructions, project or user appended prompt files, command-line appended prompt content, and Megamind parent content SHALL NOT be included. Other loaded extensions MAY contribute prompt changes after the replacement.

#### Scenario: Host content is removed
- **WHEN** an enabled child runs with ambient host and appended prompts
- **THEN** its base system prompt consists of its resolved subagent body without that host content

#### Scenario: Parent persona is excluded
- **WHEN** an enabled session is classified as a child
- **THEN** parent persona selection does not affect its base prompt

### Requirement: Enabled child tools use declared registered tools
On enabled child activation, the system SHALL set active tools to the registered subset of the resolved definition's tools. Undeclared tools, including Multiverse orchestration tools, SHALL be inactive. V1 SHALL rely on active-tool selection without a second tool-call enforcement gate; later changes by other extensions are outside this guarantee.

#### Scenario: Undeclared tool is inactive
- **WHEN** a child definition omits a registered tool
- **THEN** enabled activation removes that tool from the child's active set

#### Scenario: Reopen reapplies tools
- **WHEN** a child is reopened with Multiverse enabled
- **THEN** its active tools are reset to the registered subset of its newly loaded definition

### Requirement: V1 skill scope
V1 bundled definitions SHALL declare no skills, and SDK-created children SHALL receive no ambient skills through their resource loader. Skill names SHALL remain parseable and deduplicated, but V1 SHALL NOT require skill resolution, missing-skill diagnostics, or interception of undeclared skill commands in directly reopened sessions.

#### Scenario: Bundled child has no loaded skills
- **WHEN** an SDK child is created from a bundled V1 definition
- **THEN** its resource loader exposes no ambient skills

#### Scenario: Skill commands are not a V1 enforcement surface
- **WHEN** a directly reopened child receives a skill command
- **THEN** V1 provides no Multiverse skill-command interception guarantee
