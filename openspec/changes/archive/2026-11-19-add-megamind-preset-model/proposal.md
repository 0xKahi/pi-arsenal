# Proposal

## Why

Switching a Multiverse lineup currently changes the children but leaves the orchestrator on its previous model. Users should be able to choose both in one deliberate action without changing personas.

## What Changes

- On explicit confirmation of a named preset, apply its optional `megamind` model and reasoning fields to the current parent session, in either persona. Show the parent action separately from child settings in the picker.
- Do not apply that action on initialization from `defaultPreset`, reload, or persona changes. The built-in default and presets without parent fields leave the current parent settings alone.
- Preserve existing subagent resolution, including for a custom child also named `megamind`: in that unusual case the entry configures both on confirmation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `multiverse-presets`: extend explicit preset confirmation to optionally switch the host model and reasoning; distinguish this action from session-local lineup selection.

## Impact

Affects the Multiverse modal and extension confirmation handler, model-resolution tests, and model preset documentation. No new config shape, provider dependency, persona, or persistence format.
