## ADDED Requirements

### Requirement: Member-name step before registering

Every path in the council modal that registers the session with a council SHALL first present a text-focused member-name step inside the current custom modal and configured layout. The step's input SHALL be prefilled with the session's resolved default identity name and the caret SHALL be positioned at the end of the prefilled text so typing appends rather than prepends. The prefill SHALL always be the resolved default name and SHALL NOT be derived from a name previously assigned by a council, so deduplication suffixes cannot accumulate across successive connections. Pressing Enter with a valid name SHALL register the session under that name and continue the originating action; Esc SHALL pop the step back to the view that pushed it without connecting. While the step is focused, all printable characters, including Vim navigation and dismiss letters, SHALL be treated as text input. The submitted name SHALL apply only to the session at runtime and SHALL NOT be written back to `<cwd>/.arsenal/p2p-role.yml`.

#### Scenario: Prefilled with the default name
- **WHEN** a session whose resolved default identity name is `fixer` reaches the member-name step
- **THEN** the input already contains `fixer`, the caret sits after the final character, and pressing Enter without editing registers the session as `fixer`

#### Scenario: Typing appends to the prefill
- **WHEN** the input is prefilled with `fixer` and the user types `-ui`
- **THEN** the input contains `fixer-ui` and registration uses `fixer-ui`

#### Scenario: Prefill ignores a previously assigned name
- **WHEN** a session whose default identity name is `fixer` was previously assigned the deduplicated name `fixer-2` on an earlier connection, then disconnects and reaches the member-name step again
- **THEN** the input is prefilled with `fixer`, not `fixer-2`

#### Scenario: Typing vim letters in the member-name field
- **WHEN** the user types `j`, `k`, `g`, or `q` while the member-name input is focused
- **THEN** each character is appended to the name and no list navigation or dismissal occurs

#### Scenario: Custom name is not persisted
- **WHEN** the user registers under the custom name `fixer-ui` and the session later resolves its default identity name again
- **THEN** `<cwd>/.arsenal/p2p-role.yml` is unchanged and the resolved default name is still `fixer`

### Requirement: Member-name validation

The member-name step SHALL accept only a single whitespace-free token of at least one character. Submitting an empty name, or a name containing any whitespace character, SHALL show an error in the step and SHALL NOT register the session or advance the flow. The step SHALL NOT check the submitted name against the council's existing members; collisions are resolved by the council's existing name deduplication after registration.

#### Scenario: Rejecting an empty name
- **WHEN** the user clears the input and presses Enter
- **THEN** the step shows an error, the session does not connect, and the step remains focused

#### Scenario: Rejecting a name containing whitespace
- **WHEN** the user submits `fix er`
- **THEN** the step shows an error, the session does not connect, and the step remains focused

#### Scenario: Colliding name is accepted and deduplicated
- **WHEN** the user submits `fixer` to a council that already has a member named `fixer`
- **THEN** the step accepts the name without warning, the session connects, and the council assigns it a deduplicated name such as `fixer-2`

## MODIFIED Requirements

### Requirement: Council detail view via peek

Selecting a council in the list SHALL open a detail view showing the council's name, its actual host, and its actual clients — each with agent name, canonical model ID, context usage (progress bar with percentage), status, description, and cwd — along with connect and disconnect actions. For councils the session is not connected to, the roster SHALL be obtained via the peek operation without joining. For the currently connected council, the roster SHALL reflect live local state, classify the viewing session by its actual host/client role, and update while the view remains open. The connect action SHALL push the member-name step and join only after a valid name is submitted; the disconnect action SHALL take effect immediately without a member-name step.

#### Scenario: Viewing an unjoined council
- **WHEN** the user selects an unjoined council whose member uses model ID `gpt-5.6-sol`
- **THEN** the detail view shows that council's host and clients from a peek snapshot with `gpt-5.6-sol` as the member's model, and the council's members observe no join event

#### Scenario: Connecting from the detail view
- **WHEN** the user activates the connect action on a council while not connected to it and submits a valid member name
- **THEN** the session joins that council under the submitted name, any previous council connection is disconnected first, and the detail view immediately shows the established host and complete client roster with the joining session classified as a client

#### Scenario: Cancelling the member-name step when connecting
- **WHEN** the user activates the connect action and presses Esc at the member-name step
- **THEN** the step is popped, the council detail view is shown again in the same configured layout, and the session does not join

#### Scenario: Live roster change while detail remains open
- **WHEN** the connected council's membership, member status, or member model changes while its detail view is open
- **THEN** the open detail view reflects the new live roster, status, or canonical model ID without requiring the user to close and reopen the modal

#### Scenario: Disconnecting from the detail view
- **WHEN** the user activates the disconnect action on the currently connected council
- **THEN** the session leaves the council without a member-name step and the modal reflects the disconnected state

### Requirement: Create-council view

The `create new` entry SHALL push a text-focused view inside the current custom modal and configured layout that collects the council name, then push the member-name step to collect the creating session's own name. Pressing Enter with a valid, non-colliding council name SHALL advance to the member-name step rather than create the council; pressing Enter with a valid member name SHALL create the council and connect the session to it as host under that name. While either view is focused, all printable characters, including Vim navigation and dismiss letters, SHALL be treated as text input; Esc SHALL pop one view at a time, returning from the member-name step to the council-name view and from the council-name view to the council list, without creating a council.

#### Scenario: Creating and connecting
- **WHEN** the user enters the name `my-council` in the create view, presses Enter, then submits the member name `fixer`
- **THEN** a council named `my-council` is created, the session becomes its host under the name `fixer`, and the modal reflects the connected state

#### Scenario: Council name alone does not create the council
- **WHEN** the user submits the council name `my-council`
- **THEN** the member-name step is shown and no council has been created yet

#### Scenario: Typing vim letters in the name field
- **WHEN** the user types `j`, `k`, `g`, or `q` while the create view's name input is focused
- **THEN** each character is appended to the name and no list navigation or dismissal occurs

#### Scenario: Cancelling creation
- **WHEN** the user presses Esc while the create-name view is focused
- **THEN** the create view is popped, the existing council list is shown in the same configured layout, and no council is created

#### Scenario: Cancelling at the member-name step
- **WHEN** the user presses Esc while the member-name step of the create flow is focused
- **THEN** the member-name step is popped, the council-name view is shown again with its entered value, and no council is created

#### Scenario: Rejecting a duplicate name
- **WHEN** the user submits a name that matches a live registered council
- **THEN** the create view shows an error, the member-name step is not shown, and no council is created
