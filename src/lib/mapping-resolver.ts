import _ from 'lodash';
import { NodeMapping, WorkflowVersion } from '../schemas/workflow-mapping.schema';
import { CharacterRecord } from '../schemas/character.schema';
import { CharacterImagesService } from '../services/character-images.service';
import { getWorkflowSlot } from '../comfy/workflow-registry';

export class UnresolvableMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnresolvableMappingError';
  }
}

const CURRENT_IMAGE_PATH = 'stage_input.current_image';
const CURRENT_MASK_PATH = 'stage_input.current_mask';
const CASTING_SEED_PATH = 'stage_input.casting_seed';
const CUSTOM_POSITIVE_PROMPT_PATH = 'stage_input.custom_positive_prompt';
const CUSTOM_NEGATIVE_PROMPT_PATH = 'stage_input.custom_negative_prompt';

export type ResolvedNodeValue =
  | { kind: 'literal'; value: string }
  | { kind: 'image'; role: 'image' | 'mask'; filePath: string; relativePath: string };

/**
 * Per-invocation values a caller supplies at resolve time, rather than something the
 * resolver can look up on its own — the per-candidate seed a casting-batch submission
 * overrides on each of its N separate /prompt calls, and the free-text prompt overrides a
 * single-phase trigger form (e.g. a masked cleanup/targeted-fix run) may supply.
 */
export interface ResolutionContext {
  castingSeed?: number;
  customPositivePrompt?: string;
  customNegativePrompt?: string;
}

export interface ResolvedMapping {
  nodeId: string;
  inputName: string;
  classType: string;
  resolved: ResolvedNodeValue;
}

/**
 * `stage_input.current_image`/`current_mask` don't resolve against the character record
 * like every other domain field — they resolve against phase-binding-keyed storage
 * (character-images.service.ts). Every workflow slot that actually consumes an image has
 * exactly one phase binding (001-Seed is the sole slot with two, and it's a pure producer
 * with no image input at all) — so a version's boundPhaseSlotId unambiguously determines
 * which phase-binding directory to read from. Fails loudly rather than guessing if that
 * invariant is ever violated, instead of silently picking the wrong phase binding's file.
 */
function phaseBindingKeyForVersion(version: WorkflowVersion): string {
  if (!version.boundPhaseSlotId) {
    throw new UnresolvableMappingError('This workflow version is not bound to a phase yet');
  }

  const slot = getWorkflowSlot(version.boundPhaseSlotId);
  if (!slot || slot.phaseBindings.length !== 1) {
    throw new UnresolvableMappingError(
      `Cannot resolve Current Image/Mask for slot "${version.boundPhaseSlotId}" — expected ` +
        'exactly one phase binding',
    );
  }

  return slot.phaseBindings[0].key;
}

function resolveCurrentImageOrMask(
  role: 'image' | 'mask',
  version: WorkflowVersion,
  character: CharacterRecord,
  characterImages: CharacterImagesService,
): ResolvedNodeValue {
  const phaseBindingKey = phaseBindingKeyForVersion(version);
  const latest = characterImages.getCurrentWorkingFile(character.slug, phaseBindingKey, role);

  if (!latest) {
    throw new UnresolvableMappingError(
      `No ${role} has been uploaded yet for phase binding "${phaseBindingKey}"`,
    );
  }

  return {
    kind: 'image',
    role,
    filePath: characterImages.resolvePath(character.slug, latest.relativePath),
    relativePath: latest.relativePath,
  };
}

function resolveDomainField(
  sourceValue: string,
  version: WorkflowVersion,
  character: CharacterRecord,
  characterImages: CharacterImagesService,
  context: ResolutionContext,
): ResolvedNodeValue {
  if (sourceValue === CURRENT_IMAGE_PATH) {
    return resolveCurrentImageOrMask('image', version, character, characterImages);
  }
  if (sourceValue === CURRENT_MASK_PATH) {
    return resolveCurrentImageOrMask('mask', version, character, characterImages);
  }
  if (sourceValue === CASTING_SEED_PATH) {
    if (context.castingSeed === undefined) {
      throw new UnresolvableMappingError(
        'stage_input.casting_seed is mapped, but no per-candidate seed was supplied for this run',
      );
    }
    return { kind: 'literal', value: String(context.castingSeed) };
  }
  // Unlike casting_seed, a blank custom prompt is a legitimate per-run choice (e.g. "don't
  // override the node's baked-in text this time") rather than a missing required value, so
  // this resolves to an empty-string literal instead of throwing when unsupplied.
  if (sourceValue === CUSTOM_POSITIVE_PROMPT_PATH) {
    return { kind: 'literal', value: context.customPositivePrompt ?? '' };
  }
  if (sourceValue === CUSTOM_NEGATIVE_PROMPT_PATH) {
    return { kind: 'literal', value: context.customNegativePrompt ?? '' };
  }
  if (sourceValue.startsWith('stage_input.')) {
    throw new UnresolvableMappingError(
      `Domain field "${sourceValue}" is not yet supported by the execution engine`,
    );
  }

  const value = _.get({ character }, sourceValue);
  if (value === undefined || value === null || value === '') {
    throw new UnresolvableMappingError(`Domain field "${sourceValue}" is empty for this character`);
  }
  return { kind: 'literal', value: String(value) };
}

function resolveNode(
  node: NodeMapping,
  version: WorkflowVersion,
  character: CharacterRecord,
  characterImages: CharacterImagesService,
  context: ResolutionContext,
): ResolvedNodeValue {
  if (node.sourceType === 'static') {
    return { kind: 'literal', value: node.sourceValue };
  }

  if (node.sourceType === 'domain') {
    return resolveDomainField(node.sourceValue, version, character, characterImages, context);
  }

  // 'computed' is deferred (removed from the mapping editor, but the schema still allows
  // it so old/imported data doesn't fail to parse) — fail loudly rather than silently, since
  // it's unreachable through the editor and reaching it here means something upstream is wrong.
  throw new UnresolvableMappingError(
    `${node.nodeId}.${node.inputName} has source type "${node.sourceType}", which the ` +
      'execution engine cannot resolve',
  );
}

/**
 * Resolves every mapped (non-'unset') node in a workflow version to a concrete value —
 * either a literal to splice straight into the cloned graph, or a local file to upload to
 * ComfyUI first and splice the returned filename in. Throws UnresolvableMappingError on
 * the first mapping that can't be resolved (e.g. no Current Image uploaded yet, an empty
 * domain field, or a 'computed'/unbound-phase mapping) rather than submitting a partially
 * resolved graph to ComfyUI.
 */
export function resolveMapping(
  version: WorkflowVersion,
  character: CharacterRecord,
  characterImages: CharacterImagesService,
  context: ResolutionContext = {},
): ResolvedMapping[] {
  return version.nodes
    .filter((node) => node.sourceType !== 'unset')
    .map((node) => ({
      nodeId: node.nodeId,
      inputName: node.inputName,
      classType: node.classType,
      resolved: resolveNode(node, version, character, characterImages, context),
    }));
}
