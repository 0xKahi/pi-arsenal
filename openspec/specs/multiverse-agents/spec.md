# multiverse-agents Specification

## Purpose

Defines subagent definitions, activation-scoped availability, durable child identity, and the prompt and tool policies applied while Multiverse is enabled.

## Requirements

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
V1 SHALL ship `explorer`, `fixer`, and `visualizer` as its initial bundled definitions, each independently enableable, and SHALL additionally register user-supplied definitions discovered from the conventional user agents directories. Declared subagent names SHALL be non-empty strings independent of filename and SHALL NOT be restricted to a hardcoded bundled-name list. The registered definitions SHALL be the source of truth for available names. The bundled prompt bodies and tool lists SHALL be sourced from the maintainer's LLW Multiverse bundle, with the accidental trailing `` `;`` excluded from the Visualizer source, and their initial skill lists SHALL be empty. Only enabled, successfully parsed and registered definitions SHALL be accepted as new child targets, whether bundled or user-supplied. Conflicting definitions claiming the same agent name SHALL produce a registration diagnostic rather than silently overwrite one another.

#### Scenario: Enabled roster
- **WHEN** all three bundled definitions are enabled and valid and the user agents directories contribute no definitions
- **THEN** `explorer`, `fixer`, and `visualizer` are the complete set of new-child targets

#### Scenario: Roster includes user-supplied agents
- **WHEN** the bundled definitions are enabled and a user-supplied definition discovered in a user agents directory registers under a new name
- **THEN** the new-child targets are the enabled bundled agents together with that user-supplied agent

#### Scenario: No definition available
- **WHEN** no bundled or user-supplied definition is enabled and valid
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

### Requirement: User agent directory discovery
Definition discovery SHALL consider two conventional user agents directories in addition to the bundled directory: a global directory under the agent directory's `extensions/pi-arsenal/agents/`, and a project directory at `.pi/extensions/pi-arsenal/agents/` under the project working directory. Each directory SHALL contribute its `.md` files in alphabetical order. A user-supplied file SHALL be parsed and validated by the same definition format rules as a bundled file, with no additional required fields and no relaxed ones. The declared agent name SHALL come from the definition's frontmatter; the filename SHALL carry no meaning and SHALL NOT be required to match the declared name. Successfully registered user-supplied definitions SHALL be indistinguishable from bundled ones to parent prompt rendering, spawn target validation, model resolution, child tool and prompt policy, and durable child identity.

#### Scenario: Global user definition registers
- **WHEN** a `.md` file in the global user agents directory has valid frontmatter and a non-empty body whose declared name is unclaimed
- **THEN** it is registered under its declared name and offered as a spawn target when enabled

#### Scenario: Project user definition registers
- **WHEN** a `.md` file in the project user agents directory has valid frontmatter and a non-empty body whose declared name is unclaimed
- **THEN** it is registered under its declared name and offered as a spawn target when enabled

#### Scenario: Filename differs from declared name
- **WHEN** a user-supplied file's name differs from the name declared in its frontmatter
- **THEN** it is registered under the declared name and the filename is not consulted

#### Scenario: User definition is offered to the parent
- **WHEN** a user-supplied definition is registered and enabled
- **THEN** it appears in the parent's available agent roster with its declared metadata, tools, and skills alongside bundled agents

#### Scenario: User definition child behaves as any child
- **WHEN** a child is created for a user-supplied definition
- **THEN** it receives that definition's prompt body as its base prompt, the registered subset of its declared tools, and a durable child identity entry naming that agent

### Requirement: Absent user agent directories
Neither user agents directory SHALL be required to exist. An absent directory SHALL contribute no definitions and SHALL NOT produce a warning or diagnostic. When both are absent, the registered roster SHALL be exactly the bundled roster.

#### Scenario: Both directories absent
- **WHEN** neither user agents directory exists
- **THEN** discovery registers only the bundled definitions with no warning or diagnostic

#### Scenario: One directory present and one absent
- **WHEN** one user agents directory exists and the other does not
- **THEN** only the existing directory contributes definitions and the absent one produces no warning or diagnostic

### Requirement: Project agent directory trust
The project user agents directory SHALL be read only when project trust is active. When project trust is not active, the project directory SHALL NOT be read and only bundled and global definitions SHALL register. The global user agents directory SHALL be read regardless of project trust.

#### Scenario: Untrusted project yields none of its agents
- **WHEN** project trust is not active and the project user agents directory contains valid definitions
- **THEN** none of those definitions register

#### Scenario: Trusted project yields its agents
- **WHEN** project trust is active and the project user agents directory contains valid definitions
- **THEN** those definitions register

#### Scenario: Untrusted project still yields global agents
- **WHEN** project trust is not active and the global user agents directory contains valid definitions
- **THEN** those definitions register

