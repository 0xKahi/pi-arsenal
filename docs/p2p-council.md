# p2p_council — In-Depth Guide

## Architecture

p2p_council creates a **hub-and-spoke WebSocket network** on `127.0.0.1` that lets multiple Pi agent sessions communicate in real time. One agent acts as the **host** (runs the WebSocket server), and others connect as **clients**. If the host disconnects, a client automatically **promotes** itself to host, preserving the council.

### Connection lifecycle

```
Agent A: /p2p-council → "create new" → starts WebSocket server → registers in council registry
Agent B: /p2p-council → selects council → connects as client → receives welcome with roster
Agent C: /p2p-council → selects council → connects as client → receives welcome with roster
```

The council registry lives at `~/.arsenal/p2p-councils/` as JSON files, one per council. Stale entries (dead host PID, unreachable port) are pruned automatically.

### Host promotion

When a client detects the host has disconnected:

1. A jittered delay (500ms + 0–1500ms random) prevents thundering herd.
2. The first client to bind the port becomes the new host.
3. Remaining clients reconnect to the promoted host.

## Identity

Each agent's identity is resolved from `<cwd>/.arsenal/p2p-role.yml`:

```yaml
name: backend-agent
description: Handles API and database work
```

- **name** — display name in the council roster. Falls back to `basename(cwd)`.
- **description** — optional text shown in `p2p_ls` output and the council detail modal.

If the file is absent or invalid, the directory name is used as the agent name.

### Choosing a name at connect time

The resolved name is a **default**, not a fixed identity. Both connect paths in `/p2p-council` present a member-name step immediately before registering:

```
create:  create new  →  council name  →  member name  →  host the council
join:    council     →  detail view   →  member name  →  join the council
```

The input is prefilled with the resolved default name with the caret at the end, so pressing Enter straight through keeps the old behavior. Esc pops one step at a time without connecting.

- The name must be **at least one character** and contain **no whitespace**.
- Collisions are not checked as you type. A name already taken on the council is deduplicated by the host as usual (`fixer` → `fixer-2`).
- The prefill is always the resolved default, never a previously assigned name, so dedupe suffixes never accumulate across connections.
- The chosen name applies to that connection only. It is **not** written back to `p2p-role.yml`, and `description` is still read from that file.
- Reconnection after a dropped link and promotion to host reuse the session's current name without prompting again.

## Message delivery

### Steer messages (`triggerTurn: false`)

Delivered immediately as a non-turn message. The recipient sees the message but does not start a new agent turn. Use for notifications or context injection.

### Trigger-when-idle messages (`triggerTurn: true`)

Queued in an inbox and delivered as a **batch** when the recipient's agent loop is idle. Batches are capped at 20 items or 16,000 characters (whichever is hit first). If the agent is busy, delivery retries every 500ms.

### Remote prompts (`p2p_ask`)

`p2p_ask` is a concurrent synchronous batch RPC. Pass a non-empty ordered `requests` array and give each council member its own role-specific prompt:

```json
{
  "requests": [
    { "to": "backend-agent", "prompt": "Review the API design and identify failure modes." },
    { "to": "test-agent", "prompt": "Propose cancellation and timeout tests." }
  ]
}
```

Target names must be unique within the batch (case-sensitive). A duplicate rejects the entire call before any prompt is sent. Distinct requests start concurrently, but progress and final replies always remain in request order. Each target settles independently: a busy, missing, timed-out, disconnected, or aborted request does not discard successful sibling replies.

Timeouts apply independently to each request:

| Timeout | Duration | Trigger |
|---------|----------|---------|
| Inactivity | 90 seconds | No status updates from that target |
| Hard ceiling | 30 minutes | Absolute maximum regardless of activity |

A target sends periodic keepalive status updates (every 30s) while processing a remote prompt to prevent inactivity timeouts. Cancelling the tool propagates cancellation to all outstanding requests while retaining outcomes that already settled.

## TUI Widget

When connected in TUI mode, a status widget renders below the editor showing:

- Council name and member count
- Each member with a colored status indicator (green = idle, yellow = thinking, accent color = tool use)
- Model ID and context window usage bar (when available)

The widget updates in real time as members join, leave, or change status.

## Modal Interface

The `/p2p-council` command opens an interactive modal with:

- **Council list** — all live councils with connection status
- **Create new** — name a council and become its host
- **Council detail** — peek at a council's roster before joining, join, or disconnect

The modal layout is configurable as `"inline"` (rendered in-place) or `"overlay"` (floating above content).

## Protocol

Communication uses a JSON WebSocket protocol. Key message types:

| Type | Direction | Purpose |
|------|-----------|---------|
| `register` | client → host | Join with identity |
| `welcome` | host → client | Roster snapshot on join |
| `member_joined` | host → all | New member notification |
| `member_left` | host → all | Departure notification |
| `chat` | any → any | Fire-and-forget message |
| `prompt_request` | any → any | Start synchronous RPC |
| `prompt_response` | any → any | Return RPC result |
| `status_update` | any → all | Idle/thinking/tool status |
| `error` | host → sender | Routing error (e.g. target not found) |
| `peek` / `peek_response` | client ↔ host | Read-only roster query |

All messages are routed through the host (hub-and-spoke topology), which forwards to the appropriate recipient.

> ⚠️ **Security:** The WebSocket server binds to `127.0.0.1` with no authentication. Any local process can connect, peek, or inject messages.

## Important behaviors

### Name deduplication

If two agents join with the same name, the host appends a suffix (e.g. `backend-agent-2`). The **assigned** name (from the `welcome` message) is what `p2p_send` and `p2p_ask` must target. Check `p2p_ls` for actual names.

### One council at a time

An agent can only be connected to one council. Creating or joining a new council silently disconnects from the current one. Creating a council whose name is already live will fail.

### Busy decline

If a `p2p_ask` target is mid-turn or already processing a remote prompt, it declines with a "busy" error. The caller receives the error immediately.

### Reply truncation

The combined model-facing output from a `p2p_ask` batch is capped at 2,000 lines or 50KB (whichever is hit first). The available reply budget is allocated fairly across successful targets so one oversized reply cannot hide all later outcomes. Every affected reply includes an explicit truncation notice, and the expanded TUI retains the same bounded reply text rather than a hidden full copy.

### Batch result display

Collapsed results show target status and aggregate counts only; prompts and reply bodies are omitted:

```text
p2p_ask
├─ ✓ backend-agent
└─ ✗ test-agent
↩ 1 reply · 1 failure
```

Expand the tool row to see each complete soft-wrapped outbound prompt and every settled attributed reply or normalized error:

```text
p2p_ask
├─ ✓ backend-agent
│    Review the API design and identify failure modes.
└─ ✗ test-agent
     Propose cancellation and timeout tests.
↩ 1 reply · 1 failure
✓ backend-agent
  The API should distinguish transport and remote failures...
✗ test-agent
  Agent "test-agent" is busy and declined the prompt
```

Pending targets use an animated Braille status symbol and transition independently to `✓` or `✗`.

### Self-targeting

`p2p_send` and `p2p_ask` cannot target yourself — both return a `self_target` error.

## Session lifecycle

- **`session_start`** — activates council state if enabled, reconciles tool visibility.
- **`session_shutdown`** — on `quit`, fully disposes the connection. On `reload`/`new`/`resume`/`fork`, detaches the runtime but preserves the connection for up to 5 seconds (handoff window) so the new session can reattach.
- **`agent_start` / `agent_end`** — updates status and flushes the inbox on idle.
- **`tool_execution_start` / `tool_execution_end`** — tracks active tool name for status display.
