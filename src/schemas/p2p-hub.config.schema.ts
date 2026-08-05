import { z } from 'zod';

export const P2pHubConfigSchema = z.object({
  enabled: z.boolean().default(false),
});

export type P2pHubConfig = z.infer<typeof P2pHubConfigSchema>;

/**
 * Partial schema used for validating global and trusted project overrides.
 * Defaults are omitted so missing fields do not clobber previously merged values.
 */
export const P2pHubConfigPartialSchema = z.object({
  enabled: z.boolean().optional(),
});

export type P2pHubConfigPartial = z.infer<typeof P2pHubConfigPartialSchema>;
