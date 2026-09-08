import { describe, expect, it } from 'bun:test';
import type { SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { buildMegamindPrompt } from '../../../../src/extensions/multiverse/orchestrator/orchestrator-prompts/megamind.ts';

const definition = (name: string): SubagentDefinition => ({
  name,
  tools: ['read'],
  skills: [],
  metadata: [`Lane: ${name} lane`],
  prompt: `${name} child-only prompt`,
  filePath: `/${name}.md`,
});

describe('buildMegamindPrompt', () => {
  it('assembles approved sections around arbitrary roster names and their metadata', () => {
    const prompt = buildMegamindPrompt([definition('researcher'), definition('reviewer')], 3);
    expect(prompt).toStartWith('<Role>');
    expect(prompt).toContain('@researcher\n- Lane: researcher lane');
    expect(prompt.indexOf('@researcher')).toBeLessThan(prompt.indexOf('@reviewer'));
    expect(prompt.indexOf('</Agents>')).toBeLessThan(prompt.indexOf('<Workflow>'));
    expect(prompt).toContain('<SpawnTool>');
    expect(prompt).not.toContain('child-only prompt');
    expect(prompt).not.toContain('- Tools:');
  });
});
