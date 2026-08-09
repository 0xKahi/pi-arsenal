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

## `p2p_council` — Peer-to-Peer Agent Communication

Connect multiple Pi agent sessions into a local council for real-time collaboration over WebSocket.

### Requirements

- Pi must be running in TUI mode for the modal and status widget (tools work in any mode).

### Configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/0xKahi/pi-arsenal/main/assets/config.schema.json",
  "p2p_council": {
    "enabled": true,
    "layout": "inline"
  }
}
```

- `enabled` (`boolean`, default `false`) — whether p2p_council tools and the `/p2p-council` command are active.
- `layout` (`"inline"` | `"overlay"`, default `"inline"`) — modal presentation style.

### Agent Identity

Create `<cwd>/.arsenal/p2p-role.yml` to set your agent's name and description:

```yaml
name: backend-agent
description: Handles API and database work
```

Falls back to `basename(cwd)` when absent.

### Command

| Command | Description |
|---------|-------------|
| `/p2p-council` | Open the council modal to browse, create, join, or disconnect from councils |

The extension also listens for a `pi.vimKeys.event:pi-arsenal.p2p_council` event, which external vim-key integrations can emit for quick access.

### Tools

| Tool | Description |
|------|-------------|
| `p2p_ls` | List all connected council members with status, description, and cwd |
| `p2p_send(to, message, triggerTurn?)` | Fire-and-forget message to another agent. `triggerTurn: true` queues delivery until idle; `false` (default) delivers as a steer |
| `p2p_ask(to, prompt)` | Synchronous RPC — sends a prompt to a remote agent and waits for its assistant reply |

Tools are only available when `enabled: true` **and** connected to a council. Connection is managed through the TUI modal.

> ⚠️ **Security note:** The council WebSocket server binds to `127.0.0.1` with no authentication. Any local process can connect, peek, or send messages.

> 📖 **[Full p2p_council documentation →](docs/p2p-council.md)** — architecture, protocol, message delivery, host promotion, session lifecycle, and more.

---

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
