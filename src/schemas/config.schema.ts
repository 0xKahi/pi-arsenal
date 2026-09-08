import { z } from 'zod';
import { MultiverseConfigPartialSchema, MultiverseConfigSchema } from './multiverse.config.schema';
import { P2pCouncilConfigPartialSchema, P2pCouncilConfigSchema } from './p2p-council.config.schema';
import { TmuxPopupConfigPartialSchema, TmuxPopupConfigSchema } from './tmux-popup.config.schema';

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  tmux_popup: TmuxPopupConfigSchema.default({
    enabled: false,
    width: 50,
    height: 50,
    fileCommand: 'nvim',
  }),
  p2p_council: P2pCouncilConfigSchema.default({
    enabled: false,
    layout: 'inline',
  }),
  multiverse: MultiverseConfigSchema.default({
    enabled: false,
    defaultAgent: 'default',
    maxConcurrency: 5,
    subagents: {
      explorer: { enabled: true },
      fixer: { enabled: true },
      visualizer: { enabled: true },
    },
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
  p2p_council: P2pCouncilConfigPartialSchema.optional(),
  multiverse: MultiverseConfigPartialSchema.optional(),
});

export type ConfigPartial = z.infer<typeof ConfigPartialSchema>;
