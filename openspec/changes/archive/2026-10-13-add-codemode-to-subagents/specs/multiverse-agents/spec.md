# Spec Delta

## ADDED Requirements

### Requirement: Bundled subagents declare codemode
The bundled `explorer`, `fixer`, and `visualizer` definitions SHALL declare `codemode` in their tools in addition to the tools taken from the maintainer's bundle. Their prompt bodies SHALL describe the codemode tool and when to use it. User-supplied definitions SHALL receive `codemode` only when they declare it themselves.

#### Scenario: Bundled roster advertises codemode
- **WHEN** the bundled definitions are enabled and the parent roster is rendered
- **THEN** each bundled agent's listed tools include `codemode`

#### Scenario: User definition without codemode
- **WHEN** a user-supplied definition omits `codemode` from its tools
- **THEN** its listed tools and its child's active tools do not include `codemode`

#### Scenario: User definition opts in
- **WHEN** a user-supplied definition lists `codemode` in its tools
- **THEN** its child receives `codemode` exactly as a bundled child does

### Requirement: Codemode is a known subagent tool
During enabled session activation, a declared `codemode` tool SHALL NOT be reported as an unknown tool, even when the parent session itself has no codemode tool registered, because Multiverse provides it to children that declare it.

#### Scenario: Parent without codemode
- **WHEN** the parent session has no registered codemode tool and an enabled definition declares `codemode`
- **THEN** activation reports no unknown-tool warning for `codemode`

#### Scenario: Other unknown tools still warn
- **WHEN** an enabled definition declares `codemode` and another unregistered tool
- **THEN** activation warns about the other tool only
