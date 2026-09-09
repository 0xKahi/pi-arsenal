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

// Zod skips `__proto__` keys while parsing records, so such a preset or agent name is
// dropped rather than polluting a prototype. Every other name, including `constructor`,
// round-trips as an ordinary own property; readers still use own-key-safe lookups.
const PresetAgentsSchema = z.record(z.string().min(1), PresetModelConfigSchema);

const PresetsSchema = z
  .record(z.string().min(1), PresetAgentsSchema)
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
