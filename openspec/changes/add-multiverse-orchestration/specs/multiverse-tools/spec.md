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
The model-facing envelope SHALL omit duration, token/request counts, model identity, and checkpoint identifiers. Those values SHALL remain available in tool presentation details and the durable run manifest. The system SHALL NOT collect or report which files a child touched, in the envelope, tool presentation details, or the durable manifest.

#### Scenario: Telemetry split
- **WHEN** a batch finishes
- **THEN** telemetry is available to the user but absent from model-facing content

#### Scenario: No file-touch data anywhere
- **WHEN** a batch finishes
- **THEN** neither the envelope, tool presentation details, nor the durable manifest report which files a child touched

### Requirement: Batch presentation
While running, the TUI SHALL display each task's pending, running, and terminal state with its name or identifier and subagent. Completed rendering SHALL summarize outcomes and allow per-task output and telemetry to be expanded without showing raw envelope markup.

#### Scenario: Live blocking progress
- **WHEN** a batch is running
- **THEN** the user sees per-task state and current observed activity update

#### Scenario: Completed summary
- **WHEN** a batch settles
- **THEN** collapsed and expanded views distinguish success, failure, and abort and expose child session IDs
