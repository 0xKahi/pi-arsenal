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

The system SHALL provide a `p2p_ask` tool that accepts a non-empty ordered array of requests, each containing a target agent name and a prompt, sends each attributed prompt to its named idle council member concurrently, and waits for every request to produce either a reply or a per-target failure. Target names within one call MUST be unique. The tool SHALL reject a duplicate-target batch before dispatching any request. A busy, missing, disconnected, timed-out, or otherwise failing target SHALL NOT prevent other distinct targets from completing. Partial updates and the final result SHALL preserve input request order regardless of completion order.

The caller's model-facing final result SHALL attribute every retained reply and failure to its target without decorative TUI-only formatting. The caller's user-facing result SHALL distinguish pending, successful, and failed targets, show aggregate reply, failure, and pending counts as applicable, and expose each outbound prompt and retained outcome when expanded. Historical stored calls using the former single `{ to, prompt }` shape SHALL remain executable and renderable as one-request batches.

#### Scenario: Successful ask
- **WHEN** `p2p_ask` contains distinct requests for multiple idle members
- **THEN** all prompts are dispatched without waiting for an earlier request to finish, each remote agent runs a turn on content that identifies the requester, the remote user display presents it as a remote prompt, and the final model-facing result attributes each reply in request order

#### Scenario: Different prompt per target
- **WHEN** a batch assigns different prompts to different target agents
- **THEN** each target receives only its own complete prompt

#### Scenario: Duplicate target rejection is atomic
- **WHEN** two or more requests in one `p2p_ask` batch name the same case-sensitive target
- **THEN** the tool returns a non-throwing validation error naming the duplicate target and dispatches none of the batch's prompts

#### Scenario: Completion order differs from request order
- **WHEN** later requests finish before earlier requests
- **THEN** progress and final result entries remain arranged in the original request order while each entry reflects its latest state

#### Scenario: Partial failure
- **WHEN** one target is missing or disconnects while another target replies successfully
- **THEN** the failed target receives an attributed normalized error, the successful target's reply is retained, and the aggregate result reports both outcomes without failing the whole batch

#### Scenario: Ask times out
- **WHEN** one remote agent produces no response within the inactivity window while other batch requests remain active or have settled
- **THEN** that target receives an error naming it and the elapsed time, sibling requests continue independently, and the caller's session continues normally

#### Scenario: Ask target is busy
- **WHEN** one request targets a member that is already running or handling another remote prompt
- **THEN** no prompt is injected for that target, its row settles as a visibly distinct busy failure, and requests to other targets continue independently

#### Scenario: Batch cancellation
- **WHEN** the caller aborts an in-flight batch
- **THEN** every outstanding request observes the abort, settled outcomes remain attributable, and pending requests resolve as aborted without terminating the caller's session

#### Scenario: Live batch rendering
- **WHEN** a `p2p_ask` batch is executing in TUI mode
- **THEN** the result displays one tree row per target in request order, each pending row animates through `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏` at 80 millisecond intervals, settled rows change independently to `✓` or `✗`, and the aggregate line reports replies, failures, and pending requests that currently exist

#### Scenario: Ask call rendering
- **WHEN** a completed batch result is collapsed in TUI mode
- **THEN** it shows a `p2p_ask` heading, a compact target tree using `✓` for success and `✗` for failure, and an aggregate reply and failure count without showing prompts or reply bodies

#### Scenario: Expanded completed batch rendering
- **WHEN** a completed batch result is expanded in TUI mode
- **THEN** the target tree shows the full soft-wrapped outbound prompt beneath each target, followed by the aggregate count and an attributed outcome section that shows each retained reply or normalized error beneath its `✓` or `✗` target
- **AND** the first outcome immediately follows the aggregate line without an intervening blank line, each outcome symbol aligns horizontally with the aggregate symbol, and its reply or error is indented two spaces beneath the outcome symbol

#### Scenario: Historical single ask
- **WHEN** a stored tool call using `{ to, prompt }` is resumed or rendered
- **THEN** it is treated compatibly as a one-request batch without exposing the legacy shape in the current public schema

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

The system SHALL keep collapsed `p2p_send` call previews and collapsed `p2p_ask` batch displays bounded and SHALL bound the combined model-facing output of a `p2p_ask` batch to Pi's standard tool-output line and byte limits. Reply text retained for user-facing expanded rendering SHALL use the same bounded representation rather than preserving hidden unbounded copies. Truncation SHALL remain explicit and SHALL allocate bounded space across batch outcomes so one oversized reply does not consume the entire reply budget without representing other outcomes.

