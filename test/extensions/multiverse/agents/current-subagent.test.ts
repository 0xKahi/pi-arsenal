import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveCurrentSubagent } from '../../../../src/extensions/multiverse/agents/current-subagent.ts';
import { MultiverseConfigSchema } from '../../../../src/schemas/multiverse.config.schema.ts';

const definition = (name: string, prompt: string, tools = ['read']) => `---
name: ${name}
tools: ${JSON.stringify(tools)}
skills: []
---
${prompt}
`;

describe('resolveCurrentSubagent', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-current-subagent-'));
    writeFileSync(path.join(directory, 'explorer.md'), definition('explorer', 'explorer prompt'));
    writeFileSync(path.join(directory, 'fixer.md'), definition('fixer', 'old fixer prompt'));
    writeFileSync(path.join(directory, 'visualizer.md'), definition('visualizer', 'visualizer prompt'));
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const resolveFixer = (config = MultiverseConfigSchema.parse({ enabled: true })) =>
    resolveCurrentSubagent({
      name: 'fixer',
      config,
      definitionsDirectory: directory,
      availableTools: ['read', 'edit'],
      availableSkills: [],
    });

  it('reloads the current prompt, tools, and skills on every activation', () => {
    const first = resolveFixer();
    expect(first).toMatchObject({ success: true, definition: { prompt: 'old fixer prompt', tools: ['read'], skills: [] } });

    writeFileSync(path.join(directory, 'fixer.md'), definition('fixer', 'new fixer prompt', ['read', 'edit']));
    const reopened = resolveFixer();

    expect(reopened).toMatchObject({ success: true, definition: { prompt: 'new fixer prompt', tools: ['read', 'edit'], skills: [] } });
  });

  it('fails clearly when the current definition is missing without touching stored session data', () => {
    const durableSession = path.join(directory, 'child.jsonl');
    writeFileSync(durableSession, '{"type":"session"}\n');
    rmSync(path.join(directory, 'fixer.md'));

    const result = resolveFixer();

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('fixer.md');
    expect(existsSync(durableSession)).toBe(true);
  });

  it('fails clearly while the current subagent is disabled', () => {
    const config = MultiverseConfigSchema.parse({ enabled: true, subagents: { fixer: { enabled: false } } });

    const result = resolveFixer(config);

    expect(result).toEqual({ success: false, error: 'Subagent "fixer" is currently disabled.' });
  });

  it('reports the current invalid definition', () => {
    writeFileSync(path.join(directory, 'fixer.md'), definition('fixer', '   '));

    const result = resolveFixer();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('fixer.md');
      expect(result.error).toContain('must not be empty');
    }
  });
});
