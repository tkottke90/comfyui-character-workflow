import type { WorkflowMappingRecord, WorkflowVersion } from '../schemas/workflow-mapping.schema';
import { requiredWorkflowSlots, WorkflowSlotDef, WORKFLOW_SLOTS } from '../comfy/workflow-registry';

export function isVersionFullyMapped(version: WorkflowVersion): boolean {
  return version.nodes.every((node) => node.status === 'mapped' || node.status === 'verified');
}

/**
 * A version can be activated once every input is mapped and a result output is set.
 * Binding to a phase is only required for slots that actually have one to bind to —
 * utility slots like 999-DualFaceID have no phase bindings at all.
 */
export function canActivateVersion(version: WorkflowVersion, slot: WorkflowSlotDef): boolean {
  const needsPhaseBinding = slot.phaseBindings.length > 0;
  return (
    isVersionFullyMapped(version) &&
    (!needsPhaseBinding || Boolean(version.boundPhaseSlotId)) &&
    Boolean(version.resultOutput)
  );
}

export function activeVersion(record: WorkflowMappingRecord): WorkflowVersion | undefined {
  return record.versions.find((v) => v.active);
}

export function latestVersion(record: WorkflowMappingRecord): WorkflowVersion | undefined {
  return record.versions.at(-1);
}

/**
 * How many of the required (non-utility) workflow slots currently have an active version.
 */
export function requiredSlotProgress(records: WorkflowMappingRecord[]): {
  configured: number;
  total: number;
} {
  const requiredIds = new Set(requiredWorkflowSlots().map((slot) => slot.id));
  const configured = records.filter(
    (record) => requiredIds.has(record.slotId) && Boolean(activeVersion(record)),
  ).length;

  return { configured, total: requiredIds.size };
}

export interface VersionStatusSummary {
  label: string;
  tone: 'active' | 'warning' | 'neutral';
}

/**
 * A one-line status summary for a version's representative row in the workflow
 * hub table — active takes priority, then anything flagged missing (a static
 * value that no longer resolves against ComfyUI), then anything still unmapped,
 * else a fully-mapped-but-never-activated version reads as "not active".
 */
export function summarizeVersionStatus(version: WorkflowVersion): VersionStatusSummary {
  if (version.active) return { label: 'active', tone: 'active' };

  const missingCount = version.nodes.filter((n) => n.status === 'missing').length;
  if (missingCount > 0) {
    return { label: `${missingCount} flagged`, tone: 'warning' };
  }

  const unmappedCount = version.nodes.filter((n) => n.status === 'unmapped').length;
  if (unmappedCount > 0) {
    return { label: `${unmappedCount} unmapped`, tone: 'warning' };
  }

  return { label: 'not active', tone: 'neutral' };
}

/**
 * Partitions the required (non-utility) workflow slots into three buckets for the
 * hub's "Coverage" card — these always sum to the required-slot total.
 */
export function requiredSlotCoverage(records: WorkflowMappingRecord[]): {
  active: number;
  flagged: number;
  notImported: number;
} {
  const byId = new Map(records.map((record) => [record.slotId, record]));
  let active = 0;
  let flagged = 0;
  let notImported = 0;

  for (const slot of requiredWorkflowSlots()) {
    const record = byId.get(slot.id);
    if (record && activeVersion(record)) active += 1;
    else if (record && record.versions.length > 0) flagged += 1;
    else notImported += 1;
  }

  return { active, flagged, notImported };
}

/**
 * Slots with no phase bindings at all (today just 999-DualFaceID) — surfaced in the
 * rail as a separate "not phase-bound" row rather than folded into phaseBindingRows,
 * which only ever reflects real phase-binding entries.
 */
export function unboundSlots(
  records: WorkflowMappingRecord[],
): Array<{ slotId: string; label: string; hasActiveVersion: boolean }> {
  const byId = new Map(records.map((record) => [record.slotId, record]));

  return WORKFLOW_SLOTS.filter((slot) => slot.phaseBindings.length === 0).map((slot) => {
    const record = byId.get(slot.id);
    return {
      slotId: slot.id,
      label: slot.label,
      hasActiveVersion: Boolean(record && activeVersion(record)),
    };
  });
}

export interface OutputNodeCandidate {
  nodeId: string;
  nodeTitle: string;
  classType: string;
}

const OUTPUT_NODE_KEYWORDS = ['save', 'preview'];

/**
 * Nodes in this version that are plausible "result output" nodes — anything whose
 * class type or title suggests it saves/previews an image (SaveImage, PreviewImage,
 * and the various custom "Image Saver"-style nodes third-party packs ship), so the
 * result-output picker only offers nodes worth pointing at instead of every node
 * in the graph. Only nodes with at least one mappable (non-link) input show up here,
 * since that's all parseWorkflowGraph captures — a save node wired with only link
 * inputs and no literal ones (rare; stock SaveImage always has filename_prefix)
 * won't appear.
 */
export function candidateOutputNodes(version: WorkflowVersion): OutputNodeCandidate[] {
  const seen = new Map<string, OutputNodeCandidate>();

  for (const node of version.nodes) {
    if (seen.has(node.nodeId)) continue;
    const haystack = `${node.classType} ${node.nodeTitle}`.toLowerCase();
    if (OUTPUT_NODE_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
      seen.set(node.nodeId, { nodeId: node.nodeId, nodeTitle: node.nodeTitle, classType: node.classType });
    }
  }

  return Array.from(seen.values());
}

/**
 * The "Phase bindings" rail — for every known phase-binding, which slot's active
 * version (if any) currently fulfills it.
 */
export function phaseBindingRows(
  records: WorkflowMappingRecord[],
): Array<{ key: string; label: string; slotId: string; fulfilled: boolean }> {
  const activeSlotIds = new Set(
    records.filter((record) => Boolean(activeVersion(record))).map((record) => record.slotId),
  );

  return WORKFLOW_SLOTS.flatMap((slot) =>
    slot.phaseBindings.map((binding) => ({
      key: binding.key,
      label: binding.label,
      slotId: slot.id,
      fulfilled: activeSlotIds.has(slot.id),
    })),
  );
}
