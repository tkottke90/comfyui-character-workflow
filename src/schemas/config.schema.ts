import { LoggerConfigSchema } from '@tkottke90/logger';
import { z } from 'zod';

export const ConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  logging: LoggerConfigSchema.default({
    level: 'info',
    console: {
      enabled: true
    }
  })
});
