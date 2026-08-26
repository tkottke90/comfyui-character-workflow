import { z } from 'zod';

export const PromptAdapterSchema = z.object({
  presetId: z.string().default(''),
  leadTags: z.string().default(''),
  qualityTagsPositive: z.string().default(''),
  negativeMode: z.enum(['template', 'suppressed']).default('template'),
  qualityTagsNegative: z.string().default(''),
});
export type PromptAdapter = z.infer<typeof PromptAdapterSchema>;

export const PromptAdapterPresetSchema = PromptAdapterSchema.omit({ presetId: true }).extend({
  label: z.string().min(1),
});
export type PromptAdapterPreset = z.infer<typeof PromptAdapterPresetSchema>;
