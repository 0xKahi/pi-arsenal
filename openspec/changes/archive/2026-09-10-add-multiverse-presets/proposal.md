## Why

Multiverse users currently have to edit individual subagent model settings to change their model lineup. Named presets let users switch between reusable lineups from `/multiverse` while retaining their existing subagent settings as defaults.

## What Changes

- Add optional `multiverse.defaultPreset` and `multiverse.presets`, mapping preset names to agent names to partial model configurations.
- Allow optional `provider`, `modelId`, and `reasoning` in each preset entry, just like existing subagent model settings. Resolve omitted fields through subagent settings and then current parent-session values.
- Start with the configured preset when it exists; otherwise use the built-in default (existing subagent settings). Missing preset references do not invalidate Multiverse.
- Add a selectable Presets tab with the built-in default and configured presets, the active selection, and per-agent model/provider/reasoning previews.
- Keep explicit selection in memory only. New/reopened sessions and extension reloads initialize from configuration; selections do not modify configuration or session history.
- Apply switches to subsequent spawn calls, for both new and continued children; already-dispatched batches retain their original selection.
- Preserve agent availability, persona behavior, and existing runtime authentication fallback.

## Capabilities

### New Capabilities

- `multiverse-presets`: In-memory preset selection, partial-field composition, and preset browsing/switching behavior.

### Modified Capabilities

- `multiverse-config`: Optional preset configuration, nested global/project merging, validation, and published schema coverage.
- `multiverse-runtime`: Resolve models from the active preset over subagent settings, with a consistent selection per spawn call.
- `multiverse-orchestrator`: Extend the existing modal with a Presets tab without changing persona persistence or the Child Sessions placeholder.

## Impact

- Configuration: `src/schemas/multiverse.config.schema.ts`, `src/config/config-loader.ts`, and generated `assets/config.schema.json`.
- Multiverse: extension lifecycle/execution-context wiring, a shared preset resolver and in-memory selection state, and the modal's preset rendering/navigation.
- Tests: configuration merging/validation, preset resolution/state, spawn integration (including continuations and queued tasks), and modal interaction/rendering.
- Documentation: `docs/multiverse.md` and generated configuration reference where applicable.
- No new external dependency, persistent preset-selection record, config-writing command, or child-session migration is required.
