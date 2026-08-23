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
