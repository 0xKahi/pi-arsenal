import type { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { filterSkillsByName } from '../agents/skill-policy.ts';
import type { SubagentDefinition } from '../agents/subagent-definition.ts';

type DefaultResourceLoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];

export type ChildResourcePolicy = Pick<
  DefaultResourceLoaderOptions,
  'skillsOverride' | 'systemPromptOverride' | 'appendSystemPromptOverride' | 'noContextFiles'
>;

/** Resource overrides shared by every hydrated SDK child runtime. */
export function createChildResourcePolicy(definition: SubagentDefinition): ChildResourcePolicy {
  return {
    noContextFiles: true,
    systemPromptOverride: () => definition.prompt,
    appendSystemPromptOverride: () => [],
    skillsOverride: base => ({
      skills: filterSkillsByName(base.skills, definition.skills),
      diagnostics: base.diagnostics,
    }),
  };
}
