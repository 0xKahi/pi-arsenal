import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, Skill } from '@earendil-works/pi-coding-agent';
import { filterSkillsByName, getAvailableSkillNames } from '../../../../src/extensions/multiverse/agents/skill-policy.ts';
import { createChildResourcePolicy } from '../../../../src/extensions/multiverse/runtime/child-resource-policy.ts';

const skill = (name: string) => ({ name }) as Skill;

describe('Multiverse skill policy', () => {
  it('filters ambient SDK skills to the declared subset', () => {
    expect(filterSkillsByName([skill('search'), skill('pdf'), skill('review')], ['pdf']).map(item => item.name)).toEqual(['pdf']);
    expect(filterSkillsByName([skill('search')], [])).toEqual([]);

    const policy = createChildResourcePolicy({
      name: 'explorer',
      tools: ['read'],
      skills: ['pdf'],
      prompt: 'child prompt',
      filePath: '/tmp/explorer.md',
    });
    const filtered = policy.skillsOverride?.({ skills: [skill('search'), skill('pdf')], diagnostics: [] });
    expect(filtered?.skills.map(item => item.name)).toEqual(['pdf']);
    expect(policy.systemPromptOverride?.('host prompt')).toBe('child prompt');
    expect(policy.appendSystemPromptOverride?.(['project', 'cli'])).toEqual([]);
    expect(policy.noContextFiles).toBe(true);
  });

  it('discovers only skill commands', () => {
    const pi = {
      getCommands: () => [
        { name: 'help', source: 'extension' },
        { name: 'skill:search', source: 'skill' },
        { name: 'skill:pdf', source: 'skill' },
      ],
    } as unknown as Pick<ExtensionAPI, 'getCommands'>;

    expect(getAvailableSkillNames(pi)).toEqual(['search', 'pdf']);
  });
});
