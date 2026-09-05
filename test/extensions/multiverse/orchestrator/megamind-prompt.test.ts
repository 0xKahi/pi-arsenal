import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BundledSubagentName, SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { resolveMegamindEligibility } from '../../../../src/extensions/multiverse/orchestrator/megamind.ts';
import { buildMegamindPrompt } from '../../../../src/extensions/multiverse/orchestrator/megamind-prompt.ts';
import { MultiverseConfigSchema } from '../../../../src/schemas/multiverse.config.schema.ts';

const definition = (name: string): SubagentDefinition => ({
  name: name as BundledSubagentName,
  tools: ['read'],
  skills: [],
  metadata: [`Lane: ${name} lane`, `**Delegate when:** ${name} delegate case`],
  prompt: `${name} prompt body`,
  filePath: `/${name}.md`,
});

const routingFrontmatter = (name: string): string =>
  [
    '---',
    `name: ${name}`,
    'tools: ["read"]',
    'skills: []',
    'metadata:',
    `  - "Lane: ${name} lane"`,
    '---',
    `${name} live prompt`,
    '',
  ].join('\n');

describe('buildMegamindPrompt', () => {
  it('assembles the fixture introduction with one routing block per roster member', () => {
    const roster = new Map<BundledSubagentName, SubagentDefinition>([
      ['explorer', definition('explorer')],
      ['fixer', definition('fixer')],
    ]);
    const prompt = buildMegamindPrompt({ intro: 'fixture intro', roster, maxConcurrency: 5 });

    expect(prompt).toStartWith('fixture intro');
    expect(prompt).toContain('@explorer\n- Tools: read\n- Lane: explorer lane');
    expect(prompt).toContain('- **Delegate when:** fixer delegate case');
    expect(prompt.indexOf('@explorer')).toBeLessThan(prompt.indexOf('@fixer'));
  });

  it('renders parent-facing metadata rather than the child prompt body', () => {
    const roster = new Map<BundledSubagentName, SubagentDefinition>([['explorer', definition('explorer')]]);
    const prompt = buildMegamindPrompt({ intro: 'fixture intro', roster, maxConcurrency: 5 });

    expect(prompt).not.toContain('explorer prompt body');
  });

  it('states the pool size as mechanism and warns against splitting batches', () => {
    const roster = new Map<BundledSubagentName, SubagentDefinition>([['explorer', definition('explorer')]]);

    expect(buildMegamindPrompt({ intro: 'i', roster, maxConcurrency: 3 })).toContain('runs 3 of them at a time');
    expect(buildMegamindPrompt({ intro: 'i', roster, maxConcurrency: 3 })).toContain('up to 10 tasks');
    expect(buildMegamindPrompt({ intro: 'i', roster, maxConcurrency: 99 })).toContain('runs 10 of them at a time');
    expect(buildMegamindPrompt({ intro: 'i', roster, maxConcurrency: 1 })).toContain('runs 1 of them at a time');
    expect(buildMegamindPrompt({ intro: 'i', roster, maxConcurrency: 3 })).toContain('Do not split a batch');
  });

  it('returns empty while the introduction is unapproved', () => {
    expect(buildMegamindPrompt({ intro: '', roster: new Map(), maxConcurrency: 5 })).toBe('');
    expect(buildMegamindPrompt({ intro: '   ', roster: new Map([['explorer', definition('explorer')]]), maxConcurrency: 5 })).toBe('');
  });
});

describe('resolveMegamindEligibility dynamic roster', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-megamind-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('describes only the enabled valid roster in the assembled prompt', () => {
    for (const name of ['explorer', 'fixer', 'visualizer']) {
      writeFileSync(path.join(directory, `${name}.md`), routingFrontmatter(name));
    }
    const result = resolveMegamindEligibility({
      config: MultiverseConfigSchema.parse({ enabled: true, subagents: { fixer: { enabled: false } } }),
      definitionsDirectory: directory,
      availableTools: ['read'],
      availableSkills: [],
      promptIntro: 'fixture intro',
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect([...result.roster.keys()]).toEqual(['explorer', 'visualizer']);
    expect(result.prompt).toContain('@explorer');
    expect(result.prompt).toContain('@visualizer');
    expect(result.prompt).not.toContain('@fixer');
    expect(result.prompt).not.toContain('fixer live prompt');
  });
});
