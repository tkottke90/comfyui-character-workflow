---
# ============ Character File ============
name: "Rin Takahashi"      # used as identity token in the prompt (user opted in)
status: kit-complete               # draft | casting | locked | kit-complete | lora-trained
created: 2026-08-17
updated: 2026-08-17

# ---- Image style / run settings (frozen after pre-flight) ----
style: photorealistic
checkpoint: RealVisXL_V5.0
sampler: dpmpp_2m
scheduler: karras
steps: 28
cfg: 5
resolution: 864x1536          # 9:16 via Image Saver M(1260); part of the seed-reproduction recipe - do not change
body_template: "female_pose_inverted_triangle.png"  # used for casting; anchor rendered slender - template retired post-lock (proportions now carried by identity block)
cn_strength: 0.5
cn_end: 0.55
trigger_token: "rintakahashi"      # plain text, no brackets (angle-bracket syntax is for
                                    # textual-inversion embeddings, not LoRA caption tokens)
deployment_domain: "home/everyday - apartment interior (living room, kitchen,
                    bedroom, hallway), casual wear, natural/lamp lighting"
edit_model: qwen-image-edit-2511   # portraits/edits (drift-fixed)
rotation_model: qwen_image_edit_fp8_e4m3fn + 2511-multiangle-lora@1.0 + lightning-v1  # 006 rotation stage, 4/1/euler/simple, max-dim 1488
rotation_prompt: "{camera_phrase}\nPreserve face, hair, and body features."  # concat, FROZEN - the hair term supersedes the conditional reminder line
reorient_model_rule: "original qwen_image_edit_fp8_e4m3fn for ANY reorientation (body or head); 2511 only for same-facing edits"
faceid_weight: 0.85            # 0.75 single-subject; sheet context 0.85
faceid_weight_v2: 2.0          # CLIP-vision detail channel - NEVER leave at default 1.0

# ---- Locked at Step 2 (null until a candidate is chosen) ----
locked_seed: 435251544331531
locked_prompt_hash: null    # optional: hash of the exact resolved prompt

# ---- Universal attributes (§3.0 Part 1 — every field REQUIRED; a blank
#      field is an unfinished design the model will fill differently
#      per seed) ----
attributes:
  sex: "Female"
  apparent_age: "Mid 20s"
  ethnicity: "Japanese"
  skin_tone: "Fair, neutral undertone"
  face_shape: "Oval, soft jawline, smooth brow"
  eyes: "Dark brown, almond, monolid"
  eyebrows: "Black, straight, medium"
  hair: "Jet black, long straight, mid-back length, center-parted"
  nose: "Small, straight, low bridge"
  lips: "Medium, natural tone"
  build: "Slender - slight shoulders, medium bust, narrow hips"
  height_impression: "Average (~160 cm)"
  base_clothing: "Fitted black crew-neck t-shirt, slim grey jeans, barefoot"
---

# Character: Rin Takahashi

## Checklist

- [ ] **Specification**
  - [x] All universal attributes filled (frontmatter)
  - [x] Distinguishing features listed with locations (below)
  - [x] Every feature verifiable in the planned anchor pose (§3.0 rule 2)
  - [x] Identity block compiled from spec (below)
- [ ] **Pre-flight** (single generation, fixed seed — Step 1)
  - [ ] Preprocessor preview: no facial-feature lines, polarity, resolution
  - [ ] Framing full-body, background/lighting clean, no watermarks
  - [ ] Runtime/VRAM acceptable; PNG embeds workflow + seed
- [ ] **Casting** (queue ×8–16, explicit seeds)
  - [x] Variance strategy chosen if needed: name token / descriptor
        reduction / braces (scoped, resolved prompt captured)
  - [x] Candidates scored against spec (universal attributes walk)
  - [x] Winner selected — face and build first, small features last
- [ ] **Lock**
  - [x] `locked_seed` written to frontmatter
  - [x] Resolved prompt frozen as the identity block (braces removed)
  - [x] Reverse-spec done if cast with reduced descriptors
        (build reconciled to rendered anchor; face terms already matched)
- [ ] **Refinement**
  - [x] FaceDetailer pass (denoise ~0.4; two-pass if needed)
  - [ ] Hands checked / repaired
  - [x] Every distinguishing feature present or inpainted (Step 4) - N/A, feature list emptied by amendment
  - [x] Upscaled to 2048px+ long edge, low-denoise polish
  - [x] Final vs. raw candidate compared (no saturation/identity drift)
- [ ] **Anchor kit** (Step 6)
  - [ ] Hero full-body image
  - [x] Square face crop (tight, face-filling)
  - [ ] Face turnaround panel (front / three-quarter / profile)
  - [ ] 2–3 angle crops for embedding averaging
  - [x] Detail close-ups for each hard feature (tattoos, marks) - N/A, none in spec; incidental marks (arm mole, 2 assets) removed via 007
  - [ ] Loose-hair / alternate panel if anchor used a legibility-only style
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

*None — deliberately minimal for the first workflow run; distinguishing features to be added in a future amendment (each addition regenerates the identity block and requires anchor + kit updates).*

## Identity Block

<!-- Compiled from the spec. FROZEN once locked — never paraphrase (§3.1).
     Weights only for observed, repeated drops; ceiling 1.4. -->

```
photo of a japanese woman named Rin Takahashi, mid 20s, fair skin,
oval face with soft jawline and smooth brow, dark brown almond monolid eyes,
straight black eyebrows, long straight jet black hair, mid-back length, center-parted,
small straight nose, natural lips,
slender build, slight shoulders, medium bust, narrow hips,
average height,
fitted black crew-neck t-shirt, slim grey jeans, barefoot
```

**Negative guards** (checkpoint defaults that contradict this spec — §8.3 pattern):

```
cartoon, illustration, 3d render, cgi, painting, anime, deformed,
extra limbs, extra fingers, bad hands, fused fingers, blurry,
watermark, text, logo, cropped, out of frame, dramatic lighting,
harsh shadows, jewelry, necklace, (earrings:1.3),
ponytail, braid, bun, updo, kimono, yukata, traditional dress
```

## Edit Instructions (QIE)

**Invariant tail (FROZEN — v3 trimmed, 2026-08-18 05:10, for QIE 2511+; v1/v2 superseded, see Log):**

```
Keep the same woman with exactly the same face, the same long straight
jet black center-parted hair reaching mid-back, the same fitted black
crew-neck t-shirt and slim grey jeans, barefoot, on the same plain white
studio background. Photorealistic photograph.
```

(Portrait variant: hair "swept behind her shoulders", outfit line reduced to
"the black crew-neck t-shirt"; append "sharp facial detail". v2's
anti-beautification pins are RETIRED on 2511 — do not re-add without a fresh
observed-repetition case; long instructions degrade facial identity.)

**Facial-marks policy:** random small added marks appear pin-or-no-pin and are
handled downstream, not in the tail: KIT reference winners get facial marks
inpainted out (identity references must match the clean-skin spec exactly);
DATASET images tolerate random non-recurring marks (training noise) — only a
mark recurring across many dataset images would need action.

