import type { MultiverseConfig } from '../../../schemas/multiverse.config.schema.ts';
import type { BundledSubagentName, SubagentDefinition } from '../agents/subagent-definition.ts';
import { loadSubagentDefinitions } from '../agents/subagent-definition.ts';
import { buildMegamindPrompt } from './megamind-prompt.ts';

export interface MegamindEnvironment {
  config: MultiverseConfig;
  definitionsDirectory: string;
  availableTools: Iterable<string>;
  availableSkills: Iterable<string>;
  promptIntro: string;
}

export type MegamindEligibility =
  | { eligible: true; roster: Map<BundledSubagentName, SubagentDefinition>; prompt: string }
  | { eligible: false; reason: string; roster: Map<BundledSubagentName, SubagentDefinition> };

export function resolveMegamindEligibility(environment: MegamindEnvironment): MegamindEligibility {
  if (!environment.config.enabled) return { eligible: false, reason: 'Multiverse is disabled.', roster: new Map() };
  if (!environment.promptIntro.trim()) {
    return { eligible: false, reason: 'The Megamind prompt has not been configured.', roster: new Map() };
  }

  const loaded = loadSubagentDefinitions({
    directory: environment.definitionsDirectory,
    availableTools: environment.availableTools,
    availableSkills: environment.availableSkills,
  });
  const roster = new Map([...loaded.definitions].filter(([name]) => environment.config.subagents[name].enabled));
  if (roster.size === 0) return { eligible: false, reason: 'No enabled valid Multiverse subagent is available.', roster: new Map() };
  return {
    eligible: true,
    roster,
    prompt: buildMegamindPrompt({ intro: environment.promptIntro, roster, maxConcurrency: environment.config.maxConcurrency }),
  };
}
