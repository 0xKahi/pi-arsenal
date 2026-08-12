## 1. State: expose the default name and accept an override

- [x] 1.1 Add a read-only accessor on `P2pCouncilState` returning the resolved default identity name (`identity.name`, not `selfName`) in `src/extensions/p2p-council/p2p-council-state.ts`
- [x] 1.2 Add an optional registration-name parameter to `createCouncil` that assigns `selfName` immediately before hosting, defaulting to current behavior when omitted
- [x] 1.3 Add an optional registration-name parameter to `joinCouncil` that assigns `selfName` immediately before registering, defaulting to current behavior when omitted
- [x] 1.4 Confirm no reconnection or promotion path is changed and that both continue to re-register using the current `selfName`
- [x] 1.5 Extend `test/extensions/p2p-council/p2p-council-state.test.ts`: override is used for registration; omitting it uses the default name; the default-name accessor is unaffected by a prior `welcome.assignedName`

## 2. Member-name modal layer

- [x] 2.1 Create `src/extensions/p2p-council/modal/member-name-layer.ts` as a `text-focused` `ModalLayer` following the conventions in `create-council-layer.ts`
- [x] 2.2 Prefill the input from the state's default-name accessor on construction and move the caret to the end of the prefilled text
- [x] 2.3 Validate on submit: reject empty and reject any name containing whitespace, showing an error in the layer without connecting or popping
- [x] 2.4 On a valid submit, invoke the caller-supplied action with the accepted name, rendering a busy state while it is in flight and surfacing its error on failure
- [x] 2.5 Handle Esc as a pop back to the pushing layer with no connection attempt, and route printable characters (including `j`/`k`/`g`/`q`) to the input
- [x] 2.6 Add `test/extensions/p2p-council/modal/member-name-layer.test.ts` covering prefill value, caret-at-end (prefill then type a character and assert the result is `default + char`), empty rejection, whitespace rejection, accepted submit, and vim-letter passthrough

## 3. Wire the join flow

- [x] 3.1 Change the connect action in `src/extensions/p2p-council/modal/council-detail-layer.ts` to push the member-name layer instead of calling `joinCouncil` directly
- [x] 3.2 Pass an action that calls `joinCouncil(entry, name)` and preserves the existing post-connect behavior (connection-change callback, roster reload, modal close)
- [x] 3.3 Leave the disconnect action unchanged so it takes effect immediately with no member-name step
- [x] 3.4 Extend `test/extensions/p2p-council/modal/council-detail-layer.test.ts`: connect pushes the step and joins under the submitted name; Esc at the step returns to the detail view without joining; disconnect skips the step

## 4. Wire the create flow

- [x] 4.1 Change `src/extensions/p2p-council/modal/create-council-layer.ts` to push the member-name layer on a valid council name instead of calling `createCouncil`, keeping itself on the stack with its entered value
- [x] 4.2 Pass an action that calls `createCouncil(councilName, memberName)` and preserves the existing post-create behavior
- [x] 4.3 Keep the duplicate-council-name check on submission of the council name so the member-name step is never reached for a council that cannot be created
- [x] 4.4 Add or extend a create-layer test: a valid council name advances without creating anything; a duplicate council name errors without advancing; Esc from the member-name step returns to a populated council-name field; completing both steps creates the council and hosts under the submitted name

## 5. Verify and document

- [x] 5.1 Update the identity section of `docs/p2p-council.md` to state that the default name is editable at connect time, must be a single whitespace-free token, is deduplicated on collision, and is not persisted
- [x] 5.2 Run `bun run check` and `bun test`
- [x] 5.3 Manually verify both flows end to end against a second live session, including a deliberate name collision resolving to a `-2` suffix
- [x] 5.4 Add a changeset describing the new member-name step
