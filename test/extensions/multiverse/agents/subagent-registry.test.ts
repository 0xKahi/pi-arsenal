import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(errors[0]).toContain('duplicate subagent');
    expect(errors[1]).toContain('invalid.md');
    expect(errors[2]).toContain('missing.md');
    expect(registry.getSubAgent('researcher')?.agent.prompt).toBe('initial');
  });
});