### Requirement: Definition source precedence
Definitions SHALL be registered in a fixed source order: bundled definitions first, then project user-supplied definitions, then global user-supplied definitions, with files ordered alphabetically within each directory. Combined with first-registration-wins name resolution, a bundled definition SHALL always win a name conflict against a user-supplied definition, and a project definition SHALL always win against a global one. A user-supplied definition SHALL NOT be able to replace, shadow, or modify a bundled definition.

#### Scenario: User definition collides with a bundled name
- **WHEN** a user-supplied definition declares a name already claimed by a bundled definition
- **THEN** the bundled definition remains registered, the user-supplied file is skipped, and the conflict is reported identifying both the winning agent and the skipped file

#### Scenario: Project definition collides with a global one
- **WHEN** a project definition declares a name already claimed by a global definition
- **THEN** the project definition remains registered and the global file is skipped with a reported conflict

#### Scenario: Two files in the same directory collide
- **WHEN** two files within the same user agents directory declare the same name
- **THEN** the alphabetically earlier file is registered and the later one is skipped with a reported conflict

### Requirement: Per-file discovery failure isolation
A file that cannot be read, fails definition validation, or loses a name conflict SHALL be skipped individually with its path and problem reported. Such a failure SHALL NOT disable Multiverse, SHALL NOT prevent bundled definitions from registering, and SHALL NOT prevent other user-supplied files from registering. An existing directory that cannot be read SHALL be reported once. Problems SHALL be reported during activation and SHALL NOT be repeated on every turn or spawn call.

#### Scenario: Unreadable file
- **WHEN** a user agents directory contains a file that cannot be read
- **THEN** that file is skipped with its path and problem reported and every other agent remains available

#### Scenario: Invalid user definition
- **WHEN** a user-supplied file has invalid frontmatter or an empty body
- **THEN** that file is skipped with the file and problem reported and Multiverse remains enabled

#### Scenario: One bad file among several
- **WHEN** one user-supplied file fails and others are valid
- **THEN** the valid files register and only the failing file is reported

#### Scenario: Every user file fails
- **WHEN** every user-supplied file fails to register
- **THEN** the bundled roster remains available and Multiverse continues operating

#### Scenario: Unreadable directory reported once
- **WHEN** a user agents directory exists but cannot be read
- **THEN** it is reported once during activation and does not repeat on every turn or spawn call

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
Child identity SHALL persist only which subagent the session is, not historical definition contents. An extension instance SHALL load its definitions once and reuse them for its activation, turns, and spawn lookups. This SHALL apply equally to bundled and user-supplied definitions. Reloading or reopening with Multiverse enabled SHALL adopt the currently installed definition and the current contents of the user agents directories. Editing or adding a definition file on disk SHALL NOT hot-update an already active instance on its next turn or spawn lookup.

#### Scenario: Old child adopts an updated definition
- **WHEN** a child created under an older definition is reopened with Multiverse enabled after that definition changes
- **THEN** it uses the newly loaded prompt and tool list

#### Scenario: Definition edit requires reactivation
- **WHEN** a definition file changes during an active extension instance
- **THEN** that instance retains its loaded definition until reload or reopen

#### Scenario: User definition edit requires reactivation
- **WHEN** a user edits or adds a file in a user agents directory during an active extension instance
- **THEN** the roster is unchanged until reload or reopen

#### Scenario: Definition no longer available
- **WHEN** Multiverse is enabled and a persisted child names a disabled, missing, or invalid definition
- **THEN** child activation fails clearly without deleting the session

#### Scenario: Child of a removed user definition
- **WHEN** a persisted child names a user-supplied agent whose file has since been deleted from a user agents directory
- **THEN** activation fails clearly with the agent identified and the session is preserved

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

### Requirement: Bundled subagents declare codemode
The bundled `explorer`, `fixer`, and `visualizer` definitions SHALL declare `codemode` in their tools in addition to the tools taken from the maintainer's bundle. Their prompt bodies SHALL describe the codemode tool and when to use it. User-supplied definitions SHALL receive `codemode` only when they declare it themselves.

#### Scenario: Bundled roster advertises codemode
- **WHEN** the bundled definitions are enabled and the parent roster is rendered
- **THEN** each bundled agent's listed tools include `codemode`

#### Scenario: User definition without codemode
- **WHEN** a user-supplied definition omits `codemode` from its tools
- **THEN** its listed tools and its child's active tools do not include `codemode`

#### Scenario: User definition opts in
- **WHEN** a user-supplied definition lists `codemode` in its tools
- **THEN** its child receives `codemode` exactly as a bundled child does

### Requirement: Codemode is a known subagent tool
During enabled session activation, a declared `codemode` tool SHALL NOT be reported as an unknown tool, even when the parent session itself has no codemode tool registered, because Multiverse provides it to children that declare it.

#### Scenario: Parent without codemode
- **WHEN** the parent session has no registered codemode tool and an enabled definition declares `codemode`
- **THEN** activation reports no unknown-tool warning for `codemode`

#### Scenario: Other unknown tools still warn
- **WHEN** an enabled definition declares `codemode` and another unregistered tool
- **THEN** activation warns about the other tool only
