import { z } from 'zod';

export const P2pCouncilConfigSchema = z.object({
  enabled: z.boolean().default(false),
  layout: z.enum(['inline', 'overlay']).default('inline'),
});

export type P2pCouncilConfig = z.infer<typeof P2pCouncilConfigSchema>;

/**
 * Partial schema used for validating global and trusted project overrides.
 * Defaults are omitted so missing fields do not clobber previously merged values.
 */
export const P2pCouncilConfigPartialSchema = z.object({
  enabled: z.boolean().optional(),
  layout: z.enum(['inline', 'overlay']).optional(),
});

export type P2pCouncilConfigPartial = z.infer<typeof P2pCouncilConfigPartialSchema>;
