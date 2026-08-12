## Context

See `proposal.md` — Why. Requirements are in this change's delta specs.

Relevant current state in `src/extensions/p2p-council/`:

- `identity.util.ts` resolves `{ name, description }` from `<cwd>/.arsenal/p2p-role.yml` once, at extension activation.
- `p2p-council-state.ts` stores that as `private readonly identity` and seeds `private selfName` from it. `selfName` is already mutable: the host's `dedupeName` result arrives as `welcome.assignedName` and is written back to `selfName`. Reconnection and host promotion re-register using whatever `selfName` currently holds.
- Nothing outside the state reads `identity.name`; there is no getter.
- The modal is a layer stack. `CreateCouncilLayer` is `inputPolicy: 'text-focused'` and calls `state.createCouncil(name)` on Enter. `CouncilDetailLayer` is navigation-driven and calls `state.joinCouncil(entry)` on confirm.

Constraint that shapes the design: `Input` from `@earendil-works/pi-tui` exposes only `getValue`/`setValue`, and `setValue` sets `cursor = Math.min(cursor, value.length)`. Prefilling a fresh `Input` therefore leaves the caret at index 0.

## Goals / Non-Goals

**Goals**

- Keep the registration-name override confined to the two user-initiated entry points, so non-interactive registration paths are structurally incapable of picking up a stale override.
- Reuse the existing text-focused layer conventions rather than introducing a new input pattern.

**Non-Goals**

- No change to the wire protocol, `dedupeName`, `welcome`/`assignedName` handling, reconnection, or promotion.
- No new persistence surface. Nothing is written to disk.
- No editing of `description` or any other identity field.

## Decisions

### Pass the name as a parameter to `createCouncil` / `joinCouncil`, not via a `setSelfName` setter

`createCouncil(name, memberName?)` and `joinCouncil(entry, memberName?)` take an optional registration name and assign `selfName` immediately before registering. When omitted, the current behavior is preserved exactly.

*Why not a `setSelfName(name)` setter called by the layer before connecting?* A setter creates a window where `selfName` is mutated but no connection follows — for example when `createCouncil` rejects a duplicate council name, or when the socket fails to open. The session would then carry a name it never registered under, and the next reconnect or promotion would use it. Threading the name through the connect calls keeps every `selfName` write adjacent to the registration it feeds, which is what the spec's "reconnection keeps the current name" scenario depends on.

*Why not a persistent `preferredName` field on the state?* Considered and rejected: the spec requires the prefill to always be the resolved default, so no second name field needs to survive a connection.

### Prefill reads a new accessor for the resolved default name

Add a read-only accessor on the state exposing `identity.name` (the value from `identity.util.ts`, not `selfName`). The member-name layer prefills from it on construction.

This is the single mechanism that satisfies "prefill ignores a previously assigned name". Reading `getSelfName()` instead would reintroduce suffix accumulation (`fixer` → `fixer-2` → `fixer-2-2`), which the specs explicitly forbid.

### The member-name layer is generic and takes a submit callback

One layer serves both flows. It owns the prefill, the validation, the error line, and the busy state; the caller supplies what to do with the accepted name. The join flow passes a callback that calls `joinCouncil(entry, name)`; the create flow passes one that calls `createCouncil(councilName, name)`.

*Why not two layers, or fold the input into the existing layers?* Two layers would duplicate validation and prefill logic in a way that can drift. Folding a second field into `CreateCouncilLayer` would give the create flow a different interaction shape from the join flow for the same question, and Esc could no longer pop the two steps independently as the specs require.

### Prefill is inserted as text, not written with `setValue`

The layer prefills by feeding the default name through `input.handleInput(defaultName)`. `Input.insertCharacter` advances the caret by the inserted length, so the caret lands at the end with no separate cursor move.

*Revised during implementation.* The original decision was to call `setValue` and then synthesize an end-of-line key. Reading `Input`, that key is dispatched through `kb.matches(data, 'tui.editor.cursorLineEnd')` — a **remappable** keybinding. A user who rebound it would get the caret at index 0 and silently prepend to the prefill. Inserting the text sidesteps the keybinding layer entirely and uses strictly less API surface.

*Alternative considered:* wrapping or forking `Input` to expose a cursor API. Rejected as disproportionate — `src/libs/modal/UPSTREAM.md` already tracks vendored UI code, and adding another divergence for one caret position is not worth the maintenance cost.

### Create flow stacks the member-name layer on top of the council-name layer

`CreateCouncilLayer` stops calling `createCouncil` on Enter and instead pushes the member-name layer, keeping itself on the stack with its entered value intact. This is what makes Esc from the member-name step return to a populated council-name field, per the specs.

The duplicate-council-name check stays where it is, on submission of the council name, so the user is not asked for a member name for a council that cannot be created. Since the check previously happened inside `createCouncil`, the state exposes it separately as a read-only `findLiveCouncilConflict(name)`; `createCouncil` still performs its own check, so the public contract is unchanged and the UI check is purely an early exit.

## Risks / Trade-offs

- **The caret can silently land at index 0 and make typing prepend to the prefill** → covered by a test that prefills, feeds characters, and asserts the submitted value is `default + typed`, not `typed + default`.
- **An extra step on the most common path (accept the default and connect) costs one keystroke** → accepted; the prefill means the extra keystroke is a bare Enter.
- **Two connect paths must both route through the new layer; a future third path could bypass it** → mitigated by making the name a parameter on the state's connect methods, so a bypass degrades to the previous default-name behavior rather than to a wrong name.
- **A user may expect the custom name to persist across restarts** → out of scope by decision in the proposal; the prefill always showing the role-file default makes the ephemerality visible on every connect.

## Migration Plan

Not applicable. No stored data, no protocol change, and no configuration change. A session running the previous version and one running the new version interoperate: the new version simply registers a different name string, which the old host deduplicates as it always has.
