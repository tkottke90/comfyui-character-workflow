import type { PromptAdapterPreset } from '../schemas/prompt-adapter.schema';

/**
 * Built-in Prompt Adapter presets, keyed by id, seeded into `config.yaml`'s
 * `prompt-adapter-presets` section on first boot (see `ConfigSchema`). From then on the
 * config file is authoritative — these are only the shipped starting point, not a
 * baseline merged back in on every read. Where a family's negative-prompt convention is
 * genuinely under-documented (qwen, wan), the preset defaults to a harmless no-op
 * (`negativeMode: 'template'`, empty tags) rather than asserting unverified behavior.
 */
export const DEFAULT_PROMPT_ADAPTER_PRESETS: Record<string, PromptAdapterPreset> = {
  sd15: {
    label: 'SD 1.5 (tags)',
    leadTags: '',
    qualityTagsPositive: 'masterpiece, best quality',
    negativeMode: 'template',
    qualityTagsNegative:
      'lowres, bad anatomy, bad hands, missing fingers, extra digit, worst quality, low quality, jpeg artifacts, signature, watermark, blurry',
  },
  sdxl: {
    label: 'SDXL (base)',
    leadTags: '',
    qualityTagsPositive: '',
    negativeMode: 'template',
    qualityTagsNegative: 'worst quality, low quality, blurry, watermark, text',
  },
  illustrious: {
    label: 'Illustrious / NoobAI (Danbooru tags)',
    leadTags: '1girl',
    qualityTagsPositive: 'masterpiece, best quality, amazing quality',
    negativeMode: 'template',
    qualityTagsNegative:
      'worst quality, low quality, bad anatomy, extra digits, jpeg artifacts, signature, watermark',
  },
  pony: {
    label: 'Pony Diffusion (score tags)',
    leadTags: 'score_9, score_8_up, score_7_up, score_6_up, source_anime',
    qualityTagsPositive: '',
    negativeMode: 'template',
    qualityTagsNegative: 'score_4, score_5, score_6, worst quality, low quality',
  },
  flux: {
    label: 'Flux (natural language, no negative)',
    leadTags: '',
    qualityTagsPositive: '',
    negativeMode: 'suppressed',
    qualityTagsNegative: '',
  },
  qwen: {
    label: 'Qwen-Image (natural language)',
    leadTags: '',
    qualityTagsPositive: '',
    negativeMode: 'template',
    qualityTagsNegative: '',
  },
  wan: {
    label: 'Wan (video, natural language)',
    leadTags: '',
    qualityTagsPositive: '',
    negativeMode: 'template',
    qualityTagsNegative: '',
  },
  custom: {
    label: 'Custom (blank)',
    leadTags: '',
    qualityTagsPositive: '',
    negativeMode: 'template',
    qualityTagsNegative: '',
  },
};
