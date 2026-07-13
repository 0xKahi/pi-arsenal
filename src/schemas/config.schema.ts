import { z } from 'zod';
import { TmuxPopupConfigSchema } from './tmux-popup.config.schema';

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  tmux_popup: TmuxPopupConfigSchema.default({
    enabled: false,
    width: 50,
    height: 50,
    fileCommand: 'nvim',
  }),
});
