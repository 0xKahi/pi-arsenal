import { z } from 'zod';
import { ModelConfigSchema } from './shared-config.schema';

const SubagentModelConfigSchema = ModelConfigSchema.partial().strict();

const PresetModelConfigSchema = SubagentModelConfigSchema.extend({
  provider: z.string().optional().describe('Optional provider override; omitted values inherit from the subagent model or parent session.'),
  modelId: z.string().optional().describe('Optional model ID override; omitted values inherit from the subagent model or parent session.'),
  reasoning: ModelConfigSchema.shape.reasoning
    .optional()
    .describe('Optional requested reasoning override; omitted values inherit from the subagent model or parent session.'),
}).strict();

const prefixRecordKeys = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key === '' ? '' : `.${key}`, entry]));
};

const unprefixRecordKeys = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([key, entry]) => [key.slice(1), entry]));

// Zod records assign parsed keys onto ordinary objects. Prefixing avoids prototype-key
// collisions while parsing, then Object.fromEntries restores safe own properties.
const PresetAgentsSchema = z.preprocess(prefixRecordKeys, z.record(z.string().min(1), PresetModelConfigSchema)).transform(unprefixRecordKeys);

const PresetsSchema = z
  .preprocess(prefixRecordKeys, z.record(z.string().min(1), PresetAgentsSchema))
  .transform(unprefixRecordKeys)
  .optional()
  .describe('Named model lineup overrides by preset and agent. Entries may omit fields to inherit subagent and parent-session values.');

const SubagentSettingsSchema = z.strictObject({
  enabled: z.boolean().default(true).describe('Whether this registered subagent can be created or continued.'),
  model: SubagentModelConfigSchema.optional().describe('Optional preferred model; the parent model is used when omitted.'),
});

const SubagentSettingsPartialSchema = z.strictObject({
  enabled: z.boolean().optional(),
  model: SubagentModelConfigSchema.optional(),
});

const SubagentsSchema = z.record(z.string().min(1), SubagentSettingsSchema);
const SubagentsPartialSchema = z.record(z.string().min(1), SubagentSettingsPartialSchema);

export const MultiverseConfigSchema = z.strictObject({
  enabled: z.boolean().default(false).describe('Enable Multiverse orchestration and child persona/tool behavior.'),
  defaultAgent: z.enum(['default', 'megamind']).default('default').describe('Initial parent persona when no saved selection exists.'),
  maxConcurrency: z.number().int().min(1).max(10).default(5).describe('Maximum child interactions running concurrently in one batch.'),
  defaultPreset: z.string().optional().describe('Initial named model preset when it exists; missing or unknown names use the built-in default.'),
  presets: PresetsSchema,
  subagents: SubagentsSchema.default({
    explorer: { enabled: true },
    fixer: { enabled: true },
    visualizer: { enabled: true },
  }).describe('Settings by registered subagent name; unspecified agents default to enabled. Settings alone do not register agents.'),
});

export type MultiverseConfig = z.infer<typeof MultiverseConfigSchema>;

/** Partial form used for global/project layering without applying defaults early. */
export const MultiverseConfigPartialSchema = z.strictObject({
  enabled: z.boolean().optional(),
  defaultAgent: z.enum(['default', 'megamind']).optional(),
  maxConcurrency: z.number().int().min(1).max(10).optional(),
  defaultPreset: z.string().optional(),
  presets: PresetsSchema,
  subagents: SubagentsPartialSchema.optional(),
});

export type MultiverseConfigPartial = z.infer<typeof MultiverseConfigPartialSchema>;
