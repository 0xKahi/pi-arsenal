import z from 'zod';
import { COLOR_HEX_REGEX } from '../constants';

export const ReasoningLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export type ReasoningLevel = z.infer<typeof ReasoningLevelSchema>;

export const ModelConfigSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  reasoning: ReasoningLevelSchema,
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const ColorHexSchema = z.string().regex(COLOR_HEX_REGEX, { message: 'Invalid color format. Must be a 7-character hex code (e.g., #RRGGBB).' });
