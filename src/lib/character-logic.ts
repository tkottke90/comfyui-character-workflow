import type { AuditRow, Attributes, Character } from '../schemas/character.schema';
import type { StyleRecord } from '../schemas/style.schema';
import {
  CHECKLIST_DEFINITIONS,
  CHECKLIST_PHASES,
  CHECKLIST_PHASE_LABELS,
  ChecklistPhase,
  isPhaseComplete,
} from '../checklist/definitions';

const AUDIT_ATTRIBUTE_LABELS: Array<[keyof Attributes, string]> = [
  ['skin_tone', 'Skin tone'],
  ['face_shape', 'Face shape'],
  ['eyes', 'Eyes'],
  ['eyebrows', 'Eyebrows'],
  ['hair', 'Hair'],
  ['nose', 'Nose'],
  ['lips', 'Lips'],
  ['build', 'Build'],
  ['height_impression', 'Height'],
  ['base_clothing', 'Base clothing'],
];

export const DEFAULT_NEGATIVE_PROMPT =
  'cartoon, illustration, 3d render, cgi, painting, anime, deformed, extra limbs, extra fingers, ' +
  'bad hands, fused fingers, blurry, watermark, text, logo, cropped, out of frame, dramatic lighting, harsh shadows';

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function genderNoun(sex: string): string {
  const normalized = sex.trim().toLowerCase();
  if (normalized === 'male') return 'man';
  if (normalized === 'female') return 'woman';
  return normalized || 'person';
}

export function compileIdentityBlock(
  name: string,
  useNameAsToken: boolean,
  attributes: Attributes,
): string {
  const namedPart = useNameAsToken && name ? ` named ${name}` : '';
  const subject = `photo of a ${[attributes.ethnicity, genderNoun(attributes.sex)].filter(Boolean).join(' ')}${namedPart}`;

  const parts = [
    attributes.apparent_age,
    attributes.skin_tone,
    attributes.face_shape,
    attributes.eyes ? `${attributes.eyes} eyes` : '',
    attributes.eyebrows ? `${attributes.eyebrows} eyebrows` : '',
    attributes.hair,
    attributes.nose,
    attributes.lips ? `${attributes.lips} lips` : '',
    attributes.build,
    attributes.height_impression ? `${attributes.height_impression} height` : '',
    attributes.base_clothing,
  ].filter((part) => part && part.trim().length > 0);

  return [subject, ...parts].join(', ').toLowerCase();
}

export interface NextAction {
  phase: ChecklistPhase;
  label: string;
  path: string;
}

const PHASE_CTA: Record<ChecklistPhase, { label: string; path: (slug: string) => string }> = {
  specification: { label: 'Continue Spec Builder', path: (slug) => `/characters/${slug}/spec` },
  preflight: {
    label: 'Continue Casting Pre-flight',
    path: (slug) => `/characters/${slug}/casting/preflight`,
  },
  casting: { label: 'Continue Casting Batch', path: (slug) => `/characters/${slug}/casting/batch` },
  refinement: { label: 'Continue Refinement', path: (slug) => `/characters/${slug}/refinement` },
  anchorKit: { label: 'Continue Anchor Kit', path: (slug) => `/characters/${slug}/kit` },
  downstreamValidation: {
    label: 'Continue Downstream Validation',
    path: (slug) => `/characters/${slug}/validation`,
  },
  dataset: { label: 'Continue Dataset Tracking', path: (slug) => `/characters/${slug}/dataset` },
};

export function getNextAction(slug: string, checklist: Record<string, boolean>): NextAction | null {
  for (const phase of CHECKLIST_PHASES) {
    if (!isPhaseComplete(phase, checklist)) {
      const cta = PHASE_CTA[phase];
      return { phase, label: `${cta.label} →`, path: cta.path(slug) };
    }
  }
  return null;
}

export function overviewChecklistRows(
  checklist: Record<string, boolean>,
): Array<{ phase: ChecklistPhase; label: string; complete: boolean }> {
  return CHECKLIST_PHASES.map((phase) => ({
    phase,
    label: CHECKLIST_PHASE_LABELS[phase],
    complete: isPhaseComplete(phase, checklist),
  }));
}

export function deriveStatus(checklist: Record<string, boolean>): Character['status'] {
  if (isPhaseComplete('dataset', checklist)) return 'lora-trained';
  if (isPhaseComplete('anchorKit', checklist) && isPhaseComplete('downstreamValidation', checklist))
    return 'kit-complete';
  if (isPhaseComplete('casting', checklist)) return 'locked';
  if (isPhaseComplete('preflight', checklist)) return 'casting';
  return 'draft';
}

function hasDoneView(character: Pick<Character, 'views'>, key: string): boolean {
  return character.views.some((view) => view.key === key && view.status === 'done');
}

/**
 * Overlays mechanically-derivable checklist items (things the app already
 * knows the answer to) on top of the stored checklist, so those boxes are
 * never manually re-ticked and can never silently drift from real state.
 */
