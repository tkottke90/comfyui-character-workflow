import { z } from 'zod';

export const ConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost')
});
