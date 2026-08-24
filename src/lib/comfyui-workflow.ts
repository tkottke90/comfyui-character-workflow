import { WORKFLOW_SLOTS } from '../comfy/workflow-registry';
import type { NodeMapping } from '../schemas/workflow-mapping.schema';

export interface ParsedNodeInput {
  nodeId: string;
  nodeTitle: string;
  inputName: string;
  classType: string;
  rawValue: unknown;
}

interface RawComfyNode {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
}

function isNodeLinkReference(value: unknown): value is [string | number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number') &&
    typeof value[1] === 'number'
  );
}

/**
 * Walks a ComfyUI API-format workflow export (nodes keyed by id, each with a
 * class_type + inputs map) and returns every widget-style input — inputs whose
 * value is a graph-edge reference to another node's output are skipped, since
 * those aren't independently mappable.
 */
export function parseWorkflowGraph(json: unknown): ParsedNodeInput[] {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Expected a ComfyUI API-format workflow export (a JSON object of nodes)');
  }

  const nodes = json as Record<string, RawComfyNode>;
  const result: ParsedNodeInput[] = [];

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object' || !node.inputs) continue;
    const nodeTitle = node._meta?.title || node.class_type || nodeId;
    const classType = node.class_type ?? '';

    for (const [inputName, rawValue] of Object.entries(node.inputs)) {
      if (isNodeLinkReference(rawValue)) continue;
      result.push({ nodeId, nodeTitle, inputName, classType, rawValue });
    }
  }

  if (result.length === 0) {
    throw new Error('No mappable inputs were found in this workflow export');
  }

  return result;
}

/**
 * Renders a raw widget value (string/number/boolean — link references are already
 * filtered out by parseWorkflowGraph) as the plain string a static mapping stores.
 */
export function stringifyRawValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * The default mapping for a node input that has no prior mapping to carry forward —
 * pre-filled as a static value using whatever was actually captured in the export
 * (e.g. a KSampler denoise that's always 1.0 for this workflow), rather than left
 * unmapped. Requiring the user to manually re-enter values ComfyUI already recorded
 * would make every import tedious for no benefit — they only need to override the
 * inputs that actually need to vary per character.
 */
export function defaultMapping(parsed: ParsedNodeInput): NodeMapping {
  return {
    nodeId: parsed.nodeId,
    nodeTitle: parsed.nodeTitle,
    inputName: parsed.inputName,
    classType: parsed.classType,
    sourceType: 'static',
    sourceValue: stringifyRawValue(parsed.rawValue),
    status: 'mapped',
  };
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Filename-match heuristic for suggesting which workflow slot a newly imported
 * export belongs to (e.g. "005FaceCrop.json" -> "005-FaceCrop").
 */
export function suggestSlotId(filename: string): string | undefined {
  const target = normalizeForMatch(filename);

  for (const slot of WORKFLOW_SLOTS) {
    if (target.includes(normalizeForMatch(slot.id)) || target.includes(normalizeForMatch(slot.label))) {
      return slot.id;
    }
  }

  return undefined;
}

/**
 * Carries mappings forward from a previous version onto a freshly re-imported
 * graph — matched by node id first, falling back to node title when the id
 * shifted between exports. Anything that can't be matched (a genuinely new input)
 * falls back to the same static-from-export default a fresh import gets.
 */
export function carryForwardMappings(
  oldNodes: NodeMapping[],
  newParsed: ParsedNodeInput[],
): NodeMapping[] {
  return newParsed.map((parsed): NodeMapping => {
    const matched =
      oldNodes.find((n) => n.nodeId === parsed.nodeId && n.inputName === parsed.inputName) ??
      oldNodes.find((n) => n.nodeTitle === parsed.nodeTitle && n.inputName === parsed.inputName);

    if (!matched) return defaultMapping(parsed);

    return {
      nodeId: parsed.nodeId,
      nodeTitle: parsed.nodeTitle,
      inputName: parsed.inputName,
      classType: parsed.classType,
      sourceType: matched.sourceType,
      sourceValue: matched.sourceValue,
      status: matched.status,
    };
  });
}
