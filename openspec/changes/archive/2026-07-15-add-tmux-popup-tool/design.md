## Context

`pi-arsenal` is intended to be a multi-tool Pi extension whose features are opt-in and configured through global and trusted project JSON files. The repository already contains the root and `tmux_popup` Zod schemas, but it does not yet load layered configuration or register a working tool.

Pi extensions can register tools dynamically during `session_start`; newly registered tools are immediately reflected in the active session. Pi creates a fresh extension runtime for reload and session replacement, which allows tool availability to be derived from each session's configuration without requiring an unregister API.

The popup command is interactive, but the agent tool must only initiate it. The tool must not retain an active execution until the editor or popup closes.

## Goals / Non-Goals

**Goals:**

- Register `tmux_popup` only when its validated configuration is enabled.
- Load global configuration and, for trusted projects, layer project configuration over it.
- Validate absolute, existing file inputs while supporting `~` and Pi's optional leading `@` path notation.
- Open the configured file with a safely constructed `tmux display-popup -E` invocation.
- Return as soon as the tmux client process has spawned successfully.
- Preserve the configured `fileCommand` as a command prefix so users may include editor arguments.

**Non-Goals:**

- Opening relative paths, directories, or nonexistent files.
- Creating files from the popup tool.
- Waiting for or reporting the editor's eventual exit status.
- Managing tmux sessions or supporting execution outside tmux.
- Treating `fileCommand` as untrusted input or parsing it into a structured executable/argument model.
- Supporting `~other-user` expansion.

## Decisions

### Load and validate layered configuration before feature registration

A shared `ConfigLoader` will initialize during `session_start`. It starts from `ConfigSchema` defaults, applies a validated partial global configuration, then applies a validated partial project configuration only when `ctx.isProjectTrusted()` is true. Top-level feature objects are shallow-merged and the completed result is validated again with the full schema.

The root session-start wiring will initialize configuration before deciding whether to call the tmux popup registration function. Configuration errors will be reported through a prefixed Pi error notification, and the feature will remain unavailable.

This follows the package's established Zod-based configuration convention and avoids reading untrusted project settings. Environment-only configuration was rejected because it would not integrate with the package's generated schema or multi-feature configuration model.

### Dynamically register only enabled tools

`tmux_popup` will be registered after configuration initialization only when `tmux_popup.enabled` is true. Registration will be idempotent within an extension instance.

Always registering and rejecting calls while disabled was rejected because disabled tools must not be visible to the model. Using `setActiveTools()` to hide a statically registered tool was rejected because it mutates the session's complete active-tool selection and could interfere with user or extension tool choices.

### Use a narrow tool input and configuration-owned presentation

The public tool accepts only `filePath`. Width, height, and `fileCommand` come from validated configuration. Width and height remain bounded from 10 through 100 and are passed to tmux as percentages. `fileCommand` defaults to `nvim` and may contain arguments.

This keeps model-controlled input limited to the target file and makes popup behavior consistently user-owned.

### Normalize and validate paths without accepting relative paths

The tool will remove one optional leading `@`, expand only `~` and `~/...` to the current user's home directory, and then require the result to be an absolute path. It will inspect the resolved path and require an existing file; directories and missing paths will produce tool errors.

Relative paths will not be resolved against `ctx.cwd`, because the explicit contract requires full paths. Symlinks whose targets are existing files are accepted through normal filesystem stat behavior.

### Treat configuration as trusted and file paths as untrusted

`fileCommand` is loaded from trusted global configuration or trusted project configuration and is intentionally interpreted as a shell command prefix. The normalized file path is model-controlled and will be encoded with POSIX shell-safe single-quote escaping before it is appended to that prefix.

Passing the raw path through string interpolation was rejected because spaces, quotes, or shell metacharacters could alter the popup command. Treating `fileCommand` as a single executable was rejected because configured command arguments are required.

### Check tmux membership through `$TMUX`

Before spawning a popup, the tool will require a non-empty `TMUX` environment variable and throw a clear tool error otherwise. A separate tmux query was rejected as unnecessary for the agreed session check and would add latency without eliminating later asynchronous failures.

### Spawn a detached tmux client

The process invocation is equivalent to:

```bash
tmux display-popup -w '<width>%' -h '<height>%' -E '<fileCommand> <escapedFilePath>'
```

The implementation will pass `display-popup`, dimensions, `-E`, and the popup shell command as separate arguments to the `tmux` executable. Shell-display quotes are not included in the argv values.

The tmux client will be spawned detached with ignored standard I/O. The tool will wait only for the child process's successful `spawn` event, then unreference it and return an opened-popup confirmation. `-E` makes tmux close the popup when the editor command exits; detaching the tmux client is what prevents the tool from waiting for that exit.

Using `pi.exec()` was rejected because it waits for command completion. Running an interpolated background shell command was rejected in favor of direct process arguments for the outer tmux invocation.

## Risks / Trade-offs

- **[Risk] Detached execution cannot report failures that occur after the process spawns** → Validate configuration, path, and `$TMUX` before spawning and clearly define success as successful initiation rather than editor completion.
- **[Risk] A malicious trusted `fileCommand` can execute arbitrary shell code** → Document that extension configuration is trusted and only load project configuration for trusted projects.
- **[Risk] Incorrect shell escaping could allow path-based command injection** → Centralize POSIX argument quoting in a small pure utility and cover spaces, apostrophes, and shell metacharacters with tests.
- **[Risk] Dynamic registration timing could expose the tool before configuration is ready** → Register only from ordered session-start wiring after successful initialization and test disabled/default behavior.
- **[Trade-off] Strict absolute paths are less convenient for agents** → Provide precise tool parameter guidance and retain `~` plus optional `@` normalization while rejecting ambiguous cwd-relative behavior.
- **[Trade-off] Fire-and-forget behavior sacrifices eventual editor status** → Return an initiation result because the feature's purpose is opening UI, not supervising an editing process.
