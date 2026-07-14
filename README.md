# pi-arsenal

A multi-tool Pi extension with opt-in, configurable tools.

## Installation

Add `@0xkahi/pi-arsenal` to your Pi package dependencies and ensure it is listed in your Pi configuration so the extension loads at session start.

```bash
pi install npm:@0xkahi/pi-arsenal
```

## Configuration

pi-arsenal reads layered JSON configuration from the following locations:

1. **Defaults** built into the extension.
2. **Global configuration** at `<agent-dir>/extensions/pi-arsenal/config.json`.
3. **Trusted project configuration** at `<project-root>/.pi/extensions/pi-arsenal/config.json`, applied only when the project is trusted.

Feature objects are shallow-merged, so a project override only replaces the fields it specifies.

### JSON Schema

The generated schema at `assets/config.schema.json` documents all supported configuration fields and can be referenced from your configuration file:

```json
{
  "$schema": "https://raw.githubusercontent.com/0xKahi/pi-arsenal/main/assets/config.schema.json"
}
```

## `tmux_popup` tool

Open an existing file in a non-blocking tmux popup editor.

### Requirements

- Pi must be running inside a tmux session (`$TMUX` must be set).
- The `tmux` executable must be available on `$PATH`.

### Configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/0xKahi/pi-arsenal/main/assets/config.schema.json",
  "tmux_popup": {
    "enabled": true,
    "width": 50,
    "height": 50,
    "fileCommand": "nvim"
  }
}
```

- `enabled` (`boolean`, default `false`) — whether the tool is registered and visible to the model.
- `width` (`number`, `10`–`100`, default `50`) — popup width as a percentage.
- `height` (`number`, `10`–`100`, default `50`) — popup height as a percentage.
- `fileCommand` (`string`, default `nvim`) — command prefix used to open the file. May include arguments, e.g. `"code --wait"`.

### Path contract

The tool accepts a single `filePath` argument:

- Must resolve to an absolute path.
- Optional leading `@` is stripped (`@/path/to/file` → `/path/to/file`).
- Current-user home paths (`~/...`) are expanded.
- Relative paths and `~other-user` paths are rejected.
- The path must exist and resolve to a file (not a directory).

### Trust boundary

The `fileCommand` prefix is loaded from your trusted global or trusted project configuration and is executed as a shell command prefix. Only enable `tmux_popup` with commands you trust.

### Behavior

The tool spawns `tmux display-popup -E` as a detached process and returns as soon as tmux starts. It does not wait for the editor to exit, so the popup remains open while the agent continues.
