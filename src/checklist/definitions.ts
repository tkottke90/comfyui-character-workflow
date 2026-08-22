export type ChecklistPhase =
  | 'specification'
  | 'preflight'
  | 'casting'
  | 'refinement'
  | 'anchorKit'
  | 'downstreamValidation'
  | 'dataset';

export interface ChecklistItemDef {
  id: string;
  label: string;
}

export const CHECKLIST_PHASE_LABELS: Record<ChecklistPhase, string> = {
  specification: 'Specification',
  preflight: 'Pre-flight',
  casting: 'Casting & lock',
  refinement: 'Refinement',
  anchorKit: 'Anchor kit',
  downstreamValidation: 'Downstream validation',
  dataset: 'LoRA',
};

export const CHECKLIST_DEFINITIONS: Record<ChecklistPhase, ChecklistItemDef[]> = {
  specification: [
    { id: 'attrs_filled', label: 'All universal attributes filled' },
    { id: 'features_listed', label: 'Distinguishing features listed with locations' },
    { id: 'features_verifiable', label: 'Every feature verifiable in the planned anchor pose' },
    { id: 'identity_compiled', label: 'Identity block compiled from spec' },
  ],
  preflight: [
    { id: 'no_feature_lines', label: 'No facial-feature lines on the control image' },
    { id: 'full_body_uncropped', label: 'Full body head to toe, feet uncropped' },
    { id: 'silhouette_adherence', label: 'Silhouette adherence looks correct' },
    { id: 'attrs_present', label: 'Every universal attribute present' },
    { id: 'bg_clean', label: 'Background / lighting clean, no set dressing' },
    { id: 'no_watermarks', label: 'No watermarks, text or borders' },
    { id: 'vram_ok', label: 'Runtime / VRAM headroom acceptable' },
    { id: 'embeds_seed', label: 'Saved file embeds workflow + seed' },
  ],
  casting: [
    { id: 'variance_strategy', label: 'Variance strategy chosen if needed' },
    { id: 'candidates_scored', label: 'Candidates scored against spec' },
    { id: 'winner_selected', label: 'Winner selected' },
    { id: 'seed_locked', label: 'Locked seed written to frontmatter' },
    { id: 'prompt_frozen', label: 'Resolved prompt frozen as the identity block' },
    { id: 'reverse_spec', label: 'Reverse-spec done if cast with reduced descriptors' },
  ],
  refinement: [
    { id: 'face_detail_pass', label: 'FaceDetailer pass (denoise ~0.4)' },
    { id: 'hands_checked', label: 'Hands checked / repaired' },
    { id: 'features_present', label: 'Every distinguishing feature present or inpainted' },
    { id: 'upscaled', label: 'Upscaled to 2048px+ long edge' },
    { id: 'final_compared', label: 'Final vs. raw candidate compared' },
  ],
  anchorKit: [
    { id: 'hero_image', label: 'Hero full-body image' },
    { id: 'face_crop', label: 'Square face crop' },
    { id: 'three_quarter', label: 'Three-quarter full-body view' },
    { id: 'profile', label: 'Profile full-body view' },
    { id: 'back', label: 'Back full-body view' },
    { id: 'portraits', label: 'Front + three-quarter close-up portraits' },
    { id: 'polish_before_fix', label: 'Every view/portrait polished before targeted fixes' },
    { id: 'detail_closeups', label: 'Detail close-ups for each hard feature' },
    { id: 'loose_hair_alt', label: 'Loose-hair / alternate view if needed' },
  ],
  downstreamValidation: [
    { id: 'new_pose', label: 'New pose + FaceID: likeness holds at weight 0.7-0.8' },
    { id: 'new_outfit', label: 'New outfit: no clothing bleed' },
    { id: 'no_template_proportions', label: 'Proportions hold without the silhouette template' },
  ],
  dataset: [
    { id: 'images_generated', label: '20-40 varied images generated via adapter stack' },
    { id: 'curated', label: 'Dataset curated (bad likenesses culled)' },
    { id: 'lora_trained', label: 'LoRA trained' },
    { id: 'lora_tested', label: 'LoRA tested against anchor kit' },
  ],
};

export const CHECKLIST_PHASES = Object.keys(CHECKLIST_DEFINITIONS) as ChecklistPhase[];

export function emptyChecklist(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const phase of CHECKLIST_PHASES) {
    for (const item of CHECKLIST_DEFINITIONS[phase]) {
      state[`${phase}.${item.id}`] = false;
    }
  }
  return state;
}

export function isPhaseComplete(
  phase: ChecklistPhase,
  checklist: Record<string, boolean>,
): boolean {
  return CHECKLIST_DEFINITIONS[phase].every((item) => checklist[`${phase}.${item.id}`] === true);
}
