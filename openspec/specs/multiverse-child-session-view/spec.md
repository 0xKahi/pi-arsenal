# multiverse-child-session-view Specification

## Purpose

Let a parent session inspect the child sessions it can still continue: which children exist on the active branch, what model and context each holds, and a read-only chronological transcript of what each child did.

## Requirements

### Requirement: Child list scope follows the active parent branch
The Child Sessions tab SHALL list exactly the child sessions of the current parent session that have a resumable interaction on the active parent branch. A child is resumable when the parent branch holds a spawn interaction for it that recorded a completion checkpoint. Each child SHALL appear once.

#### Scenario: Children spawned on the active branch are listed
- **WHEN** the active parent branch contains completed spawn interactions for children A and B
- **THEN** the tab lists A and B once each

#### Scenario: Child reachable only from an abandoned branch is hidden
- **WHEN** child C was spawned only on a parent branch that is no longer active
- **THEN** C is not listed

#### Scenario: Children of other parent sessions are hidden
- **WHEN** child sessions exist for another parent session in the same working directory
- **THEN** none of them are listed

#### Scenario: Interaction without a checkpoint is ignored
- **WHEN** a child's only interaction on the active branch failed before recording a completion checkpoint
- **THEN** that child is not listed

#### Scenario: No reachable children
- **WHEN** the active parent branch has no resumable child interactions
- **THEN** the tab shows an empty-state message and offers no transcript action

### Requirement: Child list ordered by last use on the active branch
The list SHALL be ordered from most recently used to least recently used. A child's last-used time is the time its resumable checkpoint on the active parent branch was recorded. Activity on abandoned branches SHALL NOT affect it.

#### Scenario: Most recent first
- **WHEN** child A's resumable checkpoint was recorded after child B's
- **THEN** A is listed above B

#### Scenario: Abandoned-branch activity does not reorder
- **WHEN** child B received a newer interaction only on an abandoned parent branch
- **THEN** B's position is determined by its checkpoint on the active branch

### Requirement: Child list row content
Each row SHALL show the last-used timestamp, the subagent type, the child session id, the provider and model id, and the thinking level, followed by a spend line. Model, provider and thinking level SHALL reflect the latest assistant reply on the child's active path. When any value is unavailable, the row SHALL show a placeholder instead of omitting the field.

#### Scenario: Row shows identity and model
- **WHEN** a listed child's latest assistant reply on its active path used provider `anthropic`, model `claude-sonnet-4-5` and thinking level `medium`
- **THEN** its row shows its timestamp, subagent type, session id, `anthropic/claude-sonnet-4-5` and `medium`

#### Scenario: Unknown model metadata
- **WHEN** a child's active path contains no assistant reply
- **THEN** the row shows a placeholder for model and thinking level

### Requirement: Child spend line
The spend line SHALL summarize usage over the child's active path only:
- input and output tokens
- cache read and write tokens, with the latest reply's cache hit rate
- total cost
- context usage as a percentage of the model's context window, alongside that window

Token counts SHALL be abbreviated: raw below 1,000, `k` below one million, `M` above. Zero-valued segments MAY be omitted.

#### Scenario: Abbreviated token counts
- **WHEN** a child's active path used 12,400 input and 3,412 output tokens
- **THEN** the spend line shows them as `12k` and `3.4k`

#### Scenario: Usage counted on the active path only
- **WHEN** a child file also contains turns that lie outside its active path
- **THEN** those turns' tokens and cost are excluded from the spend line

#### Scenario: Context usage colored by pressure
- **WHEN** context usage exceeds 70% of the window
- **THEN** it is shown in the warning color, and above 90% in the error color

#### Scenario: Unknown context window
- **WHEN** the child's model is not known to the model registry or has no usage yet
- **THEN** context usage is shown as unknown (`?`) and the rest of the spend line still renders

### Requirement: Child transcript of the active path
Confirming a row SHALL open a transcript of that child as one chronological list. It SHALL cover the child's active path from session start to its resumable checkpoint on the active parent branch, in the order recorded. Entries after that checkpoint and entries on other child branches SHALL NOT appear.

#### Scenario: Transcript follows the resumable checkpoint
- **WHEN** a child file continues past the checkpoint that the active parent branch resumes from
- **THEN** the transcript ends at that checkpoint

#### Scenario: Multiple interactions in order
- **WHEN** a child was spawned and later continued on the active parent branch
- **THEN** both parent prompts and their resulting activity appear in recorded order

#### Scenario: Returning to the list
- **WHEN** the user dismisses the transcript
- **THEN** the Child Sessions list is shown again with its previous selection

### Requirement: Transcript item types
The transcript SHALL render each item with a timestamp and kind label. Kinds:
- parent prompts
- assistant text
- assistant thinking
- tool calls, with tool name and formatted arguments
- tool results, with tool name, output text and a visible error marker on failure
- compaction and branch summaries

Assistant content SHALL keep its original block order. Internal subagent identity markers SHALL NOT be shown.

#### Scenario: Tool call and result pairing is readable
- **WHEN** an assistant reply issues a tool call that later returns an error
- **THEN** the transcript shows the call with its arguments followed by the result marked as an error

#### Scenario: Identity marker hidden
- **WHEN** the child session contains its subagent identity entry
- **THEN** no transcript item is rendered for it

#### Scenario: Compaction shown as a summary
- **WHEN** the child's active path contains a compaction
- **THEN** the transcript shows a summary item at that point, along with the items recorded before it

### Requirement: Transcript truncation and full preview
Transcript items whose body exceeds the space available SHALL be truncated with an indicator of the hidden line count. Confirming a truncated item SHALL open a full scrollable preview of it, with text search and copy. Dismissing the preview SHALL return to the transcript at the same item.

#### Scenario: Long tool output truncated
- **WHEN** a tool result's output exceeds the visible excerpt
- **THEN** the item shows an excerpt and a hidden-line count

#### Scenario: Open full preview
- **WHEN** the user confirms a truncated item
- **THEN** its full text opens in a searchable preview, and dismissal returns to the transcript

### Requirement: Child session view is read-only and snapshot-based
Opening the tab, listing children, and viewing transcripts SHALL NOT modify parent session files, child session files, or the child session index. The view SHALL reflect session state when it was loaded. An in-flight spawn interaction SHALL NOT appear until its result is recorded on the parent branch.

#### Scenario: Viewing writes nothing
- **WHEN** the user opens the tab and views several transcripts
- **THEN** no session file or index file is created or modified

#### Scenario: Missing or unreadable child file
- **WHEN** a reachable child's session file is missing or cannot be parsed
- **THEN** that child is listed with an unavailable indicator and its transcript shows an error message instead of failing the modal
