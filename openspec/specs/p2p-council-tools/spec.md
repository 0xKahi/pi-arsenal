## Purpose

Defines the agent-facing tools for pi-to-pi communication over a connected council: fire-and-forget messaging, synchronous prompt RPC, and member listing.

## Requirements

### Requirement: p2p_send fire-and-forget messaging

The system SHALL provide a `p2p_send` tool that sends a text message to a named member of the currently connected council. The tool SHALL accept an optional `triggerTurn` flag; when true, the message SHALL start an agent turn on the recipient once the recipient is idle, with messages queued and batched while the recipient is busy. When false or omitted, the message SHALL be delivered without starting a turn. Every recipient-facing textual message SHALL identify its sender without relying on structured metadata. The sender-facing result SHALL describe transport acceptance without claiming that the recipient read, processed, or acknowledged the message.

#### Scenario: Send without triggering a turn
- **WHEN** `p2p_send` is called targeting a member with `triggerTurn` unset or false
- **THEN** the recipient's user display and model-facing textual content identify the sender and show the message, and no agent turn is started solely for that message

#### Scenario: Send with triggerTurn to a busy recipient
- **WHEN** `p2p_send` is called with `triggerTurn: true` while the recipient's agent is mid-turn
- **THEN** the message is queued and delivered as a new turn after the recipient becomes idle, batched with any other queued messages, with every batched item textually attributed to its sender

#### Scenario: Sender sees a steer call
- **WHEN** `p2p_send` is called with `triggerTurn` unset or false in TUI mode
- **THEN** the call display identifies the target, labels the delivery as a steer, shows a bounded message preview when collapsed, and shows the full message when expanded

#### Scenario: Sender sees a triggering call
- **WHEN** `p2p_send` is called with `triggerTurn: true` in TUI mode
- **THEN** the call display identifies the target, labels the delivery as triggering once idle, shows a bounded message preview when collapsed, and shows the full message when expanded

#### Scenario: Send accepted by transport
- **WHEN** the outbound p2p transport accepts a message
- **THEN** the model-facing result confirms the target and delivery behavior, and the user-facing result indicates success without claiming that the recipient read or processed the message

#### Scenario: Unknown target
- **WHEN** `p2p_send` targets a name not present on the council
- **THEN** the tool returns an error identifying the unknown target and listing available members, and the TUI renders the failure distinctly from success

### Requirement: p2p_ask synchronous prompt RPC

The system SHALL provide a `p2p_ask` tool that sends an attributed prompt to a named idle member and waits for that member's assistant reply. For a successful reply within output limits, the caller's model-facing tool result SHALL contain the remote assistant's reply text without a decorative presentation prefix, while the caller's user-facing result SHALL identify the responder. The call SHALL fail with a descriptive error if the remote produces no activity within an inactivity window or exceeds a hard ceiling duration, identifying the target and elapsed time.

#### Scenario: Successful ask
- **WHEN** `p2p_ask` sends a prompt to an idle member and the reply is within output limits
- **THEN** the remote agent runs a turn on model-facing content that identifies the requester, the remote user display presents it as a remote prompt, the caller's model receives the raw remote assistant reply text, and the caller's user display identifies the responder

#### Scenario: Ask call rendering
- **WHEN** `p2p_ask` is called in TUI mode
- **THEN** the call display identifies the target, shows a bounded prompt preview when collapsed, and shows the full prompt when expanded

#### Scenario: Ask times out
- **WHEN** the remote agent produces no response within the inactivity window
- **THEN** `p2p_ask` returns an error naming the target and elapsed time, the caller's session continues normally, and the TUI renders the failure distinctly from a reply

#### Scenario: Ask target is busy
- **WHEN** `p2p_ask` targets a member that is already running or handling another remote prompt
- **THEN** no prompt is injected on the target, and the caller receives a visibly distinct error explaining that the target is busy

### Requirement: p2p_ls member listing

The system SHALL provide a `p2p_ls` tool that lists the connected council's name and routing-relevant member information. Human-readable and structured member output SHALL include each member's name, whether it is the calling session, status when known, cwd when known, and description when set. The tool output SHALL omit model, context usage, context progress bars, and network connection type; those diagnostics remain available through the persistent council widget and council detail UI.

#### Scenario: Listing members
- **WHEN** `p2p_ls` is called while connected to a council with multiple members
- **THEN** the result identifies the council and lists each member's name, self marker, status, description when set, and cwd when known

#### Scenario: Listing as a client
- **WHEN** `p2p_ls` is called by a client in a council with one host and two clients
- **THEN** all members are listed without network connection classifications, and only the calling client is marked as the local member

#### Scenario: Listing as the host
- **WHEN** `p2p_ls` is called by the council host with connected clients
- **THEN** all members are listed without network connection classifications, and only the calling host is marked as the local member

#### Scenario: Structured member connection type
- **WHEN** `p2p_ls` returns structured member details
- **THEN** every member omits both `connectionType` and the legacy `role` field

#### Scenario: Listing structured member details
- **WHEN** `p2p_ls` returns structured member details
- **THEN** each member exposes `name`, `isSelf`, and available `status`, `description`, and `cwd` fields, and omits `model`, `context`, `connectionType`, and `role`

#### Scenario: Listing omits diagnostics
- **WHEN** roster identities contain model and context data and network connection classifications
- **THEN** the `p2p_ls` human-readable output contains none of those diagnostics or context progress bars

### Requirement: p2p inbound message presentation

The system SHALL represent inbound peer sends and remote prompts with structured metadata suitable for user rendering while keeping all essential provenance in model-facing textual content. The TUI SHALL distinguish peer messages, delivery behavior, batches, and remote prompts without requiring the model-facing content to contain decorative TUI formatting.

#### Scenario: Single inbound steer presentation
- **WHEN** a non-triggering peer message arrives
- **THEN** the user sees the sender, steer delivery mode, and message content, while the model-facing text independently identifies the sender

#### Scenario: Triggering batch presentation
- **WHEN** one or more queued peer messages trigger a turn after the recipient becomes idle
- **THEN** the user sees the batch count and sender for each item, and the model-facing text identifies the sender of every item

#### Scenario: Remote prompt presentation
- **WHEN** an idle member accepts a `p2p_ask` request
- **THEN** the recipient user sees a remote-prompt presentation naming the requester, and the recipient model receives equivalent requester attribution with the complete prompt

### Requirement: p2p output bounds

The system SHALL keep collapsed tool-call previews bounded and SHALL truncate remote assistant replies that exceed Pi's standard tool-output limits, preserving a clear notice that truncation occurred.

#### Scenario: Long call argument in collapsed view
- **WHEN** a `p2p_send` message or `p2p_ask` prompt exceeds the collapsed preview limit
- **THEN** the TUI shows a visibly truncated single preview while expanded mode provides the full argument

#### Scenario: Oversized remote reply
- **WHEN** a `p2p_ask` reply exceeds Pi's standard line or byte limit
- **THEN** the caller receives the retained portion plus an explicit truncation notice rather than an unbounded or silently clipped tool result

### Requirement: Tool behavior while disconnected

While the extension is active, all three tools SHALL remain registered regardless of council connection state. When invoked without a council connection, each tool SHALL return a non-throwing error result stating that no council is connected and directing the caller to `/p2p-council`.

#### Scenario: Tool called while disconnected
- **WHEN** `p2p_ls` is invoked and the session is not connected to any council
- **THEN** the tool returns an error result indicating no council connection and referencing the `/p2p-council` command
