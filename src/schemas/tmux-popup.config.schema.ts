import { z } from 'zod';

const boundWidth = z.number().min(10).max(100);
const boundHeight = z.number().min(10).max(100);

export const TmuxPopupConfigSchema = z.object({
  enabled: z.boolean().default(false),
  width: boundWidth.default(50),
  height: boundHeight.default(50),
  fileCommand: z.string().default('nvim'),
});

export type TmuxPopupConfig = z.infer<typeof TmuxPopupConfigSchema>;

/**
 * Partial schema used for validating global and trusted project overrides.
 * Bounds are preserved so invalid overrides still fail validation, but defaults
 * are omitted so missing fields do not clobber previously merged values.
 */
export const TmuxPopupConfigPartialSchema = z.object({
  enabled: z.boolean().optional(),
  width: boundWidth.optional(),
  height: boundHeight.optional(),
  fileCommand: z.string().optional(),
});

export type TmuxPopupConfigPartial = z.infer<typeof TmuxPopupConfigPartialSchema>;
