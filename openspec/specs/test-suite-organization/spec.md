# Test Suite Organization

## Purpose
Ensure project tests are consistently maintained outside production source directories.

## Requirements

### Requirement: External project test placement
The project SHALL store all TypeScript test files under the top-level `test/` directory and SHALL preserve a directory structure that corresponds to the tested `src/` area.

#### Scenario: Source-adjacent tests are relocated
- **WHEN** the repository is inspected after test organization
- **THEN** no `*.test.ts` files are present under `src/` and the config and utility tests are located at `test/config/config-loader.test.ts` and `test/utils/shell.util.test.ts`

### Requirement: Preserved test execution after relocation
Relocated tests SHALL continue to import and exercise their existing production modules and SHALL be discovered by the project's Bun test command.

#### Scenario: Full suite runs with external tests
- **WHEN** `bun test` is run after relocation
- **THEN** the relocated config and utility tests are discovered and complete without import-resolution failures
