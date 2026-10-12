# Spec Delta

## ADDED Requirements

### Requirement: Codemode loads in children that declare it
When the resolved subagent definition declares `codemode` in its tools, the hydrated child runtime SHALL make Pi's codemode tool available. When the definition doesn't declare it, the child runtime SHALL NOT load codemode. This SHALL hold whatever the user's codemode settings are, including default-tool selections and a disabled built-in codemode extension.

#### Scenario: Declared codemode is available
- **WHEN** a child is hydrated from a definition whose tools include `codemode`
- **THEN** the child's active tools include `codemode`

#### Scenario: Undeclared codemode is absent
- **WHEN** a child is hydrated from a definition whose tools omit `codemode`
- **THEN** the child runtime does not load codemode and `codemode` is not among its tools

#### Scenario: User settings do not disable declared codemode
- **WHEN** the user's settings disable the built-in codemode extension or omit `codemode` from default tools, and a child's definition declares `codemode`
- **THEN** that child still has `codemode` active

#### Scenario: Reopened child adopts the current declaration
- **WHEN** a persisted child is continued after its definition gains or loses `codemode`
- **THEN** the newly hydrated runtime loads codemode only if the current definition declares it

### Requirement: Child codemode scripts are limited to the child's tools
Within a child, codemode scripts SHALL only be able to call tools that are active in that child, apart from codemode itself. Declaring `codemode` SHALL NOT give a child access to registered tools its definition does not declare, including Multiverse orchestration tools.

#### Scenario: Read-only child cannot edit through codemode
- **WHEN** a child declares `codemode` but neither `edit` nor `write`, and a codemode script tries to call them
- **THEN** those tools are not callable from the script

#### Scenario: Child cannot spawn through codemode
- **WHEN** a child declares `codemode` and a codemode script looks for or calls `spawn`
- **THEN** `spawn` is not callable from the script
