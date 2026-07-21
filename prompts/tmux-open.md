---
description: Open file in a tmux popup window 
argument-hint: "<SEARCH_TERM>"
---

open the following in a tmux popup using the `tmux_popup` tool
**Provided arguments**: $@

**Guards:**
- if `tmux_popup` tool is unavailable to you, return an error message: "pi-arsenal tmux_popup tool has not been enabled"
- file does not necessarily need to be in `cwd`, use any relevant skills based on the provided args to get file
