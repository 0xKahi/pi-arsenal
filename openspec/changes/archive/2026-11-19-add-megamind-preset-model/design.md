# Design

## Context

The model preset resolver already composes sparse entries for children. The parent is the live Pi session, not a spawned agent, and persona selection controls its prompt and tools rather than its model.

## Goals / Non-Goals

Keep lineup resolution pure and make the parent action explicit. Do not add a persona-specific model stack, a new settings layer, automatic restoration, or a second source of truth for the session model.

## Decisions

1. Apply the action only in the parent modal confirmation handler, not in resolver selection, reset, spawn, or persona activation. Do not skip explicit confirmation just because the preset is already active. Use the resolved trusted configuration and distinguish named selection from the baseline sentinel.
2. Resolve the parent entry against the current host model, not child configuration. Look up the exact resulting provider/model pair in the host registry when model fields are supplied; never silently substitute a fallback. Use Pi's model setter before setting reasoning, retaining prior reasoning where supported and letting Pi clamp unsupported levels. For reasoning alone, skip model lookup and switching.
3. Commit the lineup only after successful parent model selection. Report lookup failure, missing authorization, or host refusal before applying reasoning or selecting the lineup. A preset with no parent fields follows the existing path.
4. Keep the preview side-effect free and label the row as the parent on confirmation, not as an available child. For children inheriting parent fields show the anticipated parent values or indicate inheritance, rather than implying the old model will be used. Keep existing same-name child resolution independent.
5. Treat the host change like a manual switch: Pi owns its session history, while the preset name remains ephemeral. Applying on initialization instead would overwrite model choices without confirmation.

## Risks / Trade-offs

- Changed parent fallback affects subsequently spawned children without complete settings. Document inheritance and test it alongside an explicitly configured fixer.
- A custom child named megamind shares the key. Label both rows clearly; preserve its existing child override rather than silently removing it.

## Migration Plan

No configuration migration. Removing the megamind entry stops future parent actions; it does not undo a host switch already made.
