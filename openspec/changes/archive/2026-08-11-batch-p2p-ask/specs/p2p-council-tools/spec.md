## MODIFIED Requirements

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
