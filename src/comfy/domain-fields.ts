export interface DomainField {
  path: string;
  label: string;
  kind: 'character' | 'stage-input';
}

/**
 * Mappable "Domain field" sources for the workflow mapping editor.
 *
 * The "character.*" entries mirror the scalar fields captured in a character's
 * markdown frontmatter (see CharacterSchema in src/schemas/character.schema.ts) —
 * this is how a mapping keeps things like checkpoint/sampler/scheduler or the
 * character's name consistent across every workflow run for that character,
 * instead of being re-typed as a static value per mapping.
 *
 * Deliberately excluded: fields that are lists of records rather than a single
 * value (castingCandidates, auditRows, views, polish, log, downstreamValidation,
 * dataset, distinguishingFeatures, checklist) — mapping into one of those would
 * need a way to pick which entry, which the mapping model doesn't support yet.
 * "stage-input" entries stay separate since they're supplied per-invocation
 * (e.g. a rotation angle), not stored on the character at all.
 */
export const DOMAIN_FIELDS: DomainField[] = [
  // Stage inputs — supplied at invocation time, not stored on the character.
  { path: 'uploaded_image.hero', label: 'Hero image (uploaded/current)', kind: 'stage-input' },
  { path: 'stage_input.horizontal_angle', label: 'Horizontal angle', kind: 'stage-input' },
  { path: 'stage_input.vertical_angle', label: 'Vertical angle', kind: 'stage-input' },
  { path: 'stage_input.zoom', label: 'Zoom', kind: 'stage-input' },
  {
    path: 'stage_input.use_multiangle_lora',
    label: 'Use multi-angle LoRA',
    kind: 'stage-input',
  },

  // Identity / naming
  { path: 'character.name', label: 'Character: name', kind: 'character' },
  {
    path: 'character.useNameAsToken',
    label: 'Character: use name as token',
    kind: 'character',
  },
  { path: 'character.trigger_token', label: 'Character: trigger token', kind: 'character' },
  { path: 'character.identityBlock', label: 'Character: identity block', kind: 'character' },
  {
    path: 'character.identityBlockFrozen',
    label: 'Character: frozen identity block',
    kind: 'character',
  },
  { path: 'character.negativePrompt', label: 'Character: negative prompt', kind: 'character' },

  // Generation settings — the "same values across workflows" fields.
  { path: 'character.style', label: 'Character: style', kind: 'character' },
  { path: 'character.checkpoint', label: 'Character: checkpoint', kind: 'character' },
  { path: 'character.sampler', label: 'Character: sampler', kind: 'character' },
  { path: 'character.scheduler', label: 'Character: scheduler', kind: 'character' },
  { path: 'character.steps', label: 'Character: steps', kind: 'character' },
  { path: 'character.cfg', label: 'Character: cfg', kind: 'character' },
  { path: 'character.resolution', label: 'Character: resolution', kind: 'character' },
  { path: 'character.body_template', label: 'Character: body template', kind: 'character' },
  { path: 'character.cn_strength', label: 'Character: ControlNet strength', kind: 'character' },
  { path: 'character.cn_end', label: 'Character: ControlNet end', kind: 'character' },
  { path: 'character.deployment_domain', label: 'Character: deployment domain', kind: 'character' },
  { path: 'character.edit_model', label: 'Character: edit model', kind: 'character' },
  { path: 'character.rotation_model', label: 'Character: rotation model', kind: 'character' },
  { path: 'character.faceid_weight', label: 'Character: FaceID weight', kind: 'character' },
  { path: 'character.faceid_weight_v2', label: 'Character: FaceID weight (v2)', kind: 'character' },

  // Locked casting result
  { path: 'character.locked_seed', label: 'Character: locked seed', kind: 'character' },
  {
    path: 'character.locked_prompt_hash',
    label: 'Character: locked prompt hash',
    kind: 'character',
  },

  // Refinement settings
  {
    path: 'character.refinement.faceDetailDenoise',
    label: 'Character: face detail denoise',
    kind: 'character',
  },
  {
    path: 'character.refinement.cleanupDenoise',
    label: 'Character: cleanup denoise',
    kind: 'character',
  },
  {
    path: 'character.refinement.upscaleTarget',
    label: 'Character: upscale target',
    kind: 'character',
  },

  // Anchor kit / images
  { path: 'character.faceCrop.path', label: 'Character: face crop image', kind: 'character' },
  { path: 'character.images', label: 'Character: labeled image (by label)', kind: 'character' },

  // Spec attributes
  { path: 'character.attributes.sex', label: 'Character attribute: sex', kind: 'character' },
  {
    path: 'character.attributes.apparent_age',
    label: 'Character attribute: apparent age',
    kind: 'character',
  },
  {
    path: 'character.attributes.ethnicity',
    label: 'Character attribute: ethnicity',
    kind: 'character',
  },
  {
    path: 'character.attributes.skin_tone',
    label: 'Character attribute: skin tone',
    kind: 'character',
  },
  {
    path: 'character.attributes.face_shape',
    label: 'Character attribute: face shape',
    kind: 'character',
  },
  { path: 'character.attributes.eyes', label: 'Character attribute: eyes', kind: 'character' },
  {
    path: 'character.attributes.eyebrows',
    label: 'Character attribute: eyebrows',
    kind: 'character',
  },
  { path: 'character.attributes.hair', label: 'Character attribute: hair', kind: 'character' },
  { path: 'character.attributes.nose', label: 'Character attribute: nose', kind: 'character' },
  { path: 'character.attributes.lips', label: 'Character attribute: lips', kind: 'character' },
  { path: 'character.attributes.build', label: 'Character attribute: build', kind: 'character' },
  {
    path: 'character.attributes.height_impression',
    label: 'Character attribute: height impression',
    kind: 'character',
  },
  {
    path: 'character.attributes.base_clothing',
    label: 'Character attribute: base clothing',
    kind: 'character',
  },
];
