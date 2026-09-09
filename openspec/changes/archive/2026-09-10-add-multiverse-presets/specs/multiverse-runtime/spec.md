## MODIFIED Requirements

### Requirement: Subagent model resolution
For each interaction, the effective configured model SHALL be formed by applying the spawn call's active preset fields over the subagent model settings. That effective configured model SHALL be preferred and the current parent model SHALL be the fallback. Missing preset entries and fields SHALL fall back to subagent configuration before existing parent inheritance applies. The first candidate with successfully resolved authentication SHALL run, requested reasoning SHALL be clamped to supported levels, and failure reasons SHALL accumulate without stopping siblings. An unavailable or unauthenticated effective configured model SHALL retain the existing parent-model runtime fallback; preset composition SHALL NOT introduce an additional retry of the underlying subagent model.

#### Scenario: Configured model works
- **WHEN** the effective configured model resolves and authenticates
- **THEN** it is used

#### Scenario: Fallback works
- **WHEN** the effective configured model is absent or unauthenticated and the parent model is usable
- **THEN** the parent model is used

#### Scenario: No candidate works
- **WHEN** no candidate can be used
- **THEN** only that interaction fails with accumulated reasons

#### Scenario: Preset reasoning override
- **WHEN** the active preset supplies reasoning for an agent
- **THEN** that reasoning overrides the subagent setting and is clamped to the model actually selected at runtime

#### Scenario: Unavailable preset model
- **WHEN** the active preset overrides a subagent model with an unavailable model and the parent model is usable
- **THEN** runtime uses the parent model rather than adding a retry of the underlying subagent model

## ADDED Requirements

### Requirement: Preset selection is fixed per spawn call
Each spawn call SHALL capture its active preset and effective subagent configurations before dispatch. That selection SHALL apply to both create and continue tasks, including tasks queued by concurrency limits. A later preset switch SHALL affect subsequent spawn calls only and SHALL NOT change models or reasoning in already-dispatched batches. Continuations SHALL use the new call's configuration rather than retaining the previous interaction's preset.

#### Scenario: New child after switch
- **WHEN** a parent switches from default to smart and then creates a child
- **THEN** the new interaction resolves its model using smart

#### Scenario: Continued child after switch
- **WHEN** a child last ran under default and a later spawn call continues it after smart is selected
- **THEN** the child retains its conversation checkpoint but resolves the new interaction's model using smart

#### Scenario: Switch while batch is pending
- **WHEN** a batch was dispatched under smart and the user selects another preset while some tasks are running or queued
- **THEN** all tasks in that batch retain smart's captured configuration and only later spawn calls use the new selection
