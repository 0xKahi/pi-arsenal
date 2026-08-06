## Why

The p2p-hub status widget is sized from its text rather than the terminal, so its columns do not align consistently and it does not adapt cleanly across narrow and wide terminals. Model display names also consume unnecessary space and vary in presentation where a canonical model identifier would be shorter and unambiguous.

## What Changes

- Render the existing p2p-hub status widget as a width-aware dynamic component while preserving its connection-driven visibility, below-editor placement, and existing state-update lifecycle.
- Expand the top and bottom borders to the available terminal width, while arranging status, agent name, model, and context usage in aligned responsive columns without vertical side borders.
- Use bounded gaps so rows remain readable at normal widths without spreading their fields excessively on very wide terminals.
- Degrade predictably on narrow terminals by reducing gaps, shortening the context bar, and truncating lower-priority text with ANSI/display-width-aware operations.
- Advertise and display the canonical Pi model ID, such as `gpt-5.6-sol`, instead of the human-readable model name across p2p identity, status updates, the widget, hub detail views, and `p2p_ls`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-hub-status-widget`: Make the status box terminal-width-aware with responsive, aligned member columns and bounded spacing.
- `p2p-hub-networking`: Define the model carried in member identity and status propagation as the canonical model ID.
- `p2p-hub-command`: Show canonical model IDs in hub detail rosters.
- `p2p-hub-tools`: Return and render canonical model IDs from `p2p_ls`.

## Impact

- Widget rendering in `src/extensions/p2p-hub/widget/`, including use of the Pi component-factory widget API and terminal display-width utilities.
- Model identity sourcing and propagation in `p2p-hub.extension.ts`, `P2pHubState`, and the existing p2p wire messages.
- Hub detail and `p2p_ls` presentation, plus widget, extension, protocol, modal, and tool tests.
- The wire field remains an optional string, so its shape is compatible; mixed-version peers may temporarily report human-readable model names until upgraded and reconnected or updated.
