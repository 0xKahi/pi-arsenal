import { z } from 'zod';
import { ModelConfigSchema } from './shared-config.schema';

const SubagentModelConfigSchema = ModelConfigSchema.partial().strict();

const SubagentSettingsSchema = z.strictObject({
  enabled: z.boolean().default(true).describe('Whether this bundled subagent can be created or continued.'),
  model: SubagentModelConfigSchema.optional().describe('Optional preferred model; the parent model is used when omitted.'),
});

const SubagentSettingsPartialSchema = z.strictObject({
  enabled: z.boolean().optional(),
  model: SubagentModelConfigSchema.optional(),
});

const SubagentsSchema = z.strictObject({
  explorer: SubagentSettingsSchema.default({ enabled: true }),
  fixer: SubagentSettingsSchema.default({ enabled: true }),
  visualizer: SubagentSettingsSchema.default({ enabled: true }),
});

const SubagentsPartialSchema = z.strictObject({
  explorer: SubagentSettingsPartialSchema.optional(),
  fixer: SubagentSettingsPartialSchema.optional(),
  visualizer: SubagentSettingsPartialSchema.optional(),
});

export const MultiverseConfigSchema = z.strictObject({
  enabled: z.boolean().default(false).describe('Enable Multiverse orchestration for parent sessions.'),
  defaultAgent: z.enum(['default', 'megamind']).default('default').describe('Initial parent persona when no saved selection exists.'),
  maxConcurrency: z.number().int().min(1).max(10).default(5).describe('Maximum child interactions running concurrently in one batch.'),
  subagents: SubagentsSchema.default({
    explorer: { enabled: true },
    fixer: { enabled: true },
    visualizer: { enabled: true },
  }).describe('Settings for the bundled Multiverse subagents.'),
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
