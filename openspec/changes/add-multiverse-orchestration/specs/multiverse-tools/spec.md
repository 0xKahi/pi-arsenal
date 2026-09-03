## Purpose

Defines the blocking batch interface for creating and continuing durable children, including validation, ordering, results, and live presentation.

## ADDED Requirements

### Requirement: Batch interaction tool
While Megamind is active, the system SHALL provide one tool accepting shared `context` and a non-empty ordered task array. Each task SHALL explicitly choose `create` with an enabled subagent and task text, or `continue` with a child session ID and task text, and MAY include a short name. The entire request SHALL be validated before dispatch.

#### Scenario: Create and continue in one batch
- **WHEN** a valid batch mixes new-child and existing-child tasks
- **THEN** every task is dispatched according to its action under the shared concurrency limit

#### Scenario: Invalid target rejects before dispatch
- **WHEN** any create target is unavailable or any continued child is invalid, unavailable from the active parent branch, or owned by another parent
- **THEN** the call fails before any task starts and identifies the offending task

#### Scenario: Empty batch rejected
- **WHEN** the task array is empty
- **THEN** the call fails before dispatch

### Requirement: Blocking interactions and reusable sessions
The tool SHALL block until every dispatched interaction is terminal. A child SHALL receive one prompt per task interaction, but its durable conversation SHALL remain available to later calls. V1 SHALL not expose individual mid-interaction steer, status, cancel, or revive operations.

#### Scenario: New child remains reusable
- **WHEN** a create task finishes
- **THEN** its result includes a durable child session ID that a later continue task can use

#### Scenario: Continued child sees prior context
- **WHEN** a later task continues a child from an available checkpoint
- **THEN** the child processes the new prompt with the conversation context from that checkpoint

### Requirement: One interaction per child per batch
A batch SHALL NOT target the same child session more than once. Such a request SHALL be rejected before dispatch rather than implicitly serializing prompts against that child.

#### Scenario: Duplicate child target
- **WHEN** two continue tasks name the same child session
- **THEN** the entire call is rejected before any task starts

### Requirement: All-settled ordered results
A dispatched task failure SHALL NOT stop sibling tasks. The tool SHALL return one result per dispatched task in input order, irrespective of completion order. Only pre-dispatch rejection SHALL make the whole call an opaque tool error.

#### Scenario: Mixed outcomes
- **WHEN** one dispatched interaction fails and siblings succeed
- **THEN** all entries are returned in input order with their individual outcomes

#### Scenario: Every task fails
- **WHEN** every dispatched interaction fails
- **THEN** the tool still returns one failed entry per task

#### Scenario: Batch aborted after dispatch
- **WHEN** the batch is aborted after at least one task was dispatched
- **THEN** the tool returns an ordered entry for every input task, preserving completed results and marking running or queued tasks aborted

### Requirement: Computed result envelope
Each result entry SHALL contain the subagent name, the durable child session ID, terminal status, an error message when the interaction failed before producing a usable child response, a truncation notice when the body was capped, and the successful child's final message verbatim. A task's position in the ordered response, encoded in its boundary, SHALL be its correlation key; the envelope SHALL NOT include a separately numbered interaction identifier, a checkpoint identifier, or any file-touch data. The envelope SHALL not infer write conflicts or trust child self-report for computed fields.

#### Scenario: Frame shape is fixed
- **WHEN** a batch of two tasks settles with the first succeeding and the second failing before any child response
- **THEN** model-facing content is exactly a header line naming the task count and the per-call boundary token, followed by one frame per task of the form

```
Spawn results (2) · boundary a4f9c2

--TASK_1_START-a4f9c2--
agent: fixer
childSessionId: 018f2c7a-1d3e-4b90-9c11-5a7e0b2d4f86
status: success
--TASK_1_RESPONSE-a4f9c2--
<the child's final assistant message, verbatim>
--TASK_1_END-a4f9c2--

--TASK_2_START-a4f9c2--
agent: explorer
childSessionId: 0192ab44-77c1-4de2-8f03-6b1c9d5e2a10
status: failure
error: Child "0192ab44" is not reachable on this branch; no usable reference exists here.
--TASK_2_RESPONSE-a4f9c2--
--TASK_2_END-a4f9c2--
```

