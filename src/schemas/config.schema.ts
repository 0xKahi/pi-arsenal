import { z } from 'zod';

export const HashlineConfigSchema = z.object({
  enabled: z.boolean().default(false),
});
