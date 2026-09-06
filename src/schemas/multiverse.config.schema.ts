import { z } from 'zod';
import { ModelConfigSchema } from './shared-config.schema';

const SubagentModelConfigSchema = ModelConfigSchema.partial().strict();

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
  subagents: SubagentsPartialSchema.optional(),
});

export type MultiverseConfigPartial = z.infer<typeof MultiverseConfigPartialSchema>;