#### Scenario: Optional lines are absent when they do not apply
- **WHEN** a task succeeds and its body was not capped
- **THEN** its frame carries only `agent`, `childSessionId`, and `status`, with no error line and no truncation line

#### Scenario: New child identity is returned
- **WHEN** a create task reaches a terminal state after creating its session
- **THEN** its result identifies the durable child session even if the interaction failed or was aborted

#### Scenario: Successful body is unvalidated
- **WHEN** a successful child ignores its suggested report shape
- **THEN** its final message is still returned verbatim inside a valid computed frame

#### Scenario: Failed interaction
- **WHEN** an interaction fails before producing a usable final response
- **THEN** its frame contains the failure and no fabricated body

#### Scenario: Envelope cannot be forged
- **WHEN** a child body contains markup resembling envelope boundaries
- **THEN** the boundary's per-call random component is never disclosed to the child, so system-generated boundaries remain unambiguous

### Requirement: Model-facing content is actionable
The tool's model-facing `content` SHALL consist solely of the computed result envelope and SHALL contain no other field, label, or commentary. It SHALL omit duration, token and request counts, model identity, cost, checkpoint identifiers, interaction identifiers, caller-supplied task names, numeric task index fields, file paths, and session-file paths. Those values SHALL remain available in tool presentation details and the durable run manifest. Partial updates published while the call is pending SHALL carry a short fixed receipt in `content` and place live progress in tool presentation details, so per-task progress text never enters model context.

#### Scenario: Envelope is the only model-facing content
- **WHEN** a batch settles
- **THEN** model-facing content contains the header line, one frame per task in input order, and nothing else

#### Scenario: Telemetry split
- **WHEN** a batch finishes
- **THEN** telemetry is available to the user but absent from model-facing content

#### Scenario: Progress stays out of model context
- **WHEN** the tool publishes a partial update while tasks are still running
- **THEN** model-facing content carries only a fixed receipt line and the per-task progress state is present in tool presentation details instead

#### Scenario: No authoritative file-change account
- **WHEN** a batch finishes
- **THEN** no envelope, tool presentation detail, or manifest field reports which files a child changed as an account of its work, and the child's own session file remains the source of truth

### Requirement: Batch presentation
While a batch is pending, the TUI SHALL display one row per task in input order showing its subagent, 1-based task number, whether it started a new child or resumed an existing one, elapsed time, observed tool-use count, and current activity. Activity SHALL distinguish a task that holds no concurrency slot yet, a started task that has not yet called a tool, a running tool call showing that tool's name and a summarized input, and a terminal replied or failed state. The system MAY record tool names, summarized tool inputs, and per-call success or failure for this display, and MAY persist a capped trail of them in tool presentation details; such data SHALL be presented as observed activity and SHALL NOT be presented as a complete record of what a child did. Tool outputs SHALL NOT be recorded. Completed rendering SHALL summarize outcomes and allow per-task activity, prompt, child session ID, checkpoints, telemetry, and response to be expanded without showing raw envelope boundary markup.

#### Scenario: Live blocking progress
- **WHEN** a batch is running
- **THEN** the user sees per-task elapsed time, tool count, and current activity update while the call remains pending

#### Scenario: Queued task is distinguishable
- **WHEN** more tasks are admitted than the concurrency pool can run at once
- **THEN** tasks still waiting for a slot are shown as queued and distinguished from started tasks that have not yet called a tool

#### Scenario: Activity survives for expansion
- **WHEN** a settled batch is expanded after the turn ends
- **THEN** the recorded activity trail, prompt, child session ID, checkpoints, telemetry, and response are visible to the user

#### Scenario: Child content cannot corrupt the display
- **WHEN** a child's tool arguments or final message contain escape sequences or over-width text
- **THEN** the rendered output is sanitized and width-bounded, and the parent TUI neither misrenders nor fails

#### Scenario: Completed summary
- **WHEN** a batch settles
- **THEN** collapsed and expanded views distinguish success, failure, and abort and expose child session IDs
