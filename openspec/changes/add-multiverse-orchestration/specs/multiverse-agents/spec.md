## Purpose

Defines rolling subagent personas, the durable identity that lets Pi recognize a child session on reopen, and the prompt, tool, and skill boundaries applied to that child.

## ADDED Requirements

### Requirement: Subagent definition format
Each bundled subagent SHALL be declared in markdown with YAML frontmatter containing `name`, `tools`, and `skills`, followed by a non-empty prompt body. Invalid frontmatter, missing fields, unknown declared capabilities, or an empty body SHALL prevent that definition from loading and identify the file and problem.

#### Scenario: Valid definition loads
- **WHEN** a definition has valid required frontmatter and a non-empty body
- **THEN** it is registered under its declared name with that body, tool allowlist, and skill allowlist

#### Scenario: Invalid definition is rejected
- **WHEN** a definition is malformed, incomplete, or names an unavailable declared capability
- **THEN** it is not registered and the user is shown the file and problem

### Requirement: Bundled subagents
V1 SHALL ship exactly `explorer`, `fixer`, and `visualizer`, each independently enableable. Their initial prompt bodies and tool lists SHALL be sourced from the maintainer's LLW Multiverse bundle, with the accidental trailing `` `;`` excluded from the Visualizer source, and their initial skill lists SHALL be empty. Only enabled, successfully loaded definitions SHALL be accepted as new child targets.

#### Scenario: Enabled roster
- **WHEN** all three bundled definitions are enabled and valid
- **THEN** `explorer`, `fixer`, and `visualizer` are the complete set of new-child targets

#### Scenario: No definition available
- **WHEN** no bundled definition is enabled and valid
- **THEN** no new-child target is offered and the user is informed

### Requirement: Durable child identity
A newly created child session SHALL contain exactly one file-wide `arsenal-subagent` custom identity entry with schema version, subagent name, and parent session ID. On SDK creation, reload, or CLI reopen, pi-arsenal SHALL scan the complete session entries, recognize the session as a child, and restore the named subagent role. Recognition SHALL remain active when top-level Multiverse orchestration is disabled so a marked child cannot silently become a parent session. The identity SHALL apply independently of the active child conversation branch.

#### Scenario: New child is marked before its first interaction
- **WHEN** a parent creates a child
- **THEN** its session state contains the identity entry before the first child prompt is processed

#### Scenario: Child is recognized after reopen
- **WHEN** Pi opens a persisted session containing a valid child identity entry
- **THEN** pi-arsenal classifies it as that named subagent rather than as a parent session

#### Scenario: Invalid identity is rejected
- **WHEN** a session contains conflicting markers, an unsupported marker version, or an unknown subagent name
- **THEN** child activation fails with a diagnostic rather than silently choosing an identity

### Requirement: Definitions are rolling
Child identity SHALL persist only which subagent the session is. Each activation SHALL use the currently installed definition for that name rather than snapshotting its historical prompt, tools, or skills. A definition update SHALL therefore apply to existing children when they are reopened.

#### Scenario: Old child adopts an updated definition
- **WHEN** a child created under an older `fixer` definition is reopened after that definition changes
- **THEN** it uses the current fixer prompt, tool allowlist, and skill allowlist

#### Scenario: Definition no longer available
- **WHEN** a persisted child names a subagent that is disabled, missing, or invalid under the current installation
- **THEN** the child cannot run and the user is told why

### Requirement: Child prompt fully replaces the host prompt
The current subagent prompt body SHALL be the child's base system prompt and SHALL fully replace the host prompt. Default host instructions, project or user appended prompt files, command-line appended prompt content, and Megamind parent content SHALL NOT be included. Other loaded extensions MAY still contribute prompt changes after the replacement.

#### Scenario: Host content is removed
- **WHEN** a child runs in an environment with host and appended prompts
- **THEN** its base system prompt consists of the current subagent body without that host content

#### Scenario: Parent persona is excluded
- **WHEN** a session is classified as a child
- **THEN** no Default-to-Megamind parent selection affects its base prompt

### Requirement: Current tools bound child capability
On every activation, the system SHALL set the child's active tools to exactly those declared by its current subagent definition. Undeclared tools, including Multiverse orchestration tools, SHALL be inactive. V1 SHALL rely on active-tool selection and SHALL NOT require a second tool-call enforcement gate.

#### Scenario: Undeclared tool is inactive
- **WHEN** the current definition omits a registered tool
- **THEN** that tool is removed from the child's active tool set

#### Scenario: Reopen reapplies current tools
- **WHEN** a child session is opened in another Pi process
- **THEN** child detection reapplies the current definition's tool allowlist

### Requirement: Current skills bound child context
A child SHALL expose only the skills declared by its current definition. An empty skills list SHALL expose none, ambient host skills SHALL NOT be included in the child's generated context, and a directly reopened child SHALL reject expansion of undeclared skill commands.

#### Scenario: Declared subset loads
- **WHEN** the environment contains several skills and the current subagent declares a subset
- **THEN** only that subset is included in the child's generated context

#### Scenario: Empty skill list
- **WHEN** the current subagent declares no skills
- **THEN** the child context exposes no skills

#### Scenario: Reopened child requests undeclared skill
- **WHEN** a directly reopened child process receives a command for a skill outside its current allowlist
- **THEN** expansion is rejected rather than injecting that skill into the child conversation
