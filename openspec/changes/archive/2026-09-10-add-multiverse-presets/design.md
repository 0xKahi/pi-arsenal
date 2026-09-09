## Context

See `proposal.md` for motivation and scope. This is a cross-cutting configuration, runtime-state, and modal change, so a design artifact is warranted.

Observed integration points:
- `src/schemas/multiverse.config.schema.ts` already defines strict partial subagent model objects using `ModelConfigSchema.partial().strict()`.
- `src/config/config-loader.ts` merges subagents by name and model field; new preset maps otherwise risk shallow replacement.
- `src/extensions/multiverse/multiverse.extension.ts` obtains current configuration and builds model/reasoning lookup closures per spawn call. Its one-time activation guard must not accidentally prevent preset resets on subsequent session starts.
- `spawn-orchestrator.ts` resolves a continued child's agent before asking for model configuration, so one shared resolver serves create and continue.
- `ChildRuntime` tries the effective configured model and then the parent with authentication checks; reasoning is clamped to the chosen model.
- `open-multiverse-modal.ts` currently provides Switch Agent and Child Sessions. The shared `ListTab` renders one line per item, which does not directly support the requested grouped multi-line preset layout.

## Goals / Non-Goals

**Goals:**
- Keep configuration composition pure and shared between runtime and preview.
- Keep mutable selection separate from immutable loaded configuration and durable persona state.
- Capture model settings once per spawn call so concurrency scheduling cannot produce mixed presets.
- Preserve existing behavior when presets are omitted.

**Non-Goals:**
- Persisting selection, editing configuration through the picker, preset inheritance from other presets, or deletion/reset syntax for configuration layers.
- Changing agent registration, enablement, parent persona, parent model, or directly opened child models.
- Probing authentication in the picker or introducing a third runtime model candidate.
- General-purpose modal-library redesign or implementing the Child Sessions placeholder.

## Decisions

### 1. Reuse the strict partial model schema

Preset shape is `Record<presetName, Record<agentName, Partial<ModelConfig>>>`; entries contain model fields directly, not a nested `model` wrapper. Add optional fields to both full and partial Multiverse schemas. Keep model fields optional at parse time so defaults cannot shadow inherited values.

Merge global/project maps at preset, agent, and model-field levels using own-key-safe lookup. Follow existing configuration trust and invalid-block isolation. Unknown model/provider availability remains a runtime concern. Missing defaultPreset references are valid, including references resolved only after layering.

Alternative: full model entries or whole-preset replacement. Rejected because partial entries are confirmed and deep merging matches existing configuration conventions.

### 2. Represent baseline selection independently of named presets

Use a tagged selection or an equivalent non-string baseline sentinel. The built-in default means no overrides, not a synthesized mutable preset. A named preset `default` remains valid; display it as `[default] (configured)` and the baseline as `[default] (built-in)` when disambiguation is necessary. `defaultPreset: "default"` refers to the configured entry if present.

This avoids reserving an otherwise valid name or accidentally making a preset inaccessible. Apply own-property checks to names, including names such as `constructor`.

### 3. Keep selection in extension-local memory and reset on session initialization

Initialize from current configuration on each session start, reopen, session switch, or extension reload. Install this initialization independently of the existing one-time command-registration guard and after configuration initialization. Do not append selection entries or write config. Persona switching and branch navigation are not reset triggers.

A selected name missing from current configuration resolves to baseline for both runtime and display. The picker closes on confirmation, following the existing persona picker pattern. Selecting a preset while the parent persona is Default is allowed, preparing the lineup for a later switch to Megamind. Selection is disabled in child sessions because it controls parent-dispatched work, not the current child's model.

Alternative: reuse durable `ParentAgentState` selection. Rejected because persistence is explicitly out of scope and persona selection is independent.

### 4. Compose configuration before existing runtime resolution

For each field, precedence is:

```text
selected preset field
        |
        v  if absent
subagents.<agent>.model field
        |
        v  if absent
existing parent-session fallback
```

A pure resolver returns a new partial configuration formed from baseline settings plus explicit preset fields. Capture the active selection and composed configurations when `getExecutionContext` runs, not from mutable selection inside each queued task's lookup. The same snapshot supplies model and reasoning closures. Existing runtime model/authentication selection remains downstream.

Configuration inheritance is not runtime retry order. If an explicitly configured preset model is unavailable, existing runtime fallback goes to the parent, not back through a separate baseline-model candidate. This preserves current runtime behavior; only the configured candidate changes. This interpretation is a proposed compatibility detail, rather than an additional user-confirmed retry policy.

### 5. Share preview composition, not authentication work

Use the same pure configuration resolver for each preset preview, then fill parent-derived values from the current modal context when available. Show an explicit parent-inheritance label for unresolved fields. Present reasoning as the requested level (before runtime clamping) and label the preview accordingly; runtime may choose a fallback model or adjust reasoning.

Enumerate the available registered roster, not keys in presets. Disabled/unregistered entries do not become rows or spawn targets. Optional inherited-value annotations can clarify sparse presets without changing precedence.

### 6. Add a grouped Presets tab within the existing modal shell

Append Presets after Child Sessions, preserving existing tab positions. Add a distinct preset-selection result so selecting a preset never invokes durable persona selection. Pass snapshots of presets, effective selection, available agents, and parent preview values into the pure modal factory.

Implement an extension-local grouped tab using the shared modal navigation contract and list-navigation utilities. Focus moves between preset headings; per-agent lines belong to their group. Keep the focused heading visible, clip to the available width, and support scrolling through oversized group content so long rosters remain inspectable. Reuse terminal text-safety helpers for user-controlled names and model fields.

```text
[Switch Agent]  [Child Sessions]  [Presets]

  [default]
    explorer: model-a (provider-a) / low
    fixer:    model-b (provider-b) / high

> [smart] (active)
    explorer: model-c (provider-c) / high
    fixer:    model-b (provider-b) / high

Enter: Switch   Esc: Cancel
```

Alternative: one-line preset choices with a separate detail page. Simpler with `ListTab`, but does not preserve the requested inline comparison layout. Do not change the generic ListTab contract solely for this feature.

The deep-merge details, collision labeling, child-session disabled state, preview labeling, and oversized-group scrolling are proposed design defaults grounded in existing behavior; they are not additional requests attributed to the user.

## Risks / Trade-offs

- Partial provider/model overrides can create unavailable pairs -> document field-wise behavior and retain existing authenticated parent fallback.
- An in-memory choice could leak across same-process session changes -> explicit lifecycle reset tests, including the one-time activation guard.
- Mutable selection could affect queued tasks -> capture composed configurations per call and test a switch while a batch is pending.
- Preview could be mistaken for the guaranteed runtime model -> label it as configuration/requested reasoning and perform no auth probe.
- Grouped rows complicate small-terminal navigation -> keep implementation local and test width, height, many presets, and an oversized single roster.
- Arbitrary map keys could collide with object prototypes or baseline identity -> own-key-safe composition and a separate baseline sentinel.

## Migration Plan

No data migration is needed. Add optional schema fields, resolver/state and UI wiring, then regenerate the published schema and update documentation. Existing configurations continue using baseline behavior.

Verify schema/merge tests, resolver and lifecycle tests, modal tests, and create/continue integration tests before release. To roll back to an older extension version, remove `presets` and `defaultPreset` from configuration first: older strict schemas reject unknown keys. No saved preset preferences or child-session records require cleanup.
