## Context

The status widget currently builds a `string[]` whose frame width is derived from the longest row. Pi wraps that form in padded `Text` components and limits it to ten lines. The controller is already called whenever `P2pHubState` reports a relevant connection, roster, status, model, or context change; disconnect clears the stable widget key. The new renderer must retain that lifecycle rather than adopting the independent timers and mutable query state used by the reference `pi-pi-grid` extension.

Pi's component-factory widget form receives the live terminal width and theme and returns a component with `render(width)` and `invalidate()`. Each rendered line must not exceed the supplied width, and ANSI escape sequences and wide characters require display-width-aware measurement and truncation.

The existing p2p protocol represents the member model as an optional string in identity and status messages. It currently fills that string from the active model's human-readable `name`; the same value flows to the widget, modal, peeks, and `p2p_ls`.

## Goals / Non-Goals

**Goals:**

- Make widget geometry deterministic for the width Pi supplies.
- Align member fields as shared columns while keeping excess whitespace bounded.
- Preserve useful identity and usage information under constrained widths without emitting overlong lines.
- Use one canonical model representation throughout p2p-hub.

**Non-Goals:**

- Changing when p2p state emits updates or adding widget-owned subscriptions, refresh timers, or animation.
- Changing widget placement, visibility rules, network topology, or tool behavior unrelated to model presentation.
- Adding user configuration for column widths or gaps.
- Introducing per-agent cards, vertical side borders, or horizontal scrolling.

## Decisions

### Use a stateless width-aware widget component

`P2PWidgetController` will register the existing stable key with a component factory instead of a pre-rendered string array. Its `render(width)` will read the current roster and construct raw terminal lines for that width. `invalidate()` will remain cache-free or clear only render-local caches. The existing `onChange -> renderWidget` path will continue to re-register/request the widget update, and disconnect will continue to remove the key.

This borrows the responsive rendering boundary from `pi-pi-grid` without borrowing its timers, process-stream state, command-controlled columns, or lifecycle. A persistent component subscribed directly to `P2pHubState` was considered, but it duplicates the extension's established update path and creates disposal obligations without providing value for this static-per-event content.

### Separate frame width from row-content width

The top and bottom borders will consume the full safe width supplied to `render`. The top border will embed the current hub name near the left; the bottom border will right-align a singular/plural member label. Both labels and border fills will be truncated or omitted gracefully when the terminal is too narrow to hold their decorated form.

Member rows will have a small leading inset but no vertical side borders. Their content will use only the width required by the resolved columns and bounded gaps; surplus terminal width will remain after the context field rather than being redistributed indefinitely. This preserves the requested open-row appearance while allowing the frame to communicate the full widget extent.

### Resolve shared responsive columns with explicit degradation priorities

Each render will first measure plain field values with terminal-visible-width utilities. Agent names and model IDs will receive shared column widths so subsequent columns begin at the same display position for every member. Desired text widths will be capped to prevent a single unusually long value from monopolizing the row. The context field will combine a variable-width bar with an always-visible percentage when context data is available.

The layout resolver will start from preferred field sizes and bounded comfortable gaps. If the row does not fit, it will reduce in this order:

1. Flexible gaps down to their minimum.
2. The context bar from its normal width down to a compact bar.
3. The model column, truncating values with an ellipsis.
4. The agent-name column as the final textual fallback.

The status indicator remains fixed, and the numeric context percentage is retained longer than its visual bar. At widths too small for even the compact structured row, the resolver will continue truncating or omit lower-priority optional fields rather than exceed the supplied width. Final assembly will use `visibleWidth`-equivalent padding and ANSI-safe `truncateToWidth`-equivalent truncation, followed by a defensive width bound on every line.

Fixed minimums, preferred caps, and a maximum flexible gap will be centralized layout constants rather than configuration. Tests will assert their behavior at representative narrow, normal, and very wide widths without coupling every assertion to incidental whitespace.

### Advertise the canonical model ID in the existing model field

The identity dependency will source `latestCtx.model?.id` instead of `.name`. The optional `model` field will continue through registration, welcome/member snapshots, status updates, peeks, roster state, modal details, and `p2p_ls` unchanged in shape; its documented semantics become canonical model ID.

Adding a second `modelId` field was considered but rejected because all current consumers prefer the compact canonical value, a duplicate field would complicate status synchronization, and the existing optional string can carry the ID without a protocol shape migration. Widget-only conversion is impossible to do reliably from a display name and would leave remote peers inconsistent.

## Risks / Trade-offs

- **[Risk] Extremely narrow widths can make border or repeat calculations negative** → Clamp all budgets before repetition, degrade labels independently, and defensively constrain every emitted line.
- **[Risk] ANSI styling, Unicode names, or status glyphs can break alignment if measured by JavaScript length** → Use terminal-visible-width measurement, ANSI-aware truncation, and visible-width padding throughout.
- **[Risk] Component-factory widgets bypass Pi's ten-line string-widget cap and large hubs can occupy more viewport height** → Preserve one compact line per member and avoid adding card height; roster-size limiting remains out of scope because it would hide connected members.
- **[Risk] Re-registering a component on every state change creates component churn** → Keep the component stateless and disposal-free; the roster is small and this matches the existing controller lifecycle.
- **[Risk] Mixed-version peers can still advertise display names in the same string field** → Accept and render the received value as opaque text; upgraded peers converge to IDs after reconnect or their next model-bearing status update.

## Migration Plan

No stored-data or wire-shape migration is required. Deploy the updated extension to participating Pi sessions and reconnect or allow a model-bearing status update to refresh remote roster values. Rollback restores display-name sourcing and the static string-array renderer; peers remain interoperable because the model field remains an optional string.
