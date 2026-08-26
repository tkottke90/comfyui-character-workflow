import { z } from 'zod';
import { PromptAdapterSchema } from './prompt-adapter.schema';

export const CharacterStatusSchema = z.enum([
  'draft',
  'casting',
  'locked',
  'kit-complete',
  'lora-trained',
]);
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>;

export const AttributesSchema = z.object({
  sex: z.string().default(''),
  apparent_age: z.string().default(''),
  ethnicity: z.string().default(''),
  skin_tone: z.string().default(''),
  face_shape: z.string().default(''),
  eyes: z.string().default(''),
  eyebrows: z.string().default(''),
  hair: z.string().default(''),
  nose: z.string().default(''),
  lips: z.string().default(''),
  build: z.string().default(''),
  height_impression: z.string().default(''),
  base_clothing: z.string().default(''),
});
export type Attributes = z.infer<typeof AttributesSchema>;

export const DistinguishingFeatureSchema = z.object({
  text: z.string(),
  size: z.enum(['easy', 'medium', 'hard']).default('medium'),
});
export type DistinguishingFeature = z.infer<typeof DistinguishingFeatureSchema>;

export const CastingCandidateSchema = z.object({
  seed: z.number(),
  note: z.string().default(''),
  createdAt: z.string(),
  imagePath: z.string().default(''),
});
export type CastingCandidate = z.infer<typeof CastingCandidateSchema>;

export const AuditRowSchema = z.object({
  attribute: z.string(),
  specValue: z.string(),
  imageValue: z.string(),
  ok: z.boolean().default(true),
});
export type AuditRow = z.infer<typeof AuditRowSchema>;

export const RefinementSchema = z.object({
  currentStep: z.number().min(1).max(3).default(1),
  faceDetailDenoise: z.number().default(0.4),
  cleanupDenoise: z.number().default(0.35),
  upscaleTarget: z.number().default(2048),
});
export type Refinement = z.infer<typeof RefinementSchema>;

export const FaceCropSchema = z.object({
  path: z.string().default(''),
  confirmed: z.boolean().default(false),
});
export type FaceCrop = z.infer<typeof FaceCropSchema>;

export const ViewSchema = z.object({
  key: z.string(),
  label: z.string(),
  changeClause: z.string().default(''),
  reorient: z.boolean().default(true),
  status: z.enum(['pending', 'generating', 'done']).default('pending'),
  seed: z.number().nullable().default(null),
  imagePath: z.string().default(''),
  rating: z.number().min(0).max(3).default(0),
});
export type View = z.infer<typeof ViewSchema>;

export const PolishSchema = z.object({
  viewKey: z.string(),
  denoise: z.number().default(0.21),
  eyesChecked: z.boolean().default(false),
  accepted: z.boolean().default(false),
  fixMode: z.enum(['remove', 'add']).default('remove'),
  fixDescription: z.string().default(''),
  brushSize: z.number().default(14),
  fixApplied: z.boolean().default(false),
});
export type Polish = z.infer<typeof PolishSchema>;

export const ImageAssetSchema = z.object({
  label: z.string(),
  path: z.string().default(''),
  maskPath: z.string().default(''),
  notes: z.string().default(''),
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;

export const ValidationTestSchema = z.object({
  status: z.enum(['not-run', 'pass', 'fail']).default('not-run'),
  note: z.string().default(''),
});
export type ValidationTest = z.infer<typeof ValidationTestSchema>;

export const DownstreamValidationSchema = z.object({
  newPose: ValidationTestSchema.default(() => ValidationTestSchema.parse({})),
  newOutfit: ValidationTestSchema.default(() => ValidationTestSchema.parse({})),
  noTemplateProportions: ValidationTestSchema.default(() => ValidationTestSchema.parse({})),
});
export type DownstreamValidation = z.infer<typeof DownstreamValidationSchema>;

export const DatasetSchema = z.object({
  imagesCount: z.number().default(0),
  targetMin: z.number().default(20),
  targetMax: z.number().default(40),
  notes: z.string().default(''),
});
export type Dataset = z.infer<typeof DatasetSchema>;

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  title: z.string(),
  observed: z.string().default(''),
  change: z.string().default(''),
  result: z.string().default(''),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const CharacterSchema = z.object({
  name: z.string().min(1),
  status: CharacterStatusSchema.default('draft'),
  created: z.string(),
  updated: z.string(),

  style: z.string().default('photorealistic'),
  checkpoint: z.string().default('RealVisXL_V5.0'),
  sampler: z.string().default('dpmpp_2m'),
  scheduler: z.string().default('karras'),
  steps: z.number().default(28),
  cfg: z.number().default(5),
  styleSourceName: z.string().default(''),
  resolution: z.string().default('832x1216'),
  body_template: z.string().default(''),
  cn_strength: z.number().default(0.5),
  cn_end: z.number().default(0.55),

  trigger_token: z.string().default(''),
  deployment_domain: z.string().default(''),
  edit_model: z.string().default(''),
  rotation_model: z.string().default(''),

  faceid_weight: z.number().default(0.75),
  faceid_weight_v2: z.number().default(1.5),

  locked_seed: z.number().nullable().default(null),
  locked_prompt_hash: z.string().nullable().default(null),

  useNameAsToken: z.boolean().default(false),

  attributes: AttributesSchema.default(() => AttributesSchema.parse({})),
  distinguishingFeatures: z.array(DistinguishingFeatureSchema).default(() => []),

  identityBlock: z.string().default(''),
  identityBlockFrozen: z.boolean().default(false),
  negativePrompt: z.string().default(''),
  promptAdapter: PromptAdapterSchema.default(() => PromptAdapterSchema.parse({})),

  checklist: z.record(z.string(), z.boolean()).default(() => ({})),

  castingCandidates: z.array(CastingCandidateSchema).default(() => []),
  winnerCandidateSeed: z.number().nullable().default(null),
  auditRows: z.array(AuditRowSchema).default(() => []),

  refinement: RefinementSchema.default(() => RefinementSchema.parse({})),
  faceCrop: FaceCropSchema.default(() => FaceCropSchema.parse({})),
  views: z.array(ViewSchema).default(() => []),
  polish: z.array(PolishSchema).default(() => []),
  images: z.array(ImageAssetSchema).default(() => []),

  downstreamValidation: DownstreamValidationSchema.default(() =>
    DownstreamValidationSchema.parse({}),
  ),
  dataset: DatasetSchema.default(() => DatasetSchema.parse({})),

  log: z.array(LogEntrySchema).default(() => []),
});
export type Character = z.infer<typeof CharacterSchema>;

export interface CharacterRecord extends Character {
  slug: string;
}
