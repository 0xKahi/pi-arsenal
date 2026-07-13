## Why

Agents currently cannot open an existing file in an interactive editor without taking over Pi's terminal or blocking the active tool call. A configurable tmux popup tool gives users a focused, non-blocking way to inspect or edit files while keeping the Pi session visible.

## What Changes

- Add the `tmux_popup` agent tool for opening an existing file in a tmux popup.
- Make the tool opt-in through layered `pi-arsenal` configuration, and omit it entirely from Pi's available tools when disabled.
- Support configurable popup width, height, and an editor command prefix that may include arguments.
- Accept only absolute file paths, with `~` home expansion and Pi-style leading `@` normalization.
- Reject missing paths, non-file paths, and invocations outside a tmux session.
- Launch `tmux display-popup` with `-E` in a detached process so the tool returns after opening the popup rather than waiting for the editor to exit.

## Capabilities

### New Capabilities
- `tmux-popup`: Configuration, availability, validation, and execution requirements for opening existing files in non-blocking tmux popups.

### Modified Capabilities

None.

## Impact

- Adds the first tool feature under `src/extensions/tmux-popup/`.
- Introduces or completes shared configuration loading needed to conditionally register package tools.
- Extends the generated `pi-arsenal` JSON configuration schema with `tmux_popup` settings.
- Uses the host filesystem, `$TMUX` environment variable, and installed `tmux` executable; no new runtime dependency is expected.
