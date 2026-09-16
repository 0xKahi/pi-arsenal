import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SubAgentRegistry } from '../../../../src/extensions/multiverse/agents/subagent-registry.ts';
import { MultiverseConfigSchema } from '../../../../src/schemas/multiverse.config.schema.ts';

const source = (name: string, prompt = 'initial') =>
  `---\nname: ${name}\ntools: [read, missing, read]\nskills: [unknown]\nmetadata: [routing]\n---\n${prompt}`;

describe('SubAgentRegistry', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'arsenal-registry-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const file = (name: string, content: string) => {
    const filePath = path.join(directory, name);
    writeFileSync(filePath, content);
    return filePath;
  };
  const config = (subagents = {}) => MultiverseConfigSchema.parse({ enabled: true, subagents });

  it('uses registered string names, not filenames or configuration keys, as its authority', () => {
    const registry = new SubAgentRegistry();
    expect(registry.register([file('different.md', source('researcher'))])).toEqual([]);
    expect(registry.availableSubAgents).toEqual([]);
    registry.resolveAvailability(config({ fictional: { enabled: true } }));
    expect(registry.availableSubAgents.map(agent => agent.name)).toEqual(['researcher']);
    expect(registry.getSubAgent('researcher')).toMatchObject({ enabled: true, agent: { tools: ['read', 'missing'], skills: ['unknown'] } });
    expect(registry.getSubAgent('fictional')).toBeNull();
    expect(registry.getSubAgent('explorer')).toBeNull();
  });

  it('refreshes enablement without replacing definitions', () => {
    const registry = new SubAgentRegistry();
    registry.register([file('a.md', source('researcher'))]);
    registry.resolveAvailability(config());
    const definition = registry.getSubAgent('researcher')?.agent;
    registry.resolveAvailability(config({ researcher: { enabled: false } }));
    expect(registry.availableSubAgents).toEqual([]);
    expect(registry.getSubAgent('researcher')?.agent).toBe(definition);
    expect(registry.getSubAgent('researcher')?.enabled).toBe(false);
    registry.resolveAvailability(config());
    expect(registry.getSubAgent('researcher')?.agent).toBe(definition);
    expect(registry.getSubAgent('researcher')?.enabled).toBe(true);
  });

  it('reads each path once and adopts edits only in a fresh registry', () => {
    const filePath = file('a.md', source('researcher'));
    const registry = new SubAgentRegistry();
    registry.register([filePath]);
    writeFileSync(filePath, source('researcher', 'updated'));
    registry.register([filePath]);
    registry.resolveAvailability(config());
    expect(registry.getSubAgent('researcher')?.agent.prompt).toBe('initial');
    const fresh = new SubAgentRegistry();
    fresh.register([filePath]);
    expect(fresh.getSubAgent('researcher')?.agent.prompt).toBe('updated');
  });

  it('reports collisions without overwriting and continues after malformed/missing files', () => {
    const registry = new SubAgentRegistry();
    const first = file('a.md', source('researcher'));
    const errors = registry.register([
      first,
      first,
      file('b.md', source('researcher', 'collision')),
      file('invalid.md', 'invalid'),
      path.join(directory, 'missing.md'),
    ]);
    expect(errors).toHaveLength(3);
    expect(errors[0]?.message).toContain('duplicate subagent');
    expect(errors[1]?.message).toContain('invalid.md');
    expect(errors[2]?.message).toContain('missing.md');
    expect(registry.getSubAgent('researcher')?.agent.prompt).toBe('initial');
  });

  it('keeps the first registration and names the winner and skipped file on a bundled-vs-user conflict', () => {
    const registry = new SubAgentRegistry();
    const bundled = file('bundled-fixer.md', source('fixer', 'bundled prompt'));
    const user = file('user-fixer.md', source('fixer', 'user prompt'));
    const errors = registry.register([bundled, user]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('duplicate subagent');
    expect(errors[0]?.message).toContain('fixer');
    expect(errors[0]?.message).toContain(bundled);
    expect(errors[0]?.message).toContain(user);
    expect(registry.getSubAgent('fixer')?.agent.filePath).toBe(bundled);
    expect(registry.getSubAgent('fixer')?.agent.prompt).toBe('bundled prompt');
  });

  it('lets a project definition beat a global definition of the same name', () => {
    const registry = new SubAgentRegistry();
    const project = file('project.md', source('shared', 'project prompt'));
    const global = file('global.md', source('shared', 'global prompt'));
    // discoverOrderedSubagentPaths emits project before global, so the registry sees project first.
    const errors = registry.register([project, global]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(project);
    expect(errors[0]?.message).toContain(global);
    expect(registry.getSubAgent('shared')?.agent.prompt).toBe('project prompt');
  });

  it('lets the alphabetically earlier file win when two files in the same directory conflict', () => {
    const registry = new SubAgentRegistry();
    const first = file('a.md', source('same', 'first prompt'));
    const second = file('b.md', source('same', 'second prompt'));
    // Discovery sorts each directory alphabetically, so the earlier file is registered first.
    const errors = registry.register([first, second]);
    expect(errors).toHaveLength(1);
    expect(registry.getSubAgent('same')?.agent.prompt).toBe('first prompt');
  });

  it('registers a file under its frontmatter name regardless of the filename', () => {
    const registry = new SubAgentRegistry();
    registry.register([file('deliberately-mismatched.md', source('researcher'))]);
    registry.resolveAvailability(config());
    expect(registry.availableSubAgents.map(agent => agent.name)).toEqual(['researcher']);
    expect(registry.getSubAgent('deliberately-mismatched')).toBeNull();
  });

  it('registers the valid entries when one entry among several fails', () => {
    const registry = new SubAgentRegistry();
    const errors = registry.register([
      file('a.md', source('alpha')),
      path.join(directory, 'missing.md'),
      file('invalid.md', 'not a definition'),
      file('b.md', source('beta')),
    ]);
    registry.resolveAvailability(config());
    expect(errors).toHaveLength(2);
    expect(registry.availableSubAgents.map(agent => agent.name)).toEqual(['alpha', 'beta']);
  });

  it('leaves the bundled roster available when every user entry fails', () => {
    const registry = new SubAgentRegistry();
    const errors = registry.register([
      file('explorer.md', source('explorer')),
      file('fixer.md', source('fixer')),
      path.join(directory, 'missing.md'),
      file('invalid.md', 'not a definition'),
    ]);
    registry.resolveAvailability(config());
    expect(errors).toHaveLength(2);
    expect(registry.availableSubAgents.map(agent => agent.name)).toEqual(['explorer', 'fixer']);
  });

  it('reports a missing file as a failure naming the path it could not load', () => {
    const registry = new SubAgentRegistry();
    const resolved = path.join(directory, 'missing.md');
    const errors = registry.register([resolved]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.filePath).toBe(resolved);
    expect(errors[0]?.message).toContain(resolved);
  });

  it('governs a user agent through the settings map without removing its file', () => {
    const registry = new SubAgentRegistry();
    const reviewer = file('reviewer.md', source('reviewer'));
    registry.register([reviewer]);
    const settings = MultiverseConfigSchema.parse({ enabled: true, subagents: { reviewer: { enabled: false } } });
    registry.resolveAvailability(settings);
    expect(registry.availableSubAgents.map(agent => agent.name)).toEqual([]);
    expect(registry.getSubAgent('reviewer')?.enabled).toBe(false);
    expect(existsSync(reviewer)).toBe(true);
  });
});
