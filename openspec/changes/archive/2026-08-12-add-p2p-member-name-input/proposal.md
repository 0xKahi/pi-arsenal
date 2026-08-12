## Why

An agent's council name is fixed at session start by `<cwd>/.arsenal/p2p-role.yml` (or the cwd basename), so the only way to join a council under a different name is to edit a config file and restart. When the same agent joins councils in different roles — or when the cwd basename is a meaningless directory name — the user has no way to correct it at the moment it matters. A short input step at connect time removes that friction without changing how identity works.

## What Changes

- Add a member-name step to the council modal, presented immediately before the session registers with a council. The input is prefilled with the session's default name (from `p2p-role.yml`, or the cwd basename) and is fully editable.
- The join flow becomes: council detail view → Enter → member-name step → connect.
- The create flow becomes two sequential inputs: council name → member name → create and host.
- Validate the submitted member name as a single token: at least one character and no whitespace. Invalid input shows an error in the step and does not connect.
- The submitted name is used as the registration name for that connection only. The prefill always comes from the resolved default identity name — never from a previously assigned or deduplicated name — so suffixes cannot accumulate across joins.
- Esc pops the member-name step back to the view that pushed it (council detail, or the council-name input) without connecting.
- No change to name deduplication. A submitted name that collides is deduplicated by the host exactly as before (`fixer` → `fixer-2`), and the assigned name is what the session ends up using.
- No change to reconnect or host promotion. Those paths re-register with the session's current name and never re-prompt.
- Not persisted: the custom name lives for the session and is never written back to `p2p-role.yml`.
- The `description` field remains sourced from `p2p-role.yml` and is not editable in the modal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-council-command`: the create-council view and the detail view's connect action gain a member-name step before registration, with its own prefill, validation, and cancel behavior.
- `p2p-council-networking`: agent identity resolution gains a user-supplied override for the registration name, layered on top of — and not replacing — the existing `p2p-role.yml` resolution and name deduplication.

## Impact

- **New**: a member-name modal layer under `src/extensions/p2p-council/modal/`.
- **Modified**: `src/extensions/p2p-council/modal/create-council-layer.ts` and `council-detail-layer.ts` push the new step instead of calling create/join directly.
- **Modified**: `src/extensions/p2p-council/p2p-council-state.ts` exposes the resolved default identity name and accepts a registration-name override on the create and join entry points.
- **Unaffected**: the wire protocol, host-side deduplication, welcome/assigned-name handling, reconnect, host promotion, the council registry, the status widget, and the `p2p_send` / `p2p_ls` / `p2p_ask` tools.
- **Docs**: `docs/p2p-council.md` identity section should note that the default name is editable at connect time.
