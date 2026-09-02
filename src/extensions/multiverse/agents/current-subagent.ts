import type { MultiverseConfig } from '../../../schemas/multiverse.config.schema.ts';
import type { BundledSubagentName, SubagentDefinition } from './subagent-definition.ts';
import { loadSubagentDefinitions } from './subagent-definition.ts';

export type CurrentSubagentResult = { success: true; definition: SubagentDefinition } | { success: false; error: string };

export interface CurrentSubagentInput {
  name: BundledSubagentName;
  config: MultiverseConfig;
  definitionsDirectory: string;
  availableTools: Iterable<string>;
  availableSkills: Iterable<string>;
}

/** Resolve from disk on each call so persisted children intentionally adopt rolling definitions. */
export function resolveCurrentSubagent(input: CurrentSubagentInput): CurrentSubagentResult {
  const settings = input.config.subagents[input.name];
  if (!settings.enabled) return { success: false, error: `Subagent "${input.name}" is currently disabled.` };

  const loaded = loadSubagentDefinitions({
    directory: input.definitionsDirectory,
    availableTools: input.availableTools,
    availableSkills: input.availableSkills,
  });
  const definition = loaded.definitions.get(input.name);
  if (definition) return { success: true, definition };

  const relevantErrors = loaded.errors.filter(error => error.includes(`${input.name}.md`));
  return {
    success: false,
    error:
      relevantErrors.length > 0
        ? `Subagent "${input.name}" is unavailable: ${relevantErrors.join('; ')}`
        : `Subagent "${input.name}" is unavailable because its current definition did not load.`,
  };
}
