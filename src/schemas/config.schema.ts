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

/** Keyed by phaseBindingKey (see comfy/workflow-registry.ts) — an optional prefix/suffix
 *  auto-wrapped around that phase's positive prompt text (character.identityBlock,
 *  character.identityBlockFrozen, stage_input.custom_positive_prompt) when its graph is
 *  built. Keys with no matching phase binding are simply never looked up. */
export const PhasePromptConfigSchema = z
  .record(z.string(), z.object({ prefix: z.string().default(''), suffix: z.string().default('') }))
  .default({});
export type PhasePromptConfig = z.infer<typeof PhasePromptConfigSchema>;

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
  'character-attributes': CharacterAttributesConfigSchema,
  'phase-prompt': PhasePromptConfigSchema
});
