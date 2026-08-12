---
'@0xkahi/pi-arsenal': patch 
---

p2p_council: choose your member name when connecting

The council modal now asks for the name this session registers under, immediately before connecting. Creating a council is two steps (council name, then member name); joining from a council's detail view prompts for the member name before it joins.

The input is prefilled with the name resolved from `<cwd>/.arsenal/p2p-role.yml` (or the cwd basename) with the caret at the end, so pressing Enter straight through behaves exactly as before. Names must be at least one character with no whitespace. Collisions are still deduplicated by the host (`fixer` → `fixer-2`), the prefill always shows the resolved default so suffixes never accumulate, and the chosen name is never written back to `p2p-role.yml`. Reconnection and host promotion reuse the current name without prompting.
