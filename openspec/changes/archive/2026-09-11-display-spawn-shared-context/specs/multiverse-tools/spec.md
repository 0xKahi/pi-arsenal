## MODIFIED Requirements

### Requirement: Batch presentation
While a batch is pending, the TUI SHALL display one row per task in input order showing its subagent, 1-based task number, whether it started a new child or resumed an existing one, elapsed time, observed tool-use count, and current activity. Activity SHALL distinguish a task that holds no concurrency slot yet, a started task that has not yet called a tool, a running tool call showing that tool's name and a summarized input, and a terminal replied or failed state. The system MAY record tool names, summarized tool inputs, and per-call success or failure for this display, and MAY persist a capped trail of them in tool presentation details; such data SHALL be presented as observed activity and SHALL NOT be presented as a complete record of what a child did. Tool outputs SHALL NOT be recorded. Completed rendering SHALL summarize outcomes and allow per-task activity, prompt, child session ID, checkpoints, telemetry, and response to be expanded without showing raw envelope boundary markup.

An expanded batch SHALL additionally present the caller-supplied shared context once for the whole batch, labelled distinctly from the per-task prompt and positioned ahead of the per-task rows. Its content SHALL be taken from the shared context field of the batch's own tool call arguments and from no other source. It SHALL be bounded to at most ten rendered lines, and when content is omitted the display SHALL state how many lines were omitted. When the tool call arguments carry no shared context, the presentation SHALL still appear and SHALL report the absence rather than being suppressed. A collapsed batch SHALL NOT present the shared context. Presenting the shared context SHALL NOT alter the per-task prompt, which continues to show only that task's own instructions, and SHALL NOT alter model-facing content.

#### Scenario: Live blocking progress
- **WHEN** a batch is running
- **THEN** the user sees per-task elapsed time, tool count, and current activity update while the call remains pending

#### Scenario: Queued task is distinguishable
- **WHEN** more tasks are admitted than the concurrency pool can run at once
- **THEN** tasks still waiting for a slot are shown as queued and distinguished from started tasks that have not yet called a tool

#### Scenario: Activity survives for expansion
- **WHEN** a settled batch is expanded after the turn ends
- **THEN** the recorded activity trail, prompt, child session ID, checkpoints, telemetry, and response are visible to the user

#### Scenario: Shared context is visible on expansion
- **WHEN** a batch dispatched with a shared context is expanded
- **THEN** that shared context is shown once, ahead of the per-task rows, under a label distinct from the per-task prompt

#### Scenario: Long shared context is bounded
- **WHEN** an expanded batch's shared context exceeds ten rendered lines
- **THEN** at most ten lines are shown and the display states how many further lines were omitted

#### Scenario: Missing shared context is reported
- **WHEN** an expanded batch's tool call arguments carry no shared context
- **THEN** the shared context presentation still appears and reports the absence instead of being omitted

#### Scenario: Collapsed batch omits shared context
- **WHEN** a batch is displayed collapsed
- **THEN** no shared context is shown

#### Scenario: Per-task prompt stays task-scoped
- **WHEN** a batch with a shared context is expanded
- **THEN** each task's prompt shows only that task's own instructions and does not repeat the shared context

#### Scenario: Child content cannot corrupt the display
- **WHEN** a child's tool arguments or final message contain escape sequences or over-width text
- **THEN** the rendered output is sanitized and width-bounded, and the parent TUI neither misrenders nor fails

#### Scenario: Completed summary
- **WHEN** a batch settles
- **THEN** collapsed and expanded views distinguish success, failure, and abort and expose child session IDs
