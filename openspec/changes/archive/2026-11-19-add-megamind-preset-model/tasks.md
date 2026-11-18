# Tasks

## 1. Explicit parent switch

- [x] 1.1 Resolve the named preset's parent fields against the live host. Add unit cases for model-only, provider-only, reasoning-only, empty entries, and a configured name of `default` versus the baseline.
- [x] 1.2 Apply the parent action in the parent-only confirmation path before selecting the lineup. Extend activation tests for both personas, model-before-reasoning order, supported-level clamping, lookup failure and host refusal with no partial lineup switch.
- [x] 1.3 Verify session initialization and reload with `defaultPreset` do not call host setters, explicit reconfirmation does, and persona switches, cancellation, child sessions, and baseline selection leave host settings untouched.
- [x] 1.4 Verify subsequent spawns see the new fallback model and reasoning while a configured fixer and a custom child named megamind retain ordinary child resolution. Document an example in `docs/multiverse.md` distinguishing automatic lineup selection from manual host switching.

## 2. Preset preview

- [x] 2.1 Show an explicitly labeled parent action when present and align child inheritance previews with the proposed switch. Extend modal tests for sparse fields, empty roster, and separately labeled same-name child; verify inspecting rows does not apply settings.
- [x] 2.2 Document how to read the parent preview and what happens on an unavailable model. Check the documented picker behavior against the modal and activation tests.
