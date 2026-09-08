import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { discoverSubagentPaths, SUBAGENT_PROMPTS_DIRECTORY } from '../../../../src/extensions/multiverse/agents/subagent-paths.ts';

export const definitionSource = (name: string, tools = ['read'], skills: string[] = [], prompt = `${name} prompt`) =>
  `---\nname: ${name}\ntools: ${JSON.stringify(tools)}\nskills: ${JSON.stringify(skills)}\nmetadata: ["Lane: ${name}"]\n---\n${prompt}\n`;

describe('loadSubagentDefinition', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'arsenal-definition-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const load = (source: string) => {
    const filePath = path.join(directory, 'anything.md');
    writeFileSync(filePath, source);
    return loadSubagentDefinition(filePath);
  };

  it('accepts arbitrary names independent of filenames and runtime capabilities', () => {
    const result = load(definitionSource('researcher', ['read', 'missing'], ['unknown']));
    expect(result).toMatchObject({ status: 'success', data: { name: 'researcher', tools: ['read', 'missing'], skills: ['unknown'] } });
    expect(result.filePath).toBe(path.join(directory, 'anything.md'));
  });

  it('normalizes duplicate tools and skills in first-occurrence order', () => {
    expect(load(definitionSource('agent', ['read', 'bash', 'read'], ['a', 'a', 'b']))).toMatchObject({
      status: 'success',
      data: { tools: ['read', 'bash'], skills: ['a', 'b'] },
    });
  });

  it.each([
    'no frontmatter',
    '---\nname: [broken\n---\nprompt',
    '---\nname: agent\ntools: [read]\n---\nprompt',
    definitionSource('agent', ['read'], [], '  '),
    definitionSource('agent').replace('metadata: ["Lane: agent"]', 'metadata: []'),
    definitionSource('agent').replace('tools: ["read"]', 'tools: read'),
    definitionSource('agent').replace('name: agent', 'name: "   "'),
  ])('rejects invalid structure with a file-specific error: %s', source => {
    const result = load(source);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error).toContain(result.filePath);
  });

  it('reports unreadable files', () => {
    const result = loadSubagentDefinition(path.join(directory, 'missing.md'));
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error).toContain('missing.md');
  });

  it('loads the shipped initial roster with empty skills', () => {
    const discovered = discoverSubagentPaths(SUBAGENT_PROMPTS_DIRECTORY);
    expect(discovered.errors).toEqual([]);
    const results = discovered.paths.map(loadSubagentDefinition);
    expect(results.every(result => result.status === 'success')).toBe(true);
    const definitions = results.flatMap(result => (result.status === 'success' ? [result.data] : []));
    expect(definitions.map(agent => agent.name)).toEqual(['explorer', 'fixer', 'visualizer']);
    for (const agent of definitions) expect(agent.skills).toEqual([]);
    expect(definitions.find(agent => agent.name === 'visualizer')?.prompt.endsWith('`;')).toBe(false);
  });

  it('discovers markdown paths without requiring known filenames', () => {
    writeFileSync(path.join(directory, 'new-agent.md'), definitionSource('custom'));
    writeFileSync(path.join(directory, 'ignored.txt'), 'not a definition');
    expect(discoverSubagentPaths(directory)).toEqual({ paths: [path.join(directory, 'new-agent.md')], errors: [] });
    expect(discoverSubagentPaths(path.join(directory, 'missing')).errors).toHaveLength(1);
  });
});