#### Scenario: Long call argument in collapsed view
- **WHEN** a `p2p_send` message or a prompt within a `p2p_ask` batch exceeds the collapsed preview limit
- **THEN** the collapsed `p2p_send` call shows a visibly truncated preview, the collapsed `p2p_ask` result omits prompt and reply bodies entirely, and expanded mode provides the complete outbound argument

#### Scenario: Expanded batch prompt wrapping
- **WHEN** an expanded batch contains a prompt wider than the available terminal width
- **THEN** the complete prompt is soft-wrapped within the available width without exceeding it

#### Scenario: Oversized remote reply
- **WHEN** one or more remote replies cause the batch's combined output to exceed Pi's standard line or byte limit
- **THEN** the caller receives an attributed bounded representation of the batch with explicit truncation notices, other outcomes remain represented within the available budget, and no unbounded full reply is retained only in result details

### Requirement: Tool activation gated on council connection

The p2p tools SHALL be active only while the extension is enabled and the process-scoped council state is connected. While no council connection exists, `p2p_send`, `p2p_ask`, and `p2p_ls` SHALL be absent from the model's tool list, from the system prompt's available-tools listing, and from its guidelines section, so that a disconnected agent receives no indication that p2p messaging exists. Deactivation SHALL NOT unregister the tools: their definitions remain resolvable so that restored history continues to render p2p tool calls correctly.

#### Scenario: Fresh session with no council connection
- **WHEN** a session starts with `p2p_council.enabled: true` and the process holds no council connection
- **THEN** `p2p_send`, `p2p_ask`, and `p2p_ls` are not offered to the model and no p2p tool text appears in the system prompt

#### Scenario: Restored history renders while tools are inactive
- **WHEN** a session restores history containing prior p2p tool calls and no council connection exists
- **THEN** those tool calls render with their own renderers rather than Pi's fallback rendering, while the tools stay inactive

#### Scenario: Disabled feature
- **WHEN** a session starts with `p2p_council.enabled: false`
- **THEN** the p2p tools are inactive regardless of any connection state

### Requirement: Tool activation follows user connection actions

Joining or creating a council SHALL activate the three p2p tools, and manually disconnecting from a council SHALL deactivate them. Activation state SHALL follow only these deliberate user actions and the per-session reconciliation; automatic connection churn SHALL NOT change it. In particular, when a client loses its host and the extension is retrying or promoting itself to host, the tools SHALL remain active, because the user has not left the council.

#### Scenario: User creates a council
- **WHEN** the user creates a council from the `/p2p-council` modal and hosting starts successfully
- **THEN** the three p2p tools become available to the model without requiring a new session

#### Scenario: User joins a council
- **WHEN** the user joins an existing council from the `/p2p-council` modal and the join succeeds
- **THEN** the three p2p tools become available to the model without requiring a new session

#### Scenario: User disconnects
- **WHEN** the user disconnects from the connected council in the `/p2p-council` modal
- **THEN** the three p2p tools are withdrawn from the model and their prompt text is removed

#### Scenario: Failed join leaves tools inactive
- **WHEN** the user attempts to join a council and the connection fails
- **THEN** the tools remain inactive

#### Scenario: Host loss during promotion
- **WHEN** a connected client loses its host and the extension is retrying the connection or promoting itself to host
- **THEN** the tools remain active throughout, because the user did not disconnect

### Requirement: Connection state reconciled at session start

On every session start the extension SHALL reconcile tool activation against the current enablement and connection state, so that a council connection preserved across a session replacement is reflected in the new session's tool list and a session that begins without a connection does not expose the tools.

#### Scenario: Preserved connection across session replacement
- **WHEN** a session is reloaded, forked, resumed, or replaced while the process-scoped council connection is live
- **THEN** the new session offers the three p2p tools without the user reconnecting

#### Scenario: Session start without a connection
- **WHEN** a session starts while the process holds no council connection
- **THEN** the p2p tools are not offered, even if the host runtime pre-activated all extension tools during startup

### Requirement: Tool behavior while disconnected

While the extension is active, all three tools SHALL remain registered regardless of council connection state, though they are only active while connected. If a tool is nevertheless invoked without a council connection, it SHALL return a non-throwing error result stating that no council is connected and directing the caller to `/p2p-council`, rather than throwing or terminating the turn. This covers calls that were issued while connected but resolve after the connection ends, and calls made during automatic reconnection or host promotion.

#### Scenario: Tool called while disconnected
- **WHEN** `p2p_ls` is invoked and the session is not connected to any council
- **THEN** the tool returns an error result indicating no council connection and referencing the `/p2p-council` command

#### Scenario: Connection ends while a call is in flight
- **WHEN** the user disconnects while a p2p tool call issued earlier in the same turn is still executing
- **THEN** the call resolves with the no-connection error result instead of failing the turn
