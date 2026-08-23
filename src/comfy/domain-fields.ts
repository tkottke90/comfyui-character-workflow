export interface DomainField {
  path: string;
  label: string;
  kind: 'character' | 'stage-input';
}

/**
 * Curated, intentionally minimal catalog of mappable "Domain field" sources for the
 * workflow mapping editor. This is not an exhaustive dump of every CharacterSchema
 * field — it only needs to grow as new workflow slots actually get mapped. Extend it
 * when a mapping needs a source that isn't listed yet.
 */
export const DOMAIN_FIELDS: DomainField[] = [
  { path: 'uploaded_image.hero', label: 'Hero image (uploaded/current)', kind: 'stage-input' },
  { path: 'stage_input.horizontal_angle', label: 'Horizontal angle', kind: 'stage-input' },
  { path: 'stage_input.vertical_angle', label: 'Vertical angle', kind: 'stage-input' },
  { path: 'stage_input.zoom', label: 'Zoom', kind: 'stage-input' },
  {
    path: 'stage_input.use_multiangle_lora',
    label: 'Use multi-angle LoRA',
    kind: 'stage-input',
  },
  { path: 'character.faceCrop.path', label: 'Character: face crop image', kind: 'character' },
  { path: 'character.images', label: 'Character: labeled image (by label)', kind: 'character' },
  { path: 'character.locked_seed', label: 'Character: locked seed', kind: 'character' },
  {
    path: 'character.identityBlockFrozen',
    label: 'Character: frozen identity block',
    kind: 'character',
  },
  { path: 'character.negativePrompt', label: 'Character: negative prompt', kind: 'character' },
];
