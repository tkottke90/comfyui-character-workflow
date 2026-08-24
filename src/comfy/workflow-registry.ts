export interface PhaseBindingDef {
  key: string;
  label: string;
}

export interface WorkflowSlotDef {
  id: string;
  label: string;
  description: string;
  required: boolean;
  phaseBindings: PhaseBindingDef[];
}

/**
 * The fixed, code-defined catalog of ComfyUI workflow "slots" the app needs mapped —
 * transcribed from GitHub issue #3's "Required Workflows" table. This is not user-editable
 * config: it's the app's own knowledge of which pipeline stages exist and what they're for.
 */
export const WORKFLOW_SLOTS: WorkflowSlotDef[] = [
  {
    id: '001-Seed',
    label: 'Seed Hunt',
    description: 'txt2img "casting" pass — generates full-body candidates from the identity block.',
    required: true,
    phaseBindings: [
      { key: 'casting_preflight', label: 'Casting Pre-flight' },
      { key: 'casting_batch', label: 'Casting Batch' },
    ],
  },
  {
    id: '002-Face',
    label: 'Face Detail',
    description: 'FaceDetailer repair pass on a raw seed-hunt winner (pre-identity, no adapters).',
    required: true,
    phaseBindings: [{ key: 'refinement_face_detail', label: 'Refinement: Face Detail' }],
  },
  {
    id: '003-Cleanup',
    label: 'Background/Artifact Cleanup',
    description: 'Full-denoise (1.0) inpaint to destructively erase and rebuild background elements.',
    required: true,
    phaseBindings: [{ key: 'refinement_cleanup', label: 'Refinement: Cleanup' }],
  },
  {
    id: '004-Upscale',
    label: 'Final Hero Upscale',
    description: 'Model upscale to 2048px+ long edge plus a light denoise refine pass.',
    required: true,
    phaseBindings: [{ key: 'refinement_upscale', label: 'Refinement: Upscale' }],
  },
  {
    id: '005-FaceCrop',
    label: 'Square Identity Crop',
    description: 'Produces the tight square face crop used as the FaceID/InstantID reference.',
    required: true,
    phaseBindings: [{ key: 'face_crop', label: 'Face Crop' }],
  },
  {
    id: '006-Edit',
    label: 'General-Purpose Edit',
    description: 'Instruction-based editing (Qwen-Image-Edit) for same-facing changes.',
    required: true,
    phaseBindings: [
      { key: 'view_generation_same_facing', label: 'View Generation — same-facing' },
    ],
  },
  {
    id: '007-Inpaint',
    label: 'Targeted Fixes',
    description: 'Small masked edits on already-polished images only.',
    required: true,
    phaseBindings: [{ key: 'targeted_fix', label: 'Targeted Fix' }],
  },
  {
    id: '008-Polish',
    label: 'Winner Polish',
    description: 'FaceID-wrapped restyle pass that brings edited winners back to the production look.',
    required: true,
    phaseBindings: [{ key: 'polish', label: 'Polish' }],
  },
  {
    id: '010-Angle',
    label: 'Camera-Angle/Reorientation',
    description: 'The only workflow that turns the subject (body or head), any degree.',
    required: true,
    phaseBindings: [{ key: 'view_generation_turn', label: 'View Generation — turn' }],
  },
  {
    id: '999-DualFaceID',
    label: 'Multi-Reference FaceID A/B Test',
    description: 'Diagnostic/utility — not part of the linear pipeline.',
    required: false,
    phaseBindings: [],
  },
];

export function getWorkflowSlot(slotId: string): WorkflowSlotDef | undefined {
  return WORKFLOW_SLOTS.find((slot) => slot.id === slotId);
}

export function getWorkflowSlotBySlug(slug: string): WorkflowSlotDef | undefined {
  return WORKFLOW_SLOTS.find((slot) => slugifySlotId(slot.id) === slug);
}

export function requiredWorkflowSlots(): WorkflowSlotDef[] {
  return WORKFLOW_SLOTS.filter((slot) => slot.required);
}

export function slugifySlotId(slotId: string): string {
  return slotId.toLowerCase();
}

/**
 * The rail's "Phase bindings" list — every known phase-binding across every slot,
 * in slot-registry order, each tagged with the slot it belongs to.
 */
export function allPhaseBindings(): Array<PhaseBindingDef & { slotId: string }> {
  return WORKFLOW_SLOTS.flatMap((slot) =>
    slot.phaseBindings.map((binding) => ({ ...binding, slotId: slot.id })),
  );
}
