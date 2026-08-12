# @0xkahi/pi-arsenal

## 0.2.5

### Patch Changes

- 7bc57cc: p2p_council: choose your member name when connecting

  The council modal now asks for the name this session registers under, immediately before connecting. Creating a council is two steps (council name, then member name); joining from a council's detail view prompts for the member name before it joins.

  The input is prefilled with the name resolved from `<cwd>/.arsenal/p2p-role.yml` (or the cwd basename) with the caret at the end, so pressing Enter straight through behaves exactly as before. Names must be at least one character with no whitespace. Collisions are still deduplicated by the host (`fixer` → `fixer-2`), the prefill always shows the resolved default so suffixes never accumulate, and the chosen name is never written back to `p2p-role.yml`. Reconnection and host promotion reuse the current name without prompting.

## 0.2.4

### Patch Changes

- df812f0: added text-wrap to p2p_council modal and added `council-assign` prompt

## 0.2.3

### Patch Changes

- b042885: added renderer to p2p_ls tool

## 0.2.2

### Patch Changes

- 1d3bd46: added batching to p2p_ask tool

## 0.2.1

### Patch Changes

- 174cf69: lazyload p2p_council tools only activate when connected to a council

## 0.2.0

### Minor Changes

- 0aba50c: rename p2p_hub -> p2p_council

## 0.1.1

### Patch Changes

- 03ad9aa: - imrpove p2p hub tools registration
  - imrpove p2p hub tools preview
  - improve p2p hub tools renders and output formatting

## 0.1.0

### Minor Changes

- 2430c5c: Added p2p_hub: pi-to-pi agent communication over local hub-and-spoke networks. New `p2p_send`, `p2p_ask`, and `p2p_ls` tools, a `/p2p-hub` modal command for creating/browsing/connecting to hubs, per-agent identity via `.arsenal/p2p-role.yml`, and a below-editor connection status widget. Disabled by default (`p2p_hub.enabled: false`).

### Patch Changes

- e4397ed: sanitize p2p_hub role naming convention -> connection type
- 6aedb9c: fix extension registration flow and p2p_hub state management

## 0.0.4

### Patch Changes

- 8725f01: lazy-load tmux_popup prompts

## 0.0.3

### Patch Changes

- 2c3e1a0: added tmux-open prompt

## 0.0.2

### Patch Changes

- cb5ca6c: fix tmux_popup tool registration on new sessions

## 0.0.1

### Patch Changes

- a193386: added tmux_popup tool
