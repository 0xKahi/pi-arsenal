## 1. Configuration and layering

- [x] 1.1 Add optional defaultPreset and presets to both Multiverse schemas, reusing strict partial model fields; verify schema tests cover omitted fields, empty maps/entries, arbitrary names, invalid field types, unknown fields, and invalid reasoning.
- [x] 1.2 Extend ConfigLoader's global/trusted-project merge through preset name, agent name, and model fields using own-key-safe access; verify `test/config/config-loader.test.ts` covers field patches, retained sibling presets/agents, empty patches, defaultPreset precedence, untrusted projects, missing references, and invalid-block isolation.

## 2. Preset resolution and session state

- [x] 2.1 Add a pure shared preset resolver with a baseline selection distinct from named strings; verify unit tests cover every field's precedence, absent agents, empty entries, parent inheritance, named default, prototype-like names, missing presets, and source-config immutability.
- [x] 2.2 Add extension-local in-memory selection initialized after configuration loading on every session start, independently of one-time activation; verify lifecycle tests cover initial defaultPreset, missing-name baseline, explicit switching, reopen/reload, same-process session transitions, and no reset on persona or branch changes.
- [x] 2.3 Connect the resolver to execution-context model and reasoning lookups with a per-call snapshot; verify wiring tests show explicit selection overrides defaultPreset, returning to baseline removes overrides, and removed selections fall back without persisting or mutating configuration.

## 3. Presets tab

- [x] 3.1 Add preset preview data and a distinct preset-selection modal result, then wire parent-only selection without invoking persona persistence; verify modal/extension tests show selection closes the modal, cancellation changes nothing, child confirmation has no effect, and preset changes append no preference entries or alter persona/model/availability.
- [x] 3.2 Add the grouped Presets tab between Switch Agents and Child Sessions with baseline first, named presets, active marking, initial active focus, and per-agent inherited model/provider/requested-reasoning rows; verify rendering tests cover sparse presets, missing parent values, empty roster, no configured presets, and named-default disambiguation without authentication calls.
- [x] 3.3 Implement bounded grouped navigation and scrolling using the shared modal contracts, keeping preset focus and oversized agent previews accessible; verify tests cover Vim movement, Tab/Shift+Tab, confirmation, narrow widths, small heights, long names, control characters, many presets, and an oversized single roster.
- [x] 3.4 Update command description and modal regression expectations; verify command and Pi Vim event share the three-tab modal, existing persona switching/persistence still works, and Child Sessions remains a placeholder.

## 4. Runtime integration coverage

- [ ] 4.1 Add create/continue integration tests that switch presets between spawn calls; verify new and resumed interactions receive the new effective model and reasoning while continuations retain their selected conversation checkpoints.
- [ ] 4.2 Add a deferred/concurrency-limited batch test that switches presets after dispatch; verify both running and queued tasks retain the original snapshot and a later call uses the new selection.
- [ ] 4.3 Extend runtime regression coverage for unavailable effective preset models, authenticated parent fallback, reasoning clamping, failure isolation, and disabled/unregistered agents; verify no extra baseline-model retry is introduced and configuration without presets preserves existing behavior.

## 5. Published artifacts, documentation, and final verification

- [x] 5.1 Regenerate `assets/config.schema.json` with `bun run buildSchema` after schema changes; verify the generated diff exposes optional preset fields and partial model entries with descriptions and valid editor schema structure.
- [x] 5.2 Update `docs/multiverse.md` with full and sparse preset examples, field-level inheritance, defaultPreset/missing-name behavior, session-local reset semantics, picker controls, requested-versus-runtime model caveats, and subsequent-call create/continue behavior; verify examples match the schema and all four delta specs.
- [x] 5.3 Run `bun test`, `bun run type-check`, and `bun run lint`, recording any pre-existing failures separately; verify the changed configuration, runtime, lifecycle, and modal suites pass and no persistent-selection mechanism or unrelated implementation is introduced.
- [x] 5.4 Perform a TUI smoke check with default and sparse named presets, switching back to baseline and reopening the session; verify active markers, model previews, keyboard/scroll behavior, no persistence, and actual subsequent create/continue model selection match the specs.
