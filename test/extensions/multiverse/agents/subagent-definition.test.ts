import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BUNDLED_SUBAGENT_PROMPTS_DIRECTORY, loadSubagentDefinitions } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';

const definition = (name: string, options: { tools?: string[]; skills?: string[]; body?: string } = {}) => `---
name: ${name}
tools: ${JSON.stringify(options.tools ?? ['read'])}
skills: ${JSON.stringify(options.skills ?? [])}
---
${options.body ?? `${name} prompt`}
`;

describe('bundled Multiverse definitions', () => {
  it('ships the maintainer-supplied three-agent roster with empty skill lists', () => {
    const result = loadSubagentDefinitions({
      directory: BUNDLED_SUBAGENT_PROMPTS_DIRECTORY,
      availableTools: ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'],
      availableSkills: [],
    });

    expect(result.errors).toEqual([]);
    expect([...result.definitions.keys()]).toEqual(['explorer', 'fixer', 'visualizer']);
    expect(result.definitions.get('explorer')?.tools).toEqual(['read', 'grep', 'find', 'ls', 'bash']);
    expect(result.definitions.get('fixer')?.tools).toEqual(['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']);
    expect(result.definitions.get('visualizer')?.tools).toEqual(['read', 'grep', 'ls', 'find', 'bash']);
    for (const definition of result.definitions.values()) expect(definition.skills).toEqual([]);
    expect(result.definitions.get('visualizer')?.prompt.endsWith('`;')).toBe(false);
  });
});

describe('loadSubagentDefinitions', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-subagents-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const write = (name: string, content: string) => writeFileSync(path.join(directory, name), content);
  const load = () =>
    loadSubagentDefinitions({
      directory,
      availableTools: ['read', 'edit'],
      availableSkills: ['search'],
    });

  it('loads the three valid bundled definitions', () => {
    write('explorer.md', definition('explorer', { tools: ['read'], skills: ['search'], body: 'Explore carefully.' }));
    write('fixer.md', definition('fixer', { tools: ['read', 'edit'], body: 'Fix narrowly.' }));
    write('visualizer.md', definition('visualizer', { tools: ['read'], body: 'Inspect visuals.' }));

    const result = load();

    expect(result.errors).toEqual([]);
    expect([...result.definitions.keys()]).toEqual(['explorer', 'fixer', 'visualizer']);
    expect(result.definitions.get('explorer')).toMatchObject({
      name: 'explorer',
      tools: ['read'],
      skills: ['search'],
      prompt: 'Explore carefully.',
    });
  });

  it('identifies malformed frontmatter by file', () => {
    write('explorer.md', '---\nname: [broken\n---\nprompt');
    write('fixer.md', definition('fixer'));

    const result = load();

    expect(result.definitions.has('explorer')).toBe(false);
    expect(result.errors.join('\n')).toContain('explorer.md');
    expect(result.errors.join('\n')).toContain('frontmatter');
  });

  it('rejects a declared name that does not match its filename', () => {
    write('explorer.md', definition('fixer'));
    write('fixer.md', definition('fixer'));

    const result = load();

    expect(result.errors.join('\n')).toContain('does not match filename "explorer"');
  });

  it('rejects missing required fields', () => {
    write('explorer.md', '---\nname: explorer\ntools: [read]\n---\nprompt');
    write('fixer.md', definition('fixer'));

    const result = load();

    expect(result.errors.join('\n')).toContain('explorer.md');
    expect(result.errors.join('\n')).toContain('skills');
  });

  it('rejects unknown tools and skills', () => {
    write('explorer.md', definition('explorer', { tools: ['bash'], skills: ['missing'] }));
    write('fixer.md', definition('fixer'));

    const result = load();

    expect(result.errors.join('\n')).toContain('tool:bash');
    expect(result.errors.join('\n')).toContain('skill:missing');
  });

  it('rejects an empty prompt body', () => {
    write('explorer.md', definition('explorer', { body: '   ' }));
    write('fixer.md', definition('fixer'));

    const result = load();

    expect(result.errors.join('\n')).toContain('explorer.md');
    expect(result.errors.join('\n')).toContain('must not be empty');
  });

  it('reports missing and unsupported definition files', () => {
    write('custom.md', definition('custom'));
    write('fixer.md', definition('fixer'));

    const result = load();

    expect(result.errors.join('\n')).toContain('custom.md');
    expect(result.errors.join('\n')).toContain('unsupported bundled subagent');
    expect(result.errors.join('\n')).toContain('explorer.md');
    expect(result.errors.join('\n')).toContain('definition is missing');
  });
});
