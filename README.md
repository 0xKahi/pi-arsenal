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

---

## `multiverse` — user-defined subagents

Register your own subagent definitions alongside the bundled `explorer`, `fixer`, and `visualizer`. A user-defined agent is a subagent definition markdown file that you own; once discovered, it is offered to the parent and spawned exactly like a bundled one.

This section documents only how definitions are discovered and configured. Other Multiverse features (presets, concurrency, personas, the spawn tool, child sessions) are out of scope here.

### Definition locations

Definitions are discovered from two conventional directories in addition to the bundled ones:

- global: `<agent-dir>/extensions/pi-arsenal/agents/`
- project: `<cwd>/.pi/extensions/pi-arsenal/agents/`

Each directory is scanned for `.md` files sorted alphabetically. Neither directory needs to exist: an absent directory is simply empty and produces no warning. The project directory is read only when the project is trusted; the global directory is always read.

### Definition file format

A user agent file uses the same format as the bundled definitions: YAML frontmatter followed by a non-empty prompt body.

```markdown
---
name: reviewer
tools:
  - read
  - grep
  - bash
skills: []
color: "#7FDB9E"
metadata:
  - "Lane: Review a change for correctness and style"
  - "**Delegate when:** A change is ready for a focused second pass"
  - "**Don't delegate when:** You need the change written, not reviewed"
---
You are Reviewer - a focused code review specialist.

**Role**: Inspect a change and report concrete, actionable findings.

Guidelines:
- Read the relevant files before commenting.
- Prefer specific issues over general advice.
- Return findings with file paths and line numbers.
```

- `name` (`string`, required) — the registered agent name. The name always comes from the frontmatter; the filename is decorative and is neither parsed nor required to match. Must be non-empty and must not collide with a bundled agent.
- `tools` (array of strings) — the tool subset this agent may use.
- `skills` (array of strings) — skills granted to the agent.
- `metadata` (non-empty array of strings, required) — parent-facing routing guidance describing when to delegate.
- `color` (`#RRGGBB`, optional) — display color.
- The prompt body after the frontmatter must be non-empty.

### Precedence

Definitions register in a fixed order: bundled first, then project, then global, with files alphabetical within each directory. The first claim on a name wins, so:

- A bundled agent always wins a name conflict; a user definition can never replace, shadow, or retune `explorer`, `fixer`, or `visualizer`. Pick a different `name`.
- A project definition wins over a global definition declaring the same name.

A losing file is skipped and the conflict is reported, naming the winning agent and the skipped file.

### Trust

The project directory is read only when project trust is active. In an untrusted project, only bundled and global definitions register.

### Configuration

User agent settings use the same name-keyed `subagents` map as bundled agents. There is no per-definition configuration; a user agent's model is set with `subagents["<name>"].model`:

```json
{
  "$schema": "https://raw.githubusercontent.com/0xKahi/pi-arsenal/main/assets/config.schema.json",
  "multiverse": {
    "enabled": true,
    "subagents": {
      "reviewer": {
        "enabled": true,
        "model": { "provider": "anthropic", "modelId": "claude-sonnet-4", "reasoning": "high" }
      }
    }
  }
}
```

A registered user agent is governed by `subagents["<name>"].enabled`, so you can turn it off without deleting its file. Omitted `model` fields fall back to the active preset and then to the parent session's model, exactly as for a bundled agent.

### Failure behavior

An unreadable directory is reported once. An unreadable file, an invalid definition, or a name conflict skips only that file with a warning. Multiverse stays enabled and every other agent remains available. Problems are reported once when the extension activates.

### Limitation

Definitions load once per activation. Adding or editing a user agent's markdown takes effect only after a reload or reopen; there is no hot-reload.

> 📖 **[Full Multiverse documentation →](docs/multiverse.md)** — configuration reference, model presets, durable children, the spawn tool, the `/multiverse` command, and V1 limitations.
