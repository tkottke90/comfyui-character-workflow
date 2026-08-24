import { LoggerConfigSchema } from '@tkottke90/logger';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const ComfyUiConfigSchema = z.object({
  baseUrl: z.string().default('localhost:40000'),
  apiKey: z.string().default(''),
  clientId: z.string().default(() => `anchor-${randomUUID().slice(0, 8)}`)
});
export type ComfyUiConfig = z.infer<typeof ComfyUiConfigSchema>;

export const CharacterAttributesConfigSchema = z.record(z.string(), z.array(z.string())).default({});
export type CharacterAttributesConfig = z.infer<typeof CharacterAttributesConfigSchema>;

export const ConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  logging: LoggerConfigSchema.default({
    level: 'info',
    console: {
      enabled: true
    }
  }),
  'comfy-ui': ComfyUiConfigSchema.default(() => ComfyUiConfigSchema.parse({})),
  'character-attributes': CharacterAttributesConfigSchema
});
