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
  prompt: `${name} prompt body`,
  filePath: `/${name}.md`,
});

describe('buildMegamindPrompt', () => {
  it('assembles the fixture introduction with one section per roster member', () => {
    const roster = new Map<BundledSubagentName, SubagentDefinition>([
      ['explorer', definition('explorer')],
      ['fixer', definition('fixer')],
    ]);
    const prompt = buildMegamindPrompt({ intro: 'fixture intro', roster });

    expect(prompt).toStartWith('fixture intro');
    expect(prompt).toContain('### explorer\nTools: read\n\nexplorer prompt body');
    expect(prompt).toContain('### fixer\nTools: read\n\nfixer prompt body');
    expect(prompt.indexOf('### explorer')).toBeLessThan(prompt.indexOf('### fixer'));
  });

  it('returns empty while the introduction is unapproved', () => {
    expect(buildMegamindPrompt({ intro: '', roster: new Map() })).toBe('');
    expect(buildMegamindPrompt({ intro: '   ', roster: new Map([['explorer', definition('explorer')]]) })).toBe('');
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
      writeFileSync(path.join(directory, `${name}.md`), `---\nname: ${name}\ntools: ["read"]\nskills: []\n---\n${name} live prompt\n`);
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
    expect(result.prompt).toContain('### explorer');
    expect(result.prompt).toContain('### visualizer');
    expect(result.prompt).not.toContain('### fixer');
    expect(result.prompt).not.toContain('fixer live prompt');
  });
});
