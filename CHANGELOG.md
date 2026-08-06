# @0xkahi/pi-arsenal

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