**Per-view change clauses:** three-quarter (angled to her left) / left profile /
back / front portrait / three-quarter portrait — full text as issued 2026-08-18;
portraits append "sharp facial detail" and swap the tail's outfit line for
"the black crew-neck t-shirt collar visible", hair "swept behind her shoulders".


## Dataset Brief (Phase 3)

<!-- The brief IS the prompt list (README). Split target: 50% deployment domain
     / 30% neutral-varied (kit assets partially satisfy this bucket already) /
     20% close-up + edge-angle coverage. Target total: ~30 images. -->

**Dataset invariant tail (FROZEN, distinct from the kit tail — identity only,
outfit/background deliberately NOT pinned so they vary per shot):**

```
Keep the same woman with exactly the same face and the same long straight
jet black center-parted hair. Photorealistic photograph.
```

**Domain bucket — home/everyday (~15 images target; 10 seed shots below, expand
with outfit/lighting variations on each):**

| # | Shot | Reorient? |
|---|---|---|
| 1 | Sitting on the couch reading a book, living room, afternoon window light | No — edit_model |
| 2 | Standing at the kitchen counter pouring coffee, morning light | No — edit_model |
| 3 | Leaning on the counter with a mug, oversized cardigan, warm light | No — edit_model |
| 4 | Sitting at a small kitchen table with a laptop, casual work-from-home | No — edit_model |
| 5 | Walking down a hallway, cozy sweater, evening lamp light | Slight — rotation_model |
| 6 | Sitting cross-legged on the bed folding laundry, soft daylight | No — edit_model |
| 7 | Standing by a window looking outside, oversized sweater, natural light | Profile-ish — rotation_model |
| 8 | Cooking at the stove, apron over casual clothes, warm kitchen light | Back/3-4 — rotation_model |
| 9 | Curled up on the couch under a blanket, evening lamp light | No — edit_model |
| 10 | At the sink doing dishes, casual t-shirt, daylight through the window | Back — rotation_model |

**Neutral/varied bucket (~9 images target): kit assets (hero, 3/4, profile, back,
both portraits) count toward this bucket per the guide. Top up only if curation
culls bring the count short — additional plain-studio or outdoor-varied shots.**

**Close-up / edge-angle bucket (~6 images target): use the MultiAngle command's
elevation/distance axes directly, e.g. `<sks> front view low-angle shot close-up`,
`<sks> front-right quarter view elevated shot medium shot` — free coverage of
the unusual-angle regime that's hardest for a trained LoRA to generalize without
example data.**

**Every winner (all three buckets) routes through 008 (winner polish) before
entering the training set, per the rendering-unification rule — the LoRA should
learn Rin as the production checkpoint renders people, not as Qwen renders her.**

## Images

<!-- Anchor kit paths/links. The kit, not the hero alone, is the anchor. -->

| Asset | Path | Notes |
|---|---|---|
| Hero full-body | Hero.png | FINAL: detailed, cleaned, upscaled; seed 435251544331531 |
| Face crop (front) | rin-face-crop.png (508x512) | FaceID identity referee - primary reference |
| Three-quarter (full body) | rin-view-threequarter.png | 006 hybrid recipe (orig. base + 2511-multiangle@1.0 + Lightning, camera 45 + preserve-line) -> 004 4x/0.5 upscale -> 008 polish -> 007 mole removal (arm) |
| Profile (full body) | rin-view-profile.png | 006 hybrid recipe, camera ~90 (45 ran hot) -> 004 upscale -> 008 polish |
| Back (full body) | rin-view-back.png | 006 hybrid recipe, camera 180 -> 004 upscale -> 008 whole-image polish (no face) - mid-back hair length VERIFIED (borderline/upper-mid-back, accepted vs template wording) |
| Front portrait | rin-portrait-front.png | 2511, tail v3, seed banked; 008 polish |
| Three-quarter portrait (FACE REFERENCE) | rin-portrait-threequarter-crop.png | ORIGINAL base (2511 resisted head-turn - generalized reorient rule), tail v3, 008 polish @0.20-0.25 (denoise-insensitive on clean source per 3-way test), eyes verified sharp, 007 mole removal (arm) - SECOND FaceID/QIE-slot-2 reference |
| Face crop (square) | rin-face-crop.png (508x512) | FaceID identity reference — feeds every downstream IPAdapter call; never substitute the hero |
| Turnaround panel | | |
| Angle crop 1 / 2 / 3 | | IPAdapter batch averaging |
| Detail: <feature> | | |

## Log

<!-- Newest first. One entry per adjustment: what was wrong, what changed.
     Frozen-content changes (identity block, seed, negatives) ALWAYS get
     an entry — an undocumented change to frozen content is drift. -->

### 2026-08-19 — Workflow 008 (Winner Polish) split out from 002

- **Observed:** User proposed splitting the post-Qwen polish pass into its own numbered workflow rather than a 002 preset.
- **Change:** Registry gains 008-Polish: FaceID-wrapped FaceDetailer (0.20-0.22 clean source / up to 0.28-0.30 degraded, prefer regenerate over restore when source is bad), whole-image variant for faceless views, standing eye-zoom check, distinct graph from 002 (which pre-dates FaceID/identity anchoring). Rationale: different model chains not just different denoise; agent dispatch needs an unambiguous "Qwen output -> always 008" rule rather than a branching parameter inside 002; every Phase-3 dataset image will route through it. Registry now 8 workflows.
- **Result:** Guide's 008 row is the spec of record. Rin's kit assets (already run through what was informally "polish") retroactively attributed to 008 in the recipe notation.

### 2026-08-19 (cont.) — Elevation axis investigation: JSON confirms wiring correct, Lightning is prime suspect

- **Observed:** Low-angle elevation command produced a near-no-op (barely below eye-level). API JSON audit of the subgraph (Qwen-Image-Edit Multiangle, 13 internal nodes) confirms BOTH LoRAs correctly wired in series at strength 1 (multiangle -> lightning -> ModelSamplingAuraFlow -> CFGNorm -> KSampler), prompt correctly injected via subgraph input port. "LoRA not loaded" theory is DEAD for this run - the graph is provably correct. Run used the 4-step/CFG-1 Lightning profile (per the graph's own embedded settings-reference note, this is the fastest/lowest-fidelity of three documented profiles: official 50/4.0, fp8_e4m3fn 20/2.5, +Lightning 4/1.0). This profile has worked reliably for AZIMUTH all session but was never isolated-tested for ELEVATION specifically.
- **Change:** None yet - diagnostic test queued: bypass Lightning LoRA, run 20 steps / CFG 2.5 (CFGNorm already in chain, correctly configured for CFG>1), same seed, same low-angle command. Single-variable test isolating whether 4-step compression specifically fails to carry the elevation axis while surviving azimuth (plausible: elevation may be a subtler/less-represented transform in this LoRA's training data than full rotation).
- **Result:** If 20-step resolves it: recipe becomes profile-dependent by axis (Lightning ok for azimuth, full steps needed for elevation) - log as a permanent rotation_model note. If it doesn't resolve: treat as a genuine trained-capability gap for this axis on this setup, drop low-angle/elevated shots from the close-up/edge-angle bucket rather than continuing to chase it, and keep the bucket's working azimuth-based close-ups.

### 2026-08-19 (cont.) — Workflow architecture correction: 006/010 split by MECHANISM, not phase

- **Observed:** User demonstrated chaining (006 to build the campfire scene, then the MultiAngle mechanism to reorient it to three-quarter) and flagged that this was being mislabeled - what was described as "006 then 010" was actually "006, then 006-with-rotation-model." Root cause: the registry had 006 doing double duty (plain edit OR rotation, chosen internally by the reorientation rule) while 010 was scoped narrowly to "dataset shots only" - purpose-based split, not mechanism-based, and it obscured a real capability (chaining) that only surfaced by accident.
- **Change:** Registry and pipeline diagram restructured: 006 = plain Qwen edit only (edit_model, no rotation LoRA) - used for ANY same-facing change in EITHER kit-view or dataset-shot context. 010 = dedicated angle tool (rotation_model + MultiAngle LoRA) - the ONLY workflow that turns the subject, also usable in either context. Chaining (006 output -> 010 input, or hero -> 010 directly) is now a documented first-class pattern, not an incidental discovery. The three-quarter campfire result (010 chained onto the 006 frontal output) judged BETTER than the frontal original - more natural expression, comparable or better identity, kept as the neutral-bucket firelight entry; frontal version retired as an unused alternate rather than a second bucket slot.
- **Result:** Guide's registry, pipeline diagram (both the embedded and standalone copies), and reading-guide prose all updated to the mechanism-based 006/010 split. No change to Rin's own settings - rotation_model/edit_model frontmatter fields already map cleanly onto 010/006 respectively.

### 2026-08-19 (cont.) — Prompt technique: descriptive opening beats directive opening

- **Observed:** User reports (from broader QIE experience, not just this session): opening the change clause with "A woman..." (pure description) outperforms "The same woman..." (a comparison/matching directive) - generalizes the earlier "describe the scene, don't direct the mechanics" finding up one level, from pose detail to sentence structure. Plausible mechanism: the reference IMAGE already carries identity-matching; a redundant textual "match this" instruction competes with the text prompt's actual job (composition/scene) rather than adding anything the image reference doesn't already provide.
- **Change:** Prompt convention updated going forward: change clauses open with plain description ("A woman standing...", not "The same woman standing..."). The identity-comparison instruction stays consolidated in the tail ("Keep the same woman with exactly the same face...") rather than duplicated in the opening clause. Applies to all future 006/010 prompts (rotation and dataset).
- **Result:** Three neutral-bucket shots (outdoor sidewalk, grey studio, office hallway) rewritten under the new convention, ready to run.

### 2026-08-19 (cont.) — Phase 3 domain shots 4-8, 10 banked; rotation-dial unpredictability confirmed

- **Observed:** Shot 4 (laptop/kitchen table) and 6 (bed/laundry) banked clean on first try - both used loose/scene-level pose description rather than joint-level mechanics, reinforcing the shot-3 lesson: describing the scene and letting pose follow naturally outperforms specifying exact body mechanics. Rotation-model batch (5, 7, 8, 10) run together to avoid repeated model swaps: #7 ("shown from the side") over-rotated to full profile; #5 ("slight angle") under-rotated to near-frontal - dial direction is NOT reliably proportional to instruction strength in either direction, confirming (not just repeating) the hot-dial finding from kit-build. #8 ("seen from behind and to the side") returned an unplanned bonus: 3/4-from-behind WITH face visible (looking back over shoulder) rather than the expected faceless back view - reclassified from faceless-whole-image routing to normal FaceID/FaceDetailer routing for 008. #10 (dishes) landed as the genuinely faceless back view originally planned - hair/build checked (no face to check), routes to whole-image 008.
- **Change:** None to spec. 8 of ~10 domain seed shots now banked (1/2, 3, 4, 5, 6, 7, 8, 10 - all pending 008). Confirmed routing split for the eventual polish batch: FaceDetailer route for 1,2,3,4,6,7,8; whole-image route for 10 only.
- **Result:** Domain bucket essentially complete pending #9 (couch/blanket, easy frontal, no model swap needed) plus 008 polish pass on all banked shots (batch this - do not polish one at a time). After #9 and the polish batch: assess neutral-bucket coverage against existing kit assets, then the close-up/edge-angle bucket via MultiAngle elevation/distance commands, then move to Phase 4 (caption + train).

### 2026-08-19 (cont.) — Phase 3 domain shots 1-3 banked; pattern + priority calibration

- **Observed:** Shots 1 (reading, reclined) / 2 (pouring coffee, frontal) / 3 (cardigan+mug, frontal) all pass identity gate. Clear pattern across all three: frontal/eye-level/relaxed pose -> strong likeness; off-angle or downward-gaze conditions are the harder identity regime, independent of task complexity (coffee-pouring succeeded because the FACE stayed in an easy condition, not because the task was easy). Arm-mark seen on shots 1+2, absent on shot 3 - downgraded from "recurring" back to noise per the 2-of-4 ambiguous-zone calibration; no tail change. Pose-precision lesson: shot 3's "elbows on counter" prompt iteration (2 attempts) did not bind; explicit user framing established - for LoRA purposes, POSE AND OUTFIT PER IMAGE ARE NEAR-DISPOSABLE (a LoRA learns what's consistent across the set; face/hair are in every image so they lock in, a given pose/outfit is in 1-3 images so it stays loose/promptable, which is the intended mechanism). Decision: stop iterating on pose precision once identity+domain content are satisfied - banked shot 3 as-is rather than a 3rd/4th prompt attempt. ControlNet discussed as a real fix for pose precision if ever needed, but requires leaving the Qwen pipeline (SDXL-only tool) - not worth the identity-fidelity tradeoff for one dataset shot; reserve for cases needing precise pose across MANY shots.
- **Change:** None to spec. Three domain-bucket images banked (pending 008 polish, not yet run). Priority principle logged for the rest of Phase 3: identity fidelity is the only non-negotiable per image; pose/outfit exactness is not worth multiple re-prompts once "good enough + on-domain" is reached.
- **Result:** 3 of ~10 domain seed shots done. Continue to shot 4 (kitchen table + laptop). All three still need 008 polish before entering the final training set (not yet run - queue for a batch polish pass rather than one at a time).

### 2026-08-19 (cont.) — Phase 3 setup: trigger token + deployment domain decided

- **Observed:** User proposed trigger token `<rintakahashi>` - flagged and corrected: angle-bracket syntax is textual-inversion embedding convention, not a LoRA caption token; standard trainers tokenize brackets as stray characters, diluting rather than protecting the trigger. Corrected to plain `rintakahashi`. Deployment domain selected: home/everyday (apartment - living room/kitchen/bedroom/hallway, casual wear, natural/lamp lighting).
- **Change:** Frontmatter gains trigger_token and deployment_domain. New "Dataset Brief" section added: a SEPARATE, SHORTER invariant tail for dataset generation (identity-only - outfit/background deliberately unpinned so they vary, unlike the kit tail which pins them as constants) + 10-shot domain seed list + bucket targets (50/30/20, ~30 total) + note that kit assets already partially satisfy the neutral bucket + close-up bucket keyed to the MultiAngle elevation/distance vocabulary for free unusual-angle coverage.
- **Result:** Phase 3 ready to execute: generate domain bucket first (10 seed shots, expand with variations as needed) -> curate each through the standard gate -> 008 polish every winner (rendering unification) -> assess neutral-bucket shortfall against existing kit assets -> close-up bucket via MultiAngle elevation commands -> proceed to Phase 4 (captioning + training) once ~30 curated, polished images are in hand.

### 2026-08-19 (cont.) — Phase 2: dual-FaceID validation test

- **Observed:** New workflow (999-DualFaceID, per the diagnostic/utility numbering range) built: Load Image x2 (front + three-quarter face crops) -> Image Batch -> IPAdapter FaceID -> KSampler (Empty Latent, no starting image) -> VAE Decode. Controlled A/B, fixed seed, easy prompt (seated pose, same outfit/background/lighting as every reference): single-reference vs dual-reference produced near-identical output - same face, same expression, same crop, same outfit rendering. Dual-reference gave NO measurable uplift over single on this test. Separately: outfit color drifted on both (grey shirt/dark jeans vs spec'd black/grey) on this far-from-reference pose - independent finding, not a face/identity issue.
- **Change:** None to the character file - this was a pipeline/method validation, not a spec or asset change. Finding recorded for future reference: averaging two FaceID crops is not a reliable likeness booster by itself: it does not compound weakness or strength, it mostly averages. Confirms (does not newly discover) the S6.1 escalation-ladder research: adapter methods cap below full likeness on new poses regardless of reference count; the LoRA remains the intended fix, not a fallback.
- **Result:** Kit assets (photos) judged adequate for their purpose - both crops are clean, correct, and unmistakably her within the adapter's real operating envelope (poses/framing close to source material). Phase 2 CLOSED without a full stress-test run (expected-floor already visible; skipped to conserve effort per user call). Proceeding to Phase 3: dataset campaign. Deployment-domain brief and trigger-token decisions still open before generation starts.

### 2026-08-19 — 007 complete on all known marks. KIT COMPLETE.

- **Observed:** Mask-opacity bug found and fixed (brush applies partial alpha per stroke; SetLatentNoiseMask samples proportional to mask value, so a sub-saturated mask partially protects the region even at denoise 1.0 - the actual cause of "mole survives at denoise 1.0"). Mole removed cleanly from both affected assets (three-quarter portrait crop, three-quarter full-body view): seamless blend, no edge artifact, no ghosting, rest of frame untouched.
- **Change:** Images table recipes updated with the 007 removal step. Anchor-kit checklist: final item ticked. Status: locked -> kit-complete.
- **Result:** PHASE 1 CLOSED. Full kit in hand: hero, front face crop, three-quarter/profile/back full-body views, front + three-quarter portraits (dual FaceID references), all marks resolved, every recipe recorded. Standing lesson banked: check mask-brush opacity/saturation before trusting "denoise 1.0 did nothing" as a wiring bug alone. Next: Phase 2 (light validation pass) -> Phase 3 (dataset campaign, deployment-domain brief + trigger token decisions pending) -> Phase 4 (caption + train) -> Phase 5 (LoRA validation). Housekeeping still queued: character-creator skill rewrite, API:: titling pass across all 8 workflows.

### 2026-08-19 — GENERATION COMPLETE: full kit assembled

- **Observed:** Three-quarter face crop (from the original-model portrait, post-008) passes clean: sharp catchlights, real iris detail, natural texture, correct framing. Best identity reference of the session. Denoise 0.20/0.25/0.30 three-way test on this source showed no meaningful difference (clean, non-degraded source = wide safe denoise band) - operating standard set at 0.20-0.22 regardless, reserving 0.28-0.30 for genuinely degraded sources (provenance-based, not appearance-based judgment).
- **Change:** ALL anchor-kit image generation complete: hero, front face crop, three-quarter/profile/back full-body views, front + three-quarter portraits (three-quarter portrait crop = second face reference). Images table filled with full recipes. Remaining marks (arm mole on the three-quarter portrait/view assets, any others found on zoom) queued for 007.
- **Result:** Kit checklist near-complete pending: (1) user confirms no other marks need 007 beyond the known arm mole, (2) 007 run, (3) final checklist tick -> status: kit-complete. Then Phase 2 (light validation) and Phase 3 (dataset campaign) per the roadmap.

### 2026-08-19 — Generalized finding: 2511 resists ANY orientation change; portrait candidate found

- **Observed:** Same portrait instruction ("head turned slightly") run on 2511 -> frontal (ignored the turn); run on qwen_image_edit_fp8_e4m3fn (original) -> genuine three-quarter, eyes toward camera, SHARP catchlights (unlike the wax-crop failure - this source was never upscale-degraded). Confirms and GENERALIZES the rotation-stage finding: it is not specific to full-body azimuth - 2511's consistency training resists orientation change at any scale, including a small head turn. Residual: mild sheen (old-model finish tax, predicted); one arm mole.
- **Change:** OPERATING RULE (supersedes per-stage framing): use the original model for ANY instruction that reorients her (body or head, any degree); reserve 2511 for instructions that keep her facing the same way (outfit/mark/background edits). Polish risk reassessed: light pass (0.20-0.22) on this UN-degraded source is low-risk (unlike the earlier crop, which restored an already-wax-degraded 4x-upscale). New standing check added to the polish step: zoom eyes specifically post-polish, every time.
- **Result:** Candidate portrait -> light polish 0.20-0.22 -> eye-zoom check -> square crop (crown headroom, chin in) -> ID portrait reference. 007: arm mole. Then all view/portrait assets are in hand; Images table + checklist + kit-complete remain.

### 2026-08-19 — 006 rotation prompt finalized: camera phrase + preserve-line concat

- **Observed:** User appended the tinkering-workflow preserve line via StringConcatenate, adding "hair" to its terms: "{camera phrase} + Preserve face, hair, and body features." Output = strongest view candidate of the project: true three-quarter (~50-60 deg - preserve-line also appears to temper the hot dial), hair loose, identity clear, near-matte, invariants held.
- **Change:** Rotation prompt FROZEN as the concat form; the conditional hair-reminder line is superseded (three preserve-terms replace a descriptive sentence - consistent with short-instruction economics). Ponytail reclassified from "permanent fix required" to seed-frequency drift handled by the preserve term + selection.
- **Result:** View set: three-quarter candidate (this) + profile candidate (prior seed) pending gate; back view remains (dial 180, same recipe). Then the SDXL session: polish + 007 + crops -> Images table -> kit-complete.

### 2026-08-19 — Rotation saga RESOLVED: hybrid recipe frozen (006 final)

- **Observed:** API-JSON audits settled three sessions of theory: (1) the failing 006 graph had NO LoRA loaders in its executed chain - the MultiAngle LoRA had never actually run; (2) the historical "working rotation" used the ORIGINAL qwen_image_edit (pre-2509), which rotates natively - the consistency releases (2509/2511) traded rotation willingness for identity stability, which is why MultiAngle LoRAs exist for them; (3) resolution, VAE-reference, Lightning, and CFG theories all exonerated by the graph diffs. User's working fusion: ORIGINAL base + fal 2511 MultiAngle LoRA @ 1.0 + Lightning v1, camera node phrases, 4 steps / CFG 1 / euler / simple, ImageScaleToMaxDimension 1488, denoise 1.0. Output: best identity-at-angle of the project, near-matte finish. Attribution of rotation (LoRA vs native base) formally unresolved and moot.
- **Change:** 006 recipe FROZEN as above (rotation stage). Ponytail drift hit third occurrence across all rotation configs -> permanent one-line reminder appended via FormattedString: camera phrase + "Keep her hair loose, hanging behind her shoulders." Camera dial noted to run hot (45 renders ~60-75); calibrate per view at the gate. Lesson banked: API-JSON is the only graph testimony that counts.
- **Result:** View set generation proceeds on the frozen recipe, one fixed seed, camera angle per asset (45 three-quarter / 90 profile / 180 back) -> gate -> polish (which also owns any residual original-model finish tax) -> 007 -> kit.

### 2026-08-18 05:40 — Winner-polish stage adopted (post-QIE SDXL FaceDetailer)

- **Observed:** Residual editorial sheen on 2511 output = Qwen's rendering prior; prompt pins structurally cannot remove a model's aesthetic. 
- **Change:** Polish stage added after the curation gate (rin-qwen-polish-pass.mermaid): RealVisXL FaceDetailer, FaceID-wrapped model (hero crop referee, 0.75 / v2 2.0), RAW frozen-block conditioning, denoise 0.28 (0.30 ceiling - texture only, Qwen keeps geometry), guide 384 / max 1024, fixed recorded seed; facial-mark inpaint folded into the same session per policy. Full-body/dataset variant: whole-image img2img at 0.2 first. Strategic role: unifies dataset rendering to the production family before LoRA training.
- **Result:** Winners flow QIE -> gate -> polish -> re-judge vs hero (texture never beats likeness; drift = denoise down) -> Images table with combined recipe. Division of labor now explicit: Qwen owns geometry/identity, SDXL owns finish.

### 2026-08-18 05:10 — Trim experiment: minimal tail holds on 2511 -> tail v3 frozen

- **Observed:** Controlled trim test (2511, anti-beautification pins deleted): finish held - matte skin, natural lips, no styling artifacts; structure held; swept-behind hair honored again. Verdict: v2's pins were compensating for 2509, dead weight on 2511. Marks confirmed pin-independent (appear with and without) - governance moved to the facial-marks policy, not the tail.
- **Change:** Tail v2 -> v3 (trimmed, 2511+ scoped) per the moratorium's own trim rule; anti-beautification clause retired with a do-not-re-add note. Facial-marks policy documented: inpaint-out on kit winners, tolerate on dataset images.
- **Result:** Front-portrait reference candidates: both 2511 portraits (v2 + v3 runs), user picks + facial-mark inpaint on the winner. Remaining queue under v3: three-quarter re-run, profile, back, three-quarter portrait - then kit assembly, status kit-complete, and the Step 7 dataset campaign begins on the same v3 discipline.

### 2026-08-18 04:15 — Community/academic research on QIE drift -> upgrade to 2511

- **Observed:** Drift is documented at every level: 2511's headline enhancements are literally "mitigate image drift, improved character consistency" (2509 was itself a consistency release - two consecutive versions iterating on this axis); community fine-tunes exist targeting the 2509 gap; ComfyUI ships native 2511 templates. ACADEMIC FINDING (identity-preservation literature): long detailed instructions cause progressive deterioration of facial identity in industrial editors including QIE - longer tails make faces WORSE. Our v2 pins worked because they targeted finish drift, but the growing-tail trajectory is a documented dead end for facial fidelity.
- **Change:** edit_model 2509 -> 2511 (drop-in: same graph, new diffusion model file). Tail v2 FROZEN with a growth moratorium: no v3; if 2511 resolves residual gloss natively, TRIM the anti-beautification clause instead. Adopted replicated patterns queued: face crop into image slot 2 (multi-image identity referencing), keypoint ControlNet available for pose-exact dataset work.
- **Result:** First 2511 run = re-run the front-portrait validation (same controlled experiment, better instrument). Judge: finish drift vs v2-on-2509 baseline, structure held, then queue proceeds.

### 2026-08-18 03:40 — Front portrait audit: structure PASSES, beautification drift CONFIRMED -> tail v2

- **Observed:** Controlled same-angle comparison (QIE front portrait vs hero crop): facial STRUCTURE matches - full cheeks present (the three-quarter's slimness was substantially perspective), jawline/eyes/brows/nose/smile all read as her; closest same-angle likeness of the session. Systematic finish drift confirmed (second consecutive occurrence): glossy highlighted skin vs matte reference, glossed pink lips, subtle eye styling; brows slightly raised; small unspec'd mole on left cheek (clean-skin violation). Classification: editing-model beauty prior overriding reference finish - features drift where priors are strong, structure holds.
- **Change:** Invariant tail v1 -> v2 (frozen-content change, logged per rule): added cheek/jawline pins, "natural matte skin with no makeup, natural lip color, no added moles or marks, plain and unretouched". Rule applied: reference carries identity, but drifted features earn explicit text pins after observed repetition - the QIE analog of S3.1 weight rules.
- **Result:** Re-run front portrait AND three-quarter under tail v2; judge finish drift resolved + structure held before any asset enters the kit. Then profile/back/three-quarter-portrait proceed under v2.

### 2026-08-18 03:00 — QIE three-quarter view received; edit instructions formalized

- **Observed:** First QIE output (three-quarter full-body): strongest identity match of the session on assistant audit - cheeks, eye set, nose, hairline all read as the hero; backdrop character carried over. Face slightly soft (expected QIE trait; face-reference role belongs to the dedicated portraits). USER LIKENESS VERDICT PENDING. Turn direction to be checked vs instruction.
- **Change:** Process formalized across guide/template/file: QIE instructions are frozen versioned content - invariant tail = the identity block's successor for edit contexts (compiled from spec, changes logged); per-view change clauses = anchor-variables analog; every kit asset records instruction + seed + input recipe. Frontmatter gains edit_model. Template checklist reworked: turnaround sheet retired in favor of per-view assets.
- **Result:** On user confirm: rin-view-threequarter enters Images with its recipe; queue continues profile (direction-matched) -> back (hair verification) -> two portraits. Character-creator skill rewrite for the QIE route queued as housekeeping.

### 2026-08-18 02:30 — Strategy pivot: Qwen-Image-Edit for view/dataset generation

- **Observed:** User has existing QIE experience; pivoting the view-generation problem to it (HyperLoRA install continues in parallel as the in-SDXL likeness option).
- **Change:** Kit strategy reframed: the single-image character sheet is retired as a generation target - it was an SDXL artifact (one generation needed to share identity). QIE carries identity per-edit from the anchor, so views generate as individual full-resolution images (rin-qwen-edit-views.mermaid), curated per view. Identity block retires from generation duty for QIE paths: the anchor image is the identity; instructions describe the change + pin invariants. Block remains the audit vocabulary.
- **Result:** Per-view queue (three-quarter, profile, back, portrait close-ups) -> curation gate vs hero -> winners are kit angle images + face-crop sources + Step 7 dataset seeds. SDXL remains production family; QIE is the dataset/view factory (family-lock rule, guide Step 7).

### 2026-08-18 01:45 — Community research: likeness ceiling confirmed; escalation ladder adopted

- **Observed:** Research confirms the experience is the documented norm: single-reference adapters cap below perfect match (community comparisons), small-face degradation is universal (matches sheet attempts 1-4), and the professional consensus destination is a trained character LoRA layered with FaceID + ControlNet.
- **Change:** Guide gains S6.1 escalation ladder. Rin's plan: (a) ReActor + restore pass bolted onto the headshot workflow (immediate; non-commercial license noted), (b) HyperLoRA evaluated as FaceID replacement (strongest SDXL adapter-class per comparisons), (c) curated outputs from either route accumulate as the LoRA training set - Step 7 promoted from phase-two option to the explicit likeness endgame for this character.
- **Result:** Headshot curation gate remains the judge at every rung. No further FaceID-only attempts.

### 2026-08-18 01:15 — Attempt 5 likeness REJECTED by user; strategy pivot: headshot-first

- **Observed:** User rejects attempt-5 likeness (assistant scored "close", user scores "different person" - user's bar governs; assistant likeness calibration adjusted accordingly). Root read confirmed: sheets ask FaceID to land identity on ~80px faces then rescue in repair; wrong order of operations.
- **Change:** Pivot to headshot-first reference building (rin-headshot-builder.mermaid): portrait-scale generations (896x1152, head-and-shoulders, NO ControlNet - fewer competing signals), FaceID 0.80 / v2 2.0, light 0.30 detailer with raw conditioning, queue x8 per angle (front + three-quarter), HUMAN curation gate against hero crop. Winners -> square crops -> IPAdapter Batch {hero + front + three-quarter} becomes the standard identity input; sheets retried only after the batch exists.
- **Result:** Decision tree recorded: headshots at portrait scale are FaceID's best-case operating point. If curation finds keepers -> batch -> resume kit. If 16 portrait-scale candidates ALL fail the user's bar at these settings -> that is the adapter ceiling for this face, and the honest fork is InstantID chaining (new install) vs proceeding directly to LoRA training using curated near-misses as candidate data.

### 2026-08-18 00:45 — Turnaround attempt 5: improved (weight_faceidv2 = 2.0) - later overruled, see 01:15

- **Observed:** Single-variable test (ONLY weight_faceidv2 1.0 -> 2.0): cheeks and eye set - the exact reported giveaways - now match the reference in front AND three-quarter panels. Strongest likeness of 5 attempts; confirms diagnosis: the CLIP-vision detail channel ran at half strength through attempts 1-4. Sheet mechanics all pass (views, black tee, full length). Known carryovers (run predates queued fixes): jeans light-wash vs charcoal; possible small cheek mark on front panel - zoom before cropping.
- **Change:** FaceID settings FROZEN for all future generations: weight 0.85 (sheet/multi-subject) or 0.75 (single-subject), weight_faceidv2 2.0 ALWAYS. Recorded as run-settings truth alongside the frontmatter.
- **Result:** Pending user full-res confirm: cut three-quarter angle crop (middle panel) + optional second front crop (panel 3) -> IPAdapter Batch {hero crop + angle crops} becomes the standard identity input downstream. Sheet -> Images table as turnaround asset. Then status -> kit-complete and on to downstream validation (S6: new pose / new outfit / no-template proportions).

### 2026-08-18 00:10 — Turnaround attempts 3-4 + likeness diagnosis + bangs amendment applied

- **Observed:** Attempt 3 (queued fixes): black tee landed 4/4, midriff gone, but jeans went black (weight bleed) and back view lost (facing-signal rule: masking ALL facial dots made facing ambiguous - refined rule: front skeleton keeps eye/nose dots, others clean). Attempt 4 (new 3-view sheet, 1536x1024 latent matching 3:2 hint, FaceID 0.85, (solid black cotton t-shirt:1.3)): tee correct 3/3, views correct (front/three-quarter-profile/back), jeans light-wash vs charcoal hero. LIKENESS: user confirms NOT Rin - cheeks and eye set differ from reference. Fourth consecutive center-part render.
- **Change:** (1) BANGS AMENDMENT APPLIED per anchor-is-truth after 4 confirming renders: hair -> "center-parted", spec + identity block regenerated. (2) Jeans wording -> (slim dark grey jeans:1.1); tee weight can relax to 1.2 now wording works. (3) Likeness plan: PRIME SUSPECT weight_faceidv2 at default 1.0 - the CLIP-vision detail channel (cheeks/eyes = exactly the reported gap); set 2.0. (4) Strategy shift: single-view three-quarter portrait (full canvas, FaceID 0.85/v2 2.0) as the likeness workhorse -> becomes the three-quarter angle crop -> {front + three-quarter} IPAdapter Batch for all subsequent generations. Sheet demoted to documentation asset.
- **Result:** Honest ceiling recorded: adapter stacks deliver ~85-90 percent likeness with wobble; pass bar for kit stage is "close, consistent, recognizable" - full lock is Step 7's LoRA. Escalation if fixes fall short: FaceID->InstantID chain (new install). Next run: single three-quarter portrait, v2 weight 2.0.

### 2026-08-17 23:00 — Turnaround attempt 2: partial (new sheet, new regressions)

- **Observed:** Attempt-1 fixes VERIFIED: keypoint artifacts gone (conditioning rewire + face-free skeletons), panel faces clean and mutually consistent. Likeness improved but not locked (rounder than reference - user verdict pending). NEW/persisting: (1) crop-top + bare midriff + low-rise jeans in 4/4 - fashion-pose sheet pulled styling genre; (2) tee grey 4/4 second attempt; (3) sheet view distribution poor: back/front/front/near-profile, no true three-quarter; (4) bangs absent across 2 attempts + 2 sheets = systematic -> traced to the ANCHOR: hero shows center-ish part, no distinct side-swept bangs - image/spec disagreement that slipped the winner audit; FaceID reproduces the reference, prompt fights it.
- **Change (queued for attempt 3):** positive: full-length fitted t-shirt + confirm/escalate black-tee weight ((solid black cotton t-shirt:1.3) if 1.2 was present and failed); negative guard added: crop top, bare midriff, exposed stomach, low-rise jeans; FaceID weight 0.75 -> 0.85 (sheet context); sheet: merge attempt-1 view layout (front/three-quarter/profile/back) with attempt-2 headless treatment. PROPOSED spec amendment awaiting user hero-zoom confirmation: hair -> "center-parted" replacing "side-swept bangs" (image-agreement rule - anchor wins).
- **Result:** Attempt 3 criteria: Rin-locked front + three-quarter, black full-length tee 4/4, four distinct views, no midriff. Bangs item resolves via spec amendment, not generation.

### 2026-08-17 22:30 — Turnaround attempt 1: FAILED audit (identity lost)

- **Observed:** Sheet mechanics PASS (4 clean panels, scale consistent, poses correct; back view verifies mid-back hair length - oldest open item closed). Identity FAIL: not Rin in any view. White keypoint smudges on all faces. Black tee rendered grey in 4/4 (systematic). Side-swept bangs absent.
- **Change (classification: systematic pipeline defects, not seed luck):** (1) ERRATUM - FaceDetailer conditioning rewired from post-ControlNet to RAW encode outputs; CN-laden conditioning drags sheet-scale skeleton guidance into face crops = the white smudges + corrupted repairs (assistant wiring instruction error, doc corrected). (2) Pose sheet edited: facial keypoint dots DELETED from skeletons (OpenPose form of the S4.2 rule-1 trap - face dots at CN 0.8 fight FaceID); body skeletons kept. (3) cn end_percent 1.0 -> 0.7 (FaceID owns final steps). (4) (fitted black t-shirt:1.2) - observed 4/4 drop. Bangs: re-check after fixes before separate treatment.
- **Result:** Expectation reset: base-gen faces ~50px are checkpoint prior regardless; the detail pass is where identity lands - which is why defect 1 was fatal. Post-fix check: front + three-quarter read as Rin (profile weak, back N/A - inherent, acceptable; kit identity comes from front/three-quarter crops). Tee black in all panels.

### 2026-08-17 21:15 — Face crop v2 ACCEPTED (508x512)

- **Observed:** Re-cut passes full checklist: crown headroom fixed, chin in, hair contained with clean side margins, face ~75-80 percent fill, sharp, identity held. 508x512 accepted as functionally square (4px delta = ~2px center-crop trim, immaterial). Eye area reads clean; pending user confirmation whether mark was inpainted out or ruled as texture (log accuracy only - crop accepted either way).
- **Change:** Kit: face crop linked as the FaceID identity reference. Checklist: square face crop ticked.
- **Result:** Next kit item: turnaround panel (S4.3 graph) - first consumer of the crop. Requires: IPAdapter FaceID Plus v2 stack installed (S2.3), a multi-skeleton OpenPose sheet (front / three-quarter / profile / back), wide latent. Back view is where mid-back hair length finally gets verified. Then 2-3 angle crops from the panel for embedding averaging.

### 2026-08-17 20:50 — Face crop v1 audited: re-cut required

- **Observed:** Crop quality PASS (sharp, artifact-free, identity held, hairline+chin in frame). Geometry FAIL: 0.81 portrait (bbox-shaped, as predicted for detector+crop_factor route), crown nearly touching top edge - CLIP center-square would clip the top of the head. Side edges carry hair strands, so padding would smear - re-cut from source required. Eye-area: faint mark visible at the former beauty-mark location - user to rule at 100% per the 20:20 amendment (mark -> inpaint out on Hero.png FIRST, then re-cut; texture -> leave).
- **Change:** None recorded to kit. Face-crop slot remains open.
- **Result:** Re-cut spec: square (extend shorter axis from source pixels, not padding), slight extra headroom above crown, face ~80%, native pixels, PNG. Fix-the-source rule if inpainting: hero and identity reference must never disagree. Agent note: script cropper (insightface detect -> 1.4x expand -> square from source -> save) preferred over the node chain for exactly this squareness failure.

### 2026-08-17 20:20 — Spec amendment: beauty mark removed (post-lock)

- **Observed:** User decision: drop the beauty mark for this first test character to keep the workflow exercise simple; details to be reintroduced later as a deliberate amendment.
- **Change:** Distinguishing Features emptied (with reintroduction note); identity block regenerated - weighted mark line removed; feature checklist item closed as N/A. The long-pending verification item is retired.
- **Result:** CONSISTENCY ACTION before cutting the face crop: spec now says clean skin, so any distinct mark visible at the spec'd location in Hero.png must be inpainted OUT (config B, tiny mask, denoise ~0.4) - an unspec'd mark in the identity reference would propagate downstream. Faint ambiguous texture: leave. Post-lock block change noted: Hero.png remains canonical; seed+block regeneration fidelity further reduced (already true since build reconciliation). Next: face crop -> turnaround -> angle crops.

### 2026-08-17 20:05 — Hold released + frontmatter correction (resolution)

- **Observed:** User clarified: entire chain generated at 864x1536 (9:16, Image Saver M(1260)) - ratio consistent end to end; my 19:45 aspect estimate of the pre-upscale images was wrong; no stretch exists. REAL finding surfaced: frontmatter recorded resolution 832x1216 but actual pipeline used 864x1536 - the seed-reproduction recipe was silently broken (same seed at a different resolution produces a different image).
- **Change:** Hold released; final-anchor designation restored to Hero.png. Frontmatter resolution corrected to 864x1536 and marked as part of the reproduction recipe.
- **Result:** Recipe is now accurate: identity block + seed 435251544331531 + 864x1536 + frontmatter settings. Note for FUTURE characters only: 864x1536 (~1.33MP) is above SDXL's ~1.0MP training budget; the in-bucket 9:16 resolution is 768x1344 - marginally lower artifact risk. Rin stays at 864x1536 (locked; resolution is recipe). Next: confirm beauty mark at 100%, then cut the anchor kit from Hero.png - square face crop first.

### 2026-08-17 19:45 — Upscale output audited: HOLD before kit-cutting

- **Observed:** Face fully resolved at upscale resolution; identity held; no second detailer pass needed. Apparent small mark near the spec'd beauty-mark location (below outer corner of left eye, viewer right) - user to confirm at 100%. BLOCKING FINDING: aspect ratio changed ~0.68 -> ~0.56 (taller/narrower); figure reads elongated vs Cleanup.png. Pure upscale chain cannot change aspect - resize path introduced either (1) non-uniform stretch (anatomical distortion - disqualifying for anchor) or (2) canvas extension/padding (benign framing change).
- **Change:** None applied. Final-anchor designation and kit-cutting HELD pending resolution.
- **Result:** User to identify resize chain. If absolute-dimension resize present: redo polish from Cleanup.png with uniform scale_by 0.5 (lanczos). If padding/outpaint: accept, proceed to kit. Beauty-mark confirmation rides along.

### 2026-08-17 19:10 — Floor cleanup complete

- **Observed:** Debris specks removed; no mask residue (VAEEncodeForInpaint at denoise 1.0 - earlier partial-denoise artifact resolved); contact shadow preserved; identity/body untouched. Residual: natural paper creasing remains across bottom fifth - judged benign/naturalistic, kept by default (one more masked pass at denoise 1.0 if user wants pristine).
- **Change:** Working hero -> Cleanup.png.
- **Result:** Next: upscale chain (4x-UltraSharp -> 0.5 lanczos -> img2img polish denoise 0.25, seed 435251544331531) -> 1664x2432 final anchor. OUTSTANDING: beauty-mark zoom check still unresolved - verify at 100% on the upscaled final; if absent, config-B inpaint (VAE Encode + SetLatentNoiseMask, ~0.5 denoise, tight mask) BEFORE cutting the face crop.

### 2026-08-17 18:30 — FaceDetailer pass complete

- **Observed:** Output audited vs hero: face repaired (eyes/brows/skin resolved), identity held at denoise 0.4 - repair not replacement. Body/hair/background untouched. Beauty mark still unverifiable at review resolution - user to zoom-check at 100%.
- **Change:** Refinement checklist: FaceDetailer ticked. Working hero -> Face_Detailer.png.
- **Result:** If mark absent at zoom: targeted inpaint (tight mask, (small dark beauty mark:1.3), ~0.5 denoise) BEFORE cutting the face crop. Then: floor-debris cleanup inpaint (mask specks/seams, ~0.4 denoise) -> upscale (4x-UltraSharp -> 0.5 scale -> img2img denoise 0.2-0.3, fixed seed) -> optional light second FaceDetailer at 0.25-0.3 if face is soft at 100% -> cut anchor kit.

### 2026-08-17 18:00 — LOCKED: seed 435251544331531 + build reconciliation

- **Observed:** Seed provided by user. User confirmed build reconciliation to rendered anchor.
- **Change:** locked_seed = 435251544331531; status casting -> locked. Build: "Inverted triangle - broad shoulders, full bust, narrow hips" -> "Slender - slight shoulders, medium bust, narrow hips" (image-agreement rule: anchor is the source of truth; body is prompt-carried downstream). Identity block regenerated - THE BLOCK IS NOW FROZEN in this form; all downstream generations, FaceDetailer prompts, and turnaround prompts use this exact text. Silhouette template retired (proportions carried by the identity block from here).
- **Result:** Reproduction recipe complete: identity block (this version) + seed 435251544331531 + run settings in frontmatter. Next: refinement pipeline on the hero - FaceDetailer ~0.4 (verify beauty mark; inpaint if absent), floor-debris cleanup inpaint, upscale to 2048px+ long edge, then cut the anchor kit: square face crop -> turnaround panel (verify mid-back hair length there) -> angle crops.

### 2026-08-17 17:45 — Winner selected (seed pending) + image/spec audit

- **Observed:** User selected hero candidate (Hero-Full-Body.png). Audit vs spec: (1) build renders straight/slight - inverted triangle (broad shoulders, full bust) did NOT hold; predicted template conflict materialized; (2) trousers are grey jeans, not black trousers; (3) beauty mark unverifiable at full-body distance (check at FaceDetailer crop); (4) hair length unverifiable front-on (verify via turnaround panel); (5) backdrop floor seams/debris - cleanup candidate.
- **Change:** base_clothing amended to match image (black tee, slim grey jeans) - anchor is truth. Build amendment PROPOSED to user (image-agreement rule: body is prompt-carried downstream, so spec must match the anchor or downstream bodies will diverge); awaiting decision. Hero linked in Images. Casting checklist complete. locked_seed pending user (PNG metadata not recoverable from processed upload).
- **Result:** On seed receipt: lock + status change. Next stage: FaceDetailer (denoise ~0.4) -> verify/inpaint beauty mark -> floor cleanup inpaint -> upscale 2048px+ -> cut anchor kit (square face crop first).

### 2026-08-17 17:10 — Spec amendment: body shape (supersedes 16:55)

- **Observed:** User design change: inverted triangle shape - larger bust, small hips. Supersedes the 16:55 medium-bust amendment (bust now folded into the new shape phrasing).
- **Change:** Build attribute -> "Inverted triangle - broad shoulders, full bust, narrow hips" (A.11 name + distribution; shoulder term included because the inverted-triangle silhouette is shoulder-led - bust alone doesn't produce it). Identity block regenerated. body_template swapped rectangle -> female_pose_inverted_triangle.png; template prep required before pre-flight: facial features erased + skull outline erased/enlarged (long hair) on the NEW template - the edits made to the rectangle template do not carry over.
- **Result:** Template/prompt now agree on shape (S3.2). Residual watch item from 16:55 still applies in reduced form: the inverted-triangle template's chest line is drawn modest, so "full bust" may exceed it - if bust reads flat across most of the batch, lower cn_strength to ~0.4 or edit the template chest line. Scorecard for next batch: shoulders clearly wider than hips in ~all candidates (miswire/disagreement check if not).

### 2026-08-17 16:55 — Spec amendment: bust size

- **Observed:** User design change (not drift): medium bust instead of the rectangle default (reads small/flat).
- **Change:** Build attribute + identity block: `straight slim build` -> `straight slim build, medium bust` (A.11 rule: volume always gets a location). No negative changes.
- **Result:** Watch for template conflict in the next batch: the rectangle silhouette template's chest outline is drawn modest, and at cn_strength 0.5 / end 0.55 the prompt usually wins the difference for "medium" - but if the bust reads flat across most candidates, that's the template fighting the prompt (spec/template disagreement), not prompt failure. Fixes in order: lower cn_strength to ~0.4, or edit the template chest line. Batch remains to be re-run per the hair amendment; both changes land in the same re-cast.

### 2026-08-17 16:40 — Spec amendment: hair length

- **Observed:** User design change (not drift): bob -> long, mid-back length. Kept jet black, straight, side-swept bangs.
- **Change:** Spec hair attribute + identity block regenerated. Dependent updates: negative guard `long hair` REMOVED (now contradicts spec) and replaced with `ponytail, braid, bun, updo` (keeps length visible/checkable); anchor variables gain `hair swept behind shoulders` (keeps shoulder line and neckline legible); body template skull outline flips to ERASED/ENLARGED (long-hair exception).
- **Result:** Batch 1 results are STALE for casting purposes - hair framing shifts the rendered face, so candidate scores don't carry over. Re-run pre-flight (template outline edit first), then a fresh batch. Batch 1's validated fixes (jet black, beauty mark weight, earrings guard, kimono guard) all carry forward.

### 2026-08-17 16:05 — Batch 1 feedback (12 images)

- **Observed:** hair dark brown 9/12 (systematic drift); beauty mark absent 11/12 (systematic drop); earrings 5/12 despite guard (guard overridden); kimono 1/12 (origin context bleed, observed bar met); face slightly round 3/12 (per-seed variance).
- **Change:** hair wording `soft black` -> `jet black` (spec + block; wording before weight); beauty mark weighted `(…:1.2)` (systematic drop of a spec'd small feature); negative `earrings` -> `(earrings:1.3)`; added `kimono, yukata, traditional dress` guard (C.3.1 observed). Face roundness: NO prompt change — logged as a selection criterion (pick from the 9 non-round candidates). Status draft -> casting.
- **Result:** Next batch check specifically: hair reads jet black; beauty mark present in majority; earrings gone; no traditional dress. If beauty mark still drops at 1.2, escalate to 1.3 once, then reclassify as inpaint-at-Step-4.

### 2026-08-17 14:30 — Character created

- **Observed:** New character from concept: "Japanese woman, mid-20s, short hair, software-engineer vibe, one distinguishing feature."
- **Change:** Spec filled from ethnicity-guidance Japanese defaults (skin, eyes, hair color, face) with user-directed choices: angled bob, rectangle build, beauty mark as the distinguishing feature. Name adopted as identity token (sanity-check pending). `anime` guard retained in base negative (flagged as extra-important for this origin token); kimono/yukata guard NOT added — observed-only per C.3.1. `long hair` guard added (short-hair spec).
- **Result:** Ready for pre-flight. Defaults accepted unmodified: nose, lips, height — likeliest first-batch corrections.
