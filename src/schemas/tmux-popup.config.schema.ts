import { z } from 'zod';

export const TmuxPopupConfigSchema = z.object({
  enabled: z.boolean().default(false),
  width: z.number().min(10).max(100).default(50),
  height: z.number().min(10).max(100).default(50),
  fileCommand: z.string().default('nvim'),
});
