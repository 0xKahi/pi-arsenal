import { z } from 'zod';
import { P2pHubConfigPartialSchema, P2pHubConfigSchema } from './p2p-hub.config.schema';
import { TmuxPopupConfigPartialSchema, TmuxPopupConfigSchema } from './tmux-popup.config.schema';

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  tmux_popup: TmuxPopupConfigSchema.default({
    enabled: false,
    width: 50,
    height: 50,
    fileCommand: 'nvim',
  }),
  p2p_hub: P2pHubConfigSchema.default({
    enabled: false,
    layout: 'inline',
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Partial schema used for validating global and trusted project overrides.
 * Feature objects are shallow-merged before final validation with ConfigSchema.
 */
export const ConfigPartialSchema = z.object({
  $schema: z.string().optional(),
  tmux_popup: TmuxPopupConfigPartialSchema.optional(),
  p2p_hub: P2pHubConfigPartialSchema.optional(),
});

export type ConfigPartial = z.infer<typeof ConfigPartialSchema>;