export function deriveChecklist(
  character: Pick<
    Character,
    | 'checklist'
    | 'attributes'
    | 'identityBlock'
    | 'identityBlockFrozen'
    | 'locked_seed'
    | 'faceCrop'
    | 'views'
    | 'images'
    | 'dataset'
    | 'downstreamValidation'
  >,
): Record<string, boolean> {
  const checklist = { ...character.checklist };

  checklist['specification.attrs_filled'] = Object.values(character.attributes).every(
    (value) => value.trim() !== '',
  );
  checklist['specification.identity_compiled'] = character.identityBlock.trim() !== '';

  checklist['casting.seed_locked'] = character.locked_seed !== null;
  checklist['casting.prompt_frozen'] = character.identityBlockFrozen;

  checklist['anchorKit.face_crop'] = character.faceCrop.confirmed;
  checklist['anchorKit.three_quarter'] = hasDoneView(character, 'three_quarter');
  checklist['anchorKit.profile'] = hasDoneView(character, 'profile');
  checklist['anchorKit.back'] = hasDoneView(character, 'back');
  checklist['anchorKit.portraits'] =
    hasDoneView(character, 'front_portrait') && hasDoneView(character, 'three_quarter_portrait');
  checklist['anchorKit.hero_image'] = character.images.some(
    (image) => image.label === 'Hero full-body' && image.path.trim() !== '',
  );

  checklist['dataset.images_generated'] =
    character.dataset.imagesCount >= character.dataset.targetMin;

  checklist['downstreamValidation.new_pose'] =
    character.downstreamValidation.newPose.status === 'pass';
  checklist['downstreamValidation.new_outfit'] =
    character.downstreamValidation.newOutfit.status === 'pass';
  checklist['downstreamValidation.no_template_proportions'] =
    character.downstreamValidation.noTemplateProportions.status === 'pass';

  return checklist;
}

/**
 * A checkbox form only submits the boxes that are checked, so "unchecked"
 * never arrives as a value — this fills every known item in a phase in from
 * whatever came back (checked by item id, not the full "<phase>.<id>" key).
 */
export function parsePhaseChecklist(
  phase: ChecklistPhase,
  checked: Record<string, unknown> | undefined,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const item of CHECKLIST_DEFINITIONS[phase]) {
    result[`${phase}.${item.id}`] = Boolean(checked?.[item.id]);
  }
  return result;
}

const LOCK_FORCE_COMPLETE_PHASES: ChecklistPhase[] = ['specification', 'preflight', 'casting'];

/**
 * Casting-lock is meant to mean "every item through Casting & lock is fully checked off" —
 * force-completes every item in those three phases rather than leaving it to whatever a
 * user happened to tick manually. Only specification.attrs_filled/identity_compiled are
 * derived (not force-writable — see deriveChecklist), which is why locking has its own
 * precondition requiring those two to already be true before this is called.
 */
export function forceCompleteThroughCasting(
  checklist: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...checklist };
  for (const phase of LOCK_FORCE_COMPLETE_PHASES) {
    for (const item of CHECKLIST_DEFINITIONS[phase]) {
      next[`${phase}.${item.id}`] = true;
    }
  }
  return next;
}

export function defaultAuditRows(attributes: Attributes): AuditRow[] {
  return AUDIT_ATTRIBUTE_LABELS.map(([key, label]) => ({
    attribute: label,
    specValue: attributes[key],
    imageValue: '',
    ok: true,
  }));
}

export function findImagePath(images: Character['images'], label: string): string {
  return images.find((image) => image.label === label)?.path ?? '';
}

/**
 * Copies a Style's generation settings onto a character as a one-time
 * snapshot — not a live binding. `styleSourceName` is a display-only label;
 * it's never re-synced if the source style is later edited or deleted.
 */
export function applyStyleToCharacter(style: StyleRecord): Partial<Character> {
  return {
    style: style.artStyle,
    checkpoint: style.checkpoint,
    sampler: style.sampler,
    scheduler: style.scheduler,
    cfg: style.cfg,
    steps: style.steps,
    styleSourceName: style.name,
  };
}

/**
 * Merges the built-in default autocomplete suggestions with any user-configured
 * `character-attributes` values from config.yaml. Configured values supplement the
 * defaults (deduped) rather than replacing them; keys with no built-in defaults are
 * passed through as-is.
 */
export function mergeAttributeSuggestions(
  defaults: Record<string, string[]>,
  configured: Record<string, string[]>,
): Record<string, string[]> {
  const keys = new Set([...Object.keys(defaults), ...Object.keys(configured)]);
  const merged: Record<string, string[]> = {};

  for (const key of keys) {
    const defaultValues = defaults[key] ?? [];
    const configuredValues = configured[key] ?? [];
    const seen = new Set<string>();
    const values: string[] = [];

    for (const value of [...defaultValues, ...configuredValues]) {
      if (!seen.has(value)) {
        seen.add(value);
        values.push(value);
      }
    }

    merged[key] = values;
  }

  return merged;
}
