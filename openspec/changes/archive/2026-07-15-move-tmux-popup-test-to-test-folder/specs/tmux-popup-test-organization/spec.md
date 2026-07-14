## ADDED Requirements

### Requirement: External tmux popup test placement
The project SHALL store the tmux popup test suite under `test/extensions/tmux-popup/` rather than alongside production files in `src/extensions/tmux-popup/`.

#### Scenario: Tmux popup test suite is organized externally
- **WHEN** the repository is inspected after the test reorganization
- **THEN** the tmux popup `*.test.ts` files are located in `test/extensions/tmux-popup/` and are absent from `src/extensions/tmux-popup/`

### Requirement: Preserved tmux popup test coverage
The relocated tmux popup test suite SHALL continue to import and exercise the same tmux popup production modules and SHALL be discovered by the project's Bun test command.

#### Scenario: Relocated tests run successfully
- **WHEN** the project test command is run after relocation
- **THEN** the tmux popup test suite is discovered and completes without import-resolution failures
