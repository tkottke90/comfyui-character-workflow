---
# ============ Character File ============
name: ""                    # character's full name; if used as an identity
                            # token (name trick, Step 1), it is frozen content
status: draft               # draft | casting | locked | kit-complete | lora-trained
created: YYYY-MM-DD
updated: YYYY-MM-DD

# ---- Image style / run settings (frozen after pre-flight) ----
style: photorealistic
checkpoint: RealVisXL_V5.0
sampler: dpmpp_2m
scheduler: karras
steps: 28
cfg: 5
resolution: 832x1216
body_template: ""           # silhouette template file (§4.2), facial features
                            # erased; skull outline per hair length
cn_strength: 0.5
cn_end: 0.55

# ---- Locked at Step 2 (null until a candidate is chosen) ----
locked_seed: null
locked_prompt_hash: null    # optional: hash of the exact resolved prompt

# ---- Editing-model / view-generation settings (§6.1, §6 Route B) ----
edit_model: ""              # same-facing edits: outfit/mark/bg changes (e.g. qwen-image-edit-2511)
rotation_model: ""          # ANY reorientation, body or head (e.g. original qwen_image_edit
                            # + multiangle-lora + lightning) — 2511-class models resist turning;
                            # this is a model CHOICE, not a prompt fix (§6 Route B)

# ---- FaceID settings, if the adapter stack is used (§6.1 rung 3 / troubleshooting) ----
faceid_weight: 0.75         # 0.7-0.8 single subject; 0.85 multi-panel sheets
faceid_weight_v2: 1.0       # CLIP-vision detail channel (cheeks/eyes/skin character).
                            # DEFAULT 1.0 IS A TRAP — silently caps likeness even at high
                            # `weight`. Set 1.5-2.0 for real portraits/references.

# ---- Universal attributes (§3.0 Part 1 — every field REQUIRED; a blank
#      field is an unfinished design the model will fill differently
#      per seed) ----
attributes:
  sex: ""
  apparent_age: ""
  ethnicity: ""
  skin_tone: ""             # vocabulary: Appendix A.1
  face_shape: ""            # A.6 — shape + 2-3 geometry cues
  eyes: ""                  # shape A.7, color A.8
  eyebrows: ""
  hair: ""                  # color A.3 + style A.4; note skull-outline rule
  nose: ""                  # A.10 (head shape, if bald/buzzed: A.5)
  lips: ""
  build: ""                 # A.11 — must match body_template (§3.2)
  height_impression: ""
  base_clothing: ""         # fitted, for anchor legibility (§4.2 rule 5)
---

# Character: <name>

## Checklist

- [ ] **Specification**
  - [ ] All universal attributes filled (frontmatter)
  - [ ] Distinguishing features listed with locations (below)
  - [ ] Every feature verifiable in the planned anchor pose (§3.0 rule 2)
  - [ ] Identity block compiled from spec (below)
- [ ] **Pre-flight** (single generation, fixed seed — Step 1)
  - [ ] Preprocessor preview: no facial-feature lines, polarity, resolution
  - [ ] Framing full-body, background/lighting clean, no watermarks
  - [ ] Runtime/VRAM acceptable; PNG embeds workflow + seed
- [ ] **Casting** (queue ×8–16, explicit seeds)
  - [ ] Variance strategy chosen if needed: name token / descriptor
        reduction / braces (scoped, resolved prompt captured)
  - [ ] Candidates scored against spec (universal attributes walk)
  - [ ] Winner selected — face and build first, small features last
- [ ] **Lock**
  - [ ] `locked_seed` written to frontmatter
  - [ ] Resolved prompt frozen as the identity block (braces removed)
  - [ ] Reverse-spec done if cast with reduced descriptors
        (Appendix A checklist against face crop; no-FaceID validation run)
- [ ] **Refinement**
  - [ ] FaceDetailer pass (denoise ~0.4; two-pass if needed)
  - [ ] Hands checked / repaired
  - [ ] Every distinguishing feature present or inpainted (Step 4)
  - [ ] Upscaled to 2048px+ long edge, low-denoise polish
  - [ ] Final vs. raw candidate compared (no saturation/identity drift)
