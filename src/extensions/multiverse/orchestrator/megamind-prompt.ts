import type { BundledSubagentName, SubagentDefinition } from '../agents/subagent-definition.ts';

/**
 * Maintainer-approved Megamind orchestration introduction.
 * Intentionally empty until approved: Megamind stays ineligible while empty,
 * and dynamic roster assembly is tested with fixture introductions instead.
 */
export const MEGAMIND_PROMPT_INTRO = '';

export interface MegamindPromptInput {
  intro: string;
  roster: Map<BundledSubagentName, SubagentDefinition>;
}

/**
 * Assemble the parent Megamind prompt at runtime from the live roster.
 * Returns an empty string while the introduction is unapproved so callers treat Megamind as ineligible.
 */
export function buildMegamindPrompt(input: MegamindPromptInput): string {
  const intro = input.intro.trim();
  if (!intro) return '';

  const sections = [...input.roster.values()].map(
    definition => `### ${definition.name}\nTools: ${definition.tools.join(', ')}\n\n${definition.prompt}`,
  );
  return [intro, ...sections].join('\n\n');
}
