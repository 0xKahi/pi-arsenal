# Tmux Popup

## Purpose

Provide an opt-in Pi tool that opens an existing file in a non-blocking tmux popup using trusted, layered configuration.

## Requirements

### Requirement: Tmux popup configuration
The extension SHALL provide a `tmux_popup` configuration section with `enabled` defaulting to `false`, `width` and `height` defaulting to `50` and constrained inclusively from `10` through `100`, and `fileCommand` defaulting to `nvim`. The configured command SHALL support a command prefix containing arguments.

#### Scenario: Default configuration
- **WHEN** no `tmux_popup` override is configured
- **THEN** the resolved configuration disables the feature and uses width `50`, height `50`, and file command `nvim`

#### Scenario: Configured command with arguments
- **WHEN** an enabled configuration sets `fileCommand` to a command prefix containing arguments
- **THEN** the extension preserves that prefix for the popup shell command

#### Scenario: Invalid dimensions
- **WHEN** configured width or height is less than `10` or greater than `100`
- **THEN** configuration validation fails and the tool is not registered

### Requirement: Layered trusted configuration
The extension SHALL resolve configuration from defaults, then global configuration, then trusted project configuration, with later feature properties overriding earlier properties. It SHALL NOT apply project-local configuration when the project is untrusted.

#### Scenario: Trusted project override
- **WHEN** global configuration enables `tmux_popup` and a trusted project overrides its width
- **THEN** the resolved configuration retains the global feature properties except for the project width

#### Scenario: Untrusted project configuration
- **WHEN** a project is not trusted and contains a project-local `tmux_popup` configuration
- **THEN** the extension ignores that project-local configuration

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

### Requirement: Tool input contract
The `tmux_popup` tool SHALL accept a single `filePath` string. It SHALL accept POSIX absolute paths and current-user home paths beginning with `~`, and SHALL normalize one optional Pi-style leading `@`. It SHALL reject relative paths and `~other-user` paths.

#### Scenario: Absolute path
- **WHEN** the tool receives `/home/user/project/file.ts`
- **THEN** it validates that absolute path without resolving it against Pi's working directory

#### Scenario: Home path
- **WHEN** the tool receives `~/project/file.ts`
- **THEN** it expands `~` to the current user's home directory before validation

#### Scenario: Pi-style path reference
- **WHEN** the tool receives `@~/project/file.ts` or `@/home/user/project/file.ts`
- **THEN** it removes the leading `@` and validates the remaining full path

#### Scenario: Relative path
- **WHEN** the tool receives `src/file.ts`, `./src/file.ts`, or `../file.ts`
- **THEN** the tool fails with an error indicating that an absolute file path is required

### Requirement: Existing-file validation
The tool SHALL require the normalized path to exist and resolve to a file before it starts tmux. It SHALL reject missing paths and directories.

#### Scenario: Existing file
- **WHEN** the normalized path resolves to an existing file
- **THEN** the tool proceeds to tmux-session validation and popup initiation

#### Scenario: Missing path
- **WHEN** the normalized path does not exist
- **THEN** the tool fails without spawning tmux

#### Scenario: Directory path
- **WHEN** the normalized path resolves to a directory
- **THEN** the tool fails without spawning tmux

### Requirement: Tmux-session guard
The tool SHALL require a non-empty `TMUX` environment variable before starting the popup.

#### Scenario: Outside tmux
- **WHEN** `TMUX` is missing or empty when the tool executes
- **THEN** the tool fails with an error indicating that `tmux_popup` can only be used within a tmux session

#### Scenario: Inside tmux
- **WHEN** `TMUX` is non-empty and all other validation succeeds
- **THEN** the tool attempts to start the popup

### Requirement: Safe popup command construction
The extension SHALL invoke the `tmux` executable with `display-popup`, configured percentage width and height, `-E`, and one popup shell-command argument composed from the trusted `fileCommand` prefix and a POSIX-shell-escaped normalized file path.

#### Scenario: Standard popup invocation
- **WHEN** width and height are `50`, `fileCommand` is `nvim`, and the normalized path is `/tmp/file.ts`
- **THEN** the tmux invocation is equivalent to `tmux display-popup -w 50% -h 50% -E "nvim '/tmp/file.ts'"`

#### Scenario: Path containing shell-sensitive characters
- **WHEN** a valid file path contains spaces, apostrophes, or shell metacharacters
- **THEN** the popup command represents the path as one literal shell argument without executing path content as shell syntax

### Requirement: Non-blocking popup initiation
The tool SHALL spawn the tmux client as a detached process with ignored standard I/O, wait only until process creation succeeds, and then return without waiting for the popup command to exit. The `-E` option SHALL cause tmux to close the popup after the configured file command exits.

#### Scenario: Popup process starts
- **WHEN** the detached tmux client emits successful process creation
- **THEN** the tool unreferences the child and returns a confirmation that the popup was opened

#### Scenario: Process cannot start
- **WHEN** the operating system cannot spawn the tmux executable
- **THEN** the tool fails with a tool execution error

#### Scenario: Editor remains open
- **WHEN** the configured editor continues running in the popup
- **THEN** the `tmux_popup` tool call has already completed and does not wait for the editor's exit status