- [ ] **Anchor kit** (Step 6 — Route B: per-view edit generations; workflows 005-008)
  - [ ] Hero full-body image (004 output)
  - [ ] Square face crop — 005, mandatory (FaceID/QIE-slot-2 referee for everything below)
  - [ ] Invariant tail compiled from spec + frozen (Edit Instructions below)
  - [ ] Three-quarter full-body view (006 — reorient: check rotation_model, not edit_model)
  - [ ] Profile full-body view, direction-matched to three-quarter (006)
  - [ ] Back full-body view — verifies hair length (006, whole-image 008 polish; no face for the detailer)
  - [ ] Front + three-quarter close-up portraits — face-reference assets (006; use
        rotation_model if any head turn is requested, even a small one)
  - [ ] Every view/portrait winner through 008 (polish) BEFORE 007 (targeted fixes) —
        fixing a mark on an unpolished face wastes the fix
  - [ ] Detail close-ups for each hard feature (tattoos, marks) — 007
  - [ ] Loose-hair / alternate view if anchor used a legibility-only style
- [ ] **Downstream validation** (§6)
  - [ ] New pose + FaceID: likeness holds at weight 0.7–0.8
  - [ ] New outfit: no clothing bleed (attention mask if needed)
  - [ ] Proportions hold WITHOUT the silhouette template
- [ ] **LoRA** (Step 7 — for long-lived characters)
  - [ ] 20–40 varied images generated via adapter stack
  - [ ] Dataset curated (bad likenesses culled)
  - [ ] LoRA trained
  - [ ] LoRA tested against anchor kit; replaces adapter stack downstream

## Distinguishing Features

<!-- §3.0 Part 2. Each with precise location + expected difficulty.
     If it's not listed here, it doesn't exist (rule 1). -->

- <feature, location, size> *(easy | medium — verify per candidate | hard — inpaint at Step 4)*

## Identity Block

<!-- Compiled from the spec. FROZEN once locked — never paraphrase (§3.1).
     Weights only for observed, repeated drops; ceiling 1.4. -->

```
<identity block — frozen text>
```

**Negative guards** (checkpoint defaults that contradict this spec — §8.3 pattern):

```
<negative prompt — frozen text>
```

## Edit Instructions

<!-- Editing-model (QIE) prompts. The invariant tail is FROZEN content compiled
     from the spec - changes go through the Log like the identity block.
     Per-view change clauses precede it. Record the winning seed per view
     in the Images table. -->

**Invariant tail (frozen):**

```
Keep the same woman with the same face, the same <hair>,
the same <base clothing>, on the same <background> with soft even lighting.
Photorealistic photograph.
```

**Per-view change clauses:**

| View | Change clause |
|---|---|
| Three-quarter | Turn the woman to a three-quarter view, her body angled to her <dir>, standing relaxed with arms at her sides, full body visible from head to bare feet. |
| Profile | Turn the woman to show her full <dir> side profile, standing straight, arms relaxed at her sides, full body visible. |
| Back | Turn the woman to face directly away from the camera, arms relaxed, full body visible, showing the back of her hair. |
| Front portrait | A close-up head and shoulders portrait of the same woman, facing the camera directly, neutral expression. Sharp facial detail. |
| Three-quarter portrait | A close-up head and shoulders portrait in three-quarter view, head turned slightly to her <dir>, eyes toward camera, neutral expression. Sharp facial detail. |

## Images

<!-- Anchor kit paths/links. The kit, not the hero alone, is the anchor. -->

| Asset | Path | Notes |
|---|---|---|
| Hero full-body | | canonical anchor; seed is the fallback, not the source of truth |
| Face crop (square, front) | | primary FaceID/QIE-slot-2 referee |
| Three-quarter (full body) | | recipe: rotation_model + camera/turn command + seed |
| Profile (full body) | | direction-matched to three-quarter |
| Back (full body) | | hair-length verification |
| Front portrait | | edit_model, tail version noted |
| Three-quarter portrait (face crop) | | second FaceID/QIE-slot-2 referee — batch-average with the front crop |
| Detail: <feature> | | |

## Log

<!-- Newest first. One entry per adjustment: what was wrong, what changed.
     Frozen-content changes (identity block, seed, negatives) ALWAYS get
     an entry — an undocumented change to frozen content is drift. -->

### YYYY-MM-DD HH:MM — <short title>

- **Observed:** <what was wrong / what the batch showed>
- **Change:** <exact adjustment — field, old → new>
- **Result:** <effect on next run>