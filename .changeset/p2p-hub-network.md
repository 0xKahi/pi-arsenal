---
"@0xkahi/pi-arsenal": minor
---

Added p2p_hub: pi-to-pi agent communication over local hub-and-spoke networks. New `p2p_send`, `p2p_ask`, and `p2p_ls` tools, a `/p2p-hub` modal command for creating/browsing/connecting to hubs, per-agent identity via `.arsenal/p2p-role.yml`, and a below-editor connection status widget. Disabled by default (`p2p_hub.enabled: false`).
