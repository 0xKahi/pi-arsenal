## Context

See proposal.md — Why.

The relevant constraint is that Multiverse's agent pipeline is already almost entirely open. Downstream stages — parent prompt rendering, spawn input validation, model resolution, child runtime construction, and durable child identity — are keyed by the agent name declared in a definition's frontmatter, and `multiverse-agents` already specifies that registered definitions, not a hardcoded list, are the source of truth for available names. One stage is closed: discovery scans a single bundled directory, with no way to add to it.

Two existing mechanisms shape the design more than anything else:

- The registry already deduplicates by declared name on registration, keeping the first registration and reporting the conflict instead of overwriting.
- Per-agent model settings are already keyed by name and composed field by field across preset, per-subagent settings, and the parent model.

Both mean the feature can be expressed mostly as ordering and a second directory scan rather than new machinery.

## Goals / Non-Goals

**Goals:**

- Keep the entire change confined to discovery and extension wiring.
- Preserve one uniform availability and model story across bundled and user-defined agents.
- Make every per-file failure local, so one bad file never costs the user their other agents or the feature.

**Non-Goals:**

- No new enforcement boundary. A user agent's capability surface is its declared tool list, exactly as for bundled agents. The `Permissions:` line seen in bundled definitions is free-text parent-facing metadata, not a gate, and this change does not make it one.
- No hot-reload. Definitions continue to load once per activation.
- No user-supplied definition paths. The two discovery locations are fixed conventions; an arbitrary path is reached with a symlink into one of them.
- No filename/frontmatter name reconciliation. The frontmatter name is authoritative and the filename carries no meaning.

## Decisions

### Conventional directories, not configured file paths

Discovery reads two fixed directories — a global one and a project one — under the same `extensions/pi-arsenal/agents/` suffix where the extension already keeps `config.json`.

The alternative was a `personal_agents` configuration array of `{ file, model? }` entries. It buys exactly one thing: the ability to point at an arbitrary path. Its cost is a new configuration schema, an array-concatenation merge primitive in the loader, a path-expansion and relative-resolution rule with its own diagnostics, and an inline-model precedence tier to explain — a large surface for a feature whose whole point is loading a few markdown files. The mitigation for the lost ability is a symlink into the conventional directory.

A consequence is that the change adds no configuration field at all: the existing name-keyed `subagents` and `presets` maps already express every per-agent setting a user agent needs.

### Bundled beats project beats global

Definitions register in the order bundled, then project, then global. First-registration-wins turns that order into precedence.

The alternative was registering global before project, so the user's personal roster wins. Rejected because a project's agent overriding the user's personal agent of the same name is the behavior users already expect from every other configuration layer here: project configuration layers over global configuration. A user who wants their own definition of a colliding name is free to rename it.

### The frontmatter name is authoritative; the filename is decorative

The agent's name comes from its frontmatter `name` and nothing else. The `<agent-name>.md` filename is conventional: not parsed, not required to match, not used to default the name.

The alternatives were requiring the filename to match the frontmatter name, or defaulting the name from the filename stem. Both were rejected to avoid a new failure mode — a file that loads but is "wrongly named" — and to keep bundled and user files on exactly one definition format, where the name always comes from frontmatter.

### The trust gate lives at the discovery site

The project directory is scanned only when `initialCtx.isProjectTrusted()` returns true; the global directory is always scanned.

`isProjectTrusted()` is host-provided and advisory to extensions, not an enforced filesystem sandbox: the host applies trust when it loads resources itself, but an extension's own `readdirSync` of a project path succeeds either way. The trust gate reaches the project config file because `ConfigLoader` calls the method before loading it; discovery now happens outside the loader, so the extension must call the gate itself.

### An absent directory is silence, not a diagnostic

Neither user directory is expected to exist. A missing directory contributes zero paths and produces no warning.

This differs from a configured path, which is an assertion that something should be there: an unresolved configured path is a reportable typo. A conventional directory asserts nothing, so its absence is normal and stays quiet. Only a directory that exists but cannot be read, or an individual `.md` file that fails to parse, validate, or dedupe, is reported.

## Risks / Trade-offs

- **A project repository can introduce agent prompts on clone** → scanned only when the project is trusted, so the existing trust gate still bounds it, but trusting a project now also means accepting the definitions the repository ships. The specs should state this plainly.
- **Users cannot retune a bundled subagent, and a collision looks like their file being ignored** → accepted deliberately; the collision diagnostic names the winning bundled agent and the skipped file so the remedy (choose a different name) is obvious.
- **No hot-reload is more visible when the files are the user's own** → editing a user agent has no effect until reload, which is unchanged behavior but newly noticeable because users iterate on their own files; called out in documentation rather than fixed here.
- **A shared dotfiles roster now needs a symlink** → the conventional location is fixed, so a roster kept in a shared dotfiles repository must be symlinked into the global agents directory rather than referenced by path.

## Migration Plan

Additive and backward compatible. With neither user directory present, discovery and registration are byte-identical to today. No persisted data changes: existing child sessions keep their identity markers, and a child naming a user agent uses the same durable identity mechanism as any other child. Rollback is removing the definition files; sessions created against a user agent then fail activation with the existing "definition unavailable" diagnostic rather than corrupting anything.
