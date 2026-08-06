## 1. Canonical Model Identity

- [x] 1.1 Source the local p2p identity model from the active Pi model ID instead of its display name, and align dependency naming/comments with the canonical-ID semantics.
- [x] 1.2 Verify registration, welcome/member snapshots, status updates, peeks, roster access, the hub detail modal, and both human-readable and structured `p2p_ls` output preserve the canonical model ID unchanged.
- [x] 1.3 Update model-related extension, state, protocol, modal, and tool tests to distinguish a model ID such as `gpt-5.6-sol` from its display name and assert the ID across all surfaces.

## 2. Width-Aware Widget Rendering

- [x] 2.1 Replace the connected widget's pre-rendered string-array registration with a stateless component factory while retaining the stable key, `belowEditor` placement, existing state-change update path, and disconnect clearing behavior.
- [x] 2.2 Add centralized responsive layout constants and display-width-aware helpers for ANSI-safe truncation, padding, clamped repetition, shared name/model column widths, bounded gaps, and variable context-bar width.
- [x] 2.3 Render full-width top and bottom borders with narrow-width-safe hub and singular/plural member labels, and render open member rows without vertical side borders.
- [x] 2.4 Implement aligned status, agent-name, model-ID, and context columns with the specified degradation order: shrink gaps, shorten the context bar, truncate the model, then truncate the agent name while retaining the status and context percentage as long as possible.
- [x] 2.5 Defensively constrain every widget line to the supplied terminal width, including extremely narrow widths, Unicode member names, ANSI-styled fields, absent model/context values, and unusually long labels.

## 3. Widget Verification

- [x] 3.1 Update the widget controller test harness to instantiate component factories and render them at explicit terminal widths rather than asserting string-array content.
- [x] 3.2 Add normal-width tests for full-width horizontal borders, no vertical row borders, aligned shared columns, hub title, member-count pluralization, canonical model IDs, and retained below-editor placement.
- [x] 3.3 Add wide-terminal tests proving borders expand while inter-field gaps remain capped and row content is not spread across all surplus width.
- [x] 3.4 Add narrow and extreme-width tests proving the degradation order remains readable and no rendered line exceeds its supplied display width or throws on a negative layout budget.
- [x] 3.5 Add Unicode/ANSI and roster-change coverage to verify visible-width alignment and confirm the existing p2p state-update lifecycle still replaces or clears the widget correctly.

## 4. Integration and Quality Checks

- [x] 4.1 Review p2p-hub documentation and examples for model display-name assumptions and update them to use canonical model IDs where applicable.
- [x] 4.2 Run the focused p2p-hub widget, extension, state, protocol, modal, and tool tests and resolve regressions.
- [x] 4.3 Run the full test suite, type check, and lint checks, then validate the OpenSpec change strictly.
