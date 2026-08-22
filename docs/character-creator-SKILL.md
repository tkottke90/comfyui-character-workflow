---
name: character-creator
description: Guide the user through creating a new consistent SDXL character and iterating on it from batch feedback - producing a filled-in character file (spec, checklist, log) and paste-ready identity block + negative prompts for ComfyUI, then updating both as results come in. Use this skill whenever the user wants to create, design, spec, or start a new character for image generation, mentions an "identity block", "character file", "anchor image", "seed hunt", or wants prompts for a consistent person/character in Stable Diffusion, SDXL, or ComfyUI - even from a rough concept like "a tall French detective in her 40s". ALSO use it whenever the user reports back on generation results for an existing character - feedback like "the batch came back", "her hair keeps coming out brown", "she has earrings in half of them", "I picked a winner", or shares generated images of a character in progress - so the character document and prompts get adjusted and the change logged.
---

# Character Creator

Create a new character for the SDXL consistent-character pipeline. The output is two things: a **character file** (the source of truth, built from the bundled template) and a **paste-ready first prompt** (identity block + anchor variables + negative) for the ComfyUI seed hunt.

## Bundled resources — when to read what

- `assets/character-template.md` — the character file template. Always used; copy it as the base of the new file.
- `references/feature-vocabulary.md` — prompt-tested vocabulary for every attribute (skin A.1, hair A.3/A.4, head A.5, face A.6, eyes A.7/A.8, ears A.9, nose A.10, body shapes A.11), with reliability tiers. Read it before filling attributes; pull terms from it rather than inventing phrasing, because frozen wording must be prompt-tested wording.
- `references/ethnicity-guidance.md` — read whenever the character has a stated ethnic or national origin. Provides per-origin feature defaults (C.3), per-origin negative guards (C.3.1), and the principles that prevent stereotype traps (C.1). Its feature rows are starting defaults the user adjusts, not requirements.

## Known pitfalls (read once, before generating anything)

- **FaceID Plus v2 has two weights, and the default on the second one is a trap.** `weight` controls facial geometry; `weight_faceidv2` controls the CLIP-vision detail channel — cheek fullness, eye character, skin. Left at its default of 1.0, likeness caps at "generic person with the right bone structure" no matter how high `weight` goes, because the detail channel that actually carries recognizability is running at half strength. Set it 1.5–2.0 for anything meant to look like the reference, not just shaped like it.
- **Two inpaint modes exist and using the wrong one silently no-ops.** Replacing a region (`VAEEncodeForInpaint`) needs denoise 1.0 — anything lower leaves a visible patch of the erased original. Modifying a region in place (`VAE Encode` + `SetLatentNoiseMask`) works at partial denoise. Mixing the destructive node with a partial denoise produces exactly the "nothing changed" symptom.
- **A partially-opaque mask brush silently under-masks.** Some mask editors paint with partial alpha per stroke; a single click can leave a mask well under full white, and inpainting samples proportional to mask value — so a region can look masked and still barely change even at denoise 1.0. If an inpaint appears to do nothing, check the mask's actual opacity before suspecting the graph.
- **Reorientation is a model choice, not a prompt-wording problem.** See step 8.3 below.

## Workflow

### 1. Capture the concept

Get the character concept from the user (a sentence is enough to start). Then interview for what's missing — but only what's missing. The universal attributes below are ALL required; a blank attribute is an unfinished design that the model will fill differently on every seed, which is inconsistency by construction:

sex/presentation, apparent age, ethnicity/origin, skin tone, face shape, eyes (shape + color), eyebrows, hair (color + style + length), nose, lips, build/body shape, height impression, base clothing for the anchor.

Interview efficiently: propose defaults and let the user correct, rather than asking thirteen open questions. If an origin is stated, read `references/ethnicity-guidance.md` and pre-fill that row's defaults as the proposal. For everything else, pick sensible values from `references/feature-vocabulary.md` and present the full proposed spec for one round of corrections.

Also ask two design questions:
- **Distinguishing features** (scars, tattoos, piercings, birthmarks): each needs a precise location. Note expected difficulty — small marks usually prompt fine; tattoos with specific designs will need inpainting. If a feature won't be visible in a neutral standing pose, flag it (adjust pose, plan a close-up panel, or accept it).
- **Name**: does the user want the character's name in the prompt as an identity token? It biases toward a distinct face (useful against same-face syndrome) but becomes frozen prompt content. If yes, advise the user to sanity-check the token later (generate `photo of <name>` alone for 2-3 seeds; one recurring recognizable face means the name belongs to a real person - pick another).

### 2. Fill the spec

Rules while filling:
- Every term comes from the feature vocabulary. One term per attribute; synonym rotation between attributes later is drift.
- **Body shape must be phrased as name + distribution** (see A.11): `diamond shaped figure, narrow shoulders, medium bust, soft waist, wide full hips` — never bare `curvy` without where the volume goes. If the user has silhouette ControlNet templates, the phrase must match the template they'll use.
- Hair length decides a downstream note: long/voluminous hair means the silhouette template's skull outline must be erased or enlarged; short flat hair means keep it. Record which applies in the file.
- Face shape words are weak alone — always pair the shape with 2-3 concrete geometry cues (`oval face with strong jawline and high forehead`).
- Weak-tier attributes (eye shape, ears) still get specified, with the expectation set that enforcement is FaceDetailer/inpainting, not the prompt.

### 3. Compile the identity block

Translate the spec into the identity block in this canonical order (order = attention priority; do not rearrange):

```
photo of a <origin> woman/man [named <Name>], <age>, <skin>,
<face shape + geometry cues>, <eye shape + color>,
<eyebrows>, <hair color + style>,
<nose>, <lips>, <each distinguishing feature with location>,
<body shape name + distribution>, <height>, <base clothing>
```

- **No weights in the first block.** Weights are fixes for observed, repeated drops across a batch — the user adds them later, ceiling 1.4, and features that fail at 1.4 belong to inpainting, not bigger weights.
- The block is FROZEN once written. Tell the user this explicitly: never paraphrase it between generations; changes go through the file's log.

### 4. Compile the negative prompt

Base guards, always:

```
cartoon, illustration, 3d render, cgi, painting, anime, deformed,
extra limbs, extra fingers, bad hands, fused fingers, blurry,
watermark, text, logo, cropped, out of frame, dramatic lighting, harsh shadows
```

Then add **spec-contradiction guards** — checkpoint defaults that fight this specific spec (not generic quality words):
- No jewelry in spec → `jewelry, necklace, earrings`
- Short hair spec → `long hair`; long hair spec → `ponytail, braid, bun, updo` (keeps length visible)
- Origin-token guards from ethnicity-guidance C.3.1: add *(documented)* guards preemptively (sexualization guards for the flagged tokens; regalia for Indigenous tokens); all other origin guards only when a batch shows the bleed. Never guard a garment the spec includes.

### 5. Assemble the seed-hunt prompt

Identity block + anchor variables (variables stay OUTSIDE the frozen block):

```
<identity block>,
standing in neutral A-pose, arms slightly away from body,
[hair swept behind shoulders,]        <- long hair only
full body visible head to toe, (plain white background:1.2),
studio lighting, shot on Canon EOS R5, 85mm f/1.4
```

Include recommended run settings with the prompt: photoreal SDXL checkpoint (RealVisXL V5 default), 832x1216, DPM++ 2M Karras, 28 steps, CFG 5, batch_size 1, queue x8-16 with per-run seed increment. The white-background weight is a validated stability choice (dense e-commerce photo genre), not decoration.

### 6. Write the character file

Copy `assets/character-template.md` and fill it:
- Frontmatter: name, status `draft`, dates, run settings, all universal attributes. `locked_seed: null`.
- Distinguishing Features section: each feature with location + difficulty note.
- Identity Block section: the frozen block, plus the negative under "Negative guards".
- Checklist: leave unchecked except Specification items now satisfied.
- Log: one initial entry — timestamp, "Character created", noting concept source and any defaults the user accepted unmodified (those are the likeliest first-batch corrections).

Save as `characters/<name-slug>.md` (or where the user prefers) and deliver the file plus the paste-ready prompt pair in the reply.

### 7. Set expectations for the first batch

Close with a short brief on what happens next, so the first results are read correctly:
- Run ONE pre-flight generation first (fixed seed): check framing, background, no watermarks, attributes present — fix systematic problems before batching. Do not judge the face from one image.
- Then the batch: 8-16 queued runs, seed increment. Score candidates against the spec's universal attributes; select on face and build quality first — small features are cheap inpaints later.
- Same face on every seed is expected (checkpoint attractor). It's fine if the user likes the face; if not, offer the variance levers: name token, temporary descriptor reduction (cast, then re-derive geometry from the winner), or casting on a different checkpoint.
- When a winner is chosen: write `locked_seed` into the frontmatter, set status to `casting` -> `locked`, and log it.

### 7.1 Winner audit (do this BEFORE locking, not after the kit surfaces a problem)

Before writing `locked_seed`, walk the winning image against the spec attribute by attribute — not just "does she look right," a literal checklist pass. This step exists because it was skipped once on a real character and cost five downstream generations: the spec said "side-swept bangs," the winning image showed a plain center part, and the mismatch wasn't caught until a hairstyle kept failing to render four separate times before anyone thought to check the anchor itself rather than the prompt.

For every attribute, confirm the image agrees with the spec. Any mismatch is the **image-agreement rule**: the winning image is about to become the character's permanent visual truth, and the spec must match what was actually generated — not the other way around. Amend the spec attribute (and identity block) to match the image, log it as a locked-content amendment, and move on. Do not try to "fix" the image to match a spec it never actually satisfied; the pixels are the source of truth from this point forward, more than the text ever was.

### 8. Build the anchor kit (after lock — workflows 005–008)

The anchor kit is a set of images, not the hero alone. Default path (Route B — an editing model like Qwen-Image-Edit generating each view directly from the hero, identity carried by the reference image rather than by a shared generation):

1. **005 — Face crop.** Square, tight, crown-to-chin, face ~80% of frame, cut from the finished hero. Mandatory, not optional — this crop is the identity referee for every step after it (FaceID reference, editing-model reference image).
2. **Compile the invariant tail** into the Edit Instructions section: a short natural-language restatement of the spec's constants ("Keep the same woman with exactly the same face, the same `<hair>`, the same `<base clothing>`, on the same `<background>`. Photorealistic photograph."). This is the identity block's equivalent for editing-model prompts — frozen the same way, amended through the Log the same way. Keep it SHORT: long, heavily-pinned instructions measurably degrade facial identity in editing models. Add a pin only after an attribute has drifted on **two separate generations** — never pre-emptively, and drop a pin if a model upgrade makes it redundant.
3. **006 — Generate each view.** Per-view change clause + the frozen tail. **The reorientation rule governs which model/LoRA combination to use, and it is a model choice, not a prompt-wording problem:** any instruction that changes which way she's facing — a full body turn OR just a head turn — needs a model built for reorientation (`rotation_model` in the frontmatter: typically an earlier, less identity-locked edit model plus a multi-angle LoRA). Consistency-tuned recent models resist turning even on a small ask; no amount of rephrasing fixes this, because it isn't a wording problem. Same-facing edits (outfit swap, mark removal, background change) use `edit_model` instead — the newer, more identity-stable model, since nothing needs to reorient. Minimum viable view set: three-quarter, profile, back (verifies hair length), front portrait, three-quarter portrait (a second face-crop source).
4. **008 — Polish every winner before 007.** Editing models carry their own rendering habits (commonly a "beautified" sheen) that a curated winner should shed before it enters the kit — a light FaceDetailer pass (denoise 0.20–0.22 on a clean source; regenerate rather than push denoise higher on a badly degraded source) restyles toward the production checkpoint's photographic look. **Always zoom the eyes after this step** — they are the most detail-sensitive region and the first place a too-aggressive polish shows.
5. **007 — Targeted fixes**, on POLISHED winners only. Small masked edits — remove an unwanted mark, add a small spec'd feature. The prompt describes what fills the mask, never the character. Tight mask for additions, generous mask for removals, denoise as the dial (0.35–0.45 remove, 0.45–0.55 add).
6. **Second face crop.** Cut a square crop from the three-quarter portrait winner too. Two references — front + three-quarter, averaged — produce a meaningfully more stable identity for every downstream generation than one ever does.

`status: kit-complete` once every checklist line is ticked.

## Iteration loop (user reports batch results)

When the user comes back with feedback on generations — text descriptions, counts, or pasted images (review images directly against the spec's attributes if provided) — do NOT simply edit the prompt to match the complaints. Classify each feedback item first, because different failure types route to different fixes:

**Classification and routing:**

| Feedback pattern | Classification | Fix |
|---|---|---|
| Attribute wrong in MOST/ALL images ("hair came out brown in 9 of 12") | Systematic drift | Wording first (more specific vocabulary term, e.g. `soft black` -> `jet black`), weight second — `(term:1.1-1.3)` only if wording already specific. Ceiling 1.4. |
| Spec'd small feature MISSING in most (beauty mark, scar) | Systematic drop | Weight it `(feature:1.2)` — this is exactly what weights are for. If already at 1.4 and failing: stop, mark it "inpaint at Step 4" in Distinguishing Features, remove the weight. |
| Attribute off in SOME images ("face too round in 3 of 12") | Per-seed variance | NO prompt change. It becomes a selection criterion: pick winners from the candidates that got it right. Tell the user this explicitly — editing prompts against minority variance overfits to noise. |
| Unspec'd elements appearing (jewelry, costume, scenery) | Bleed | Add/strengthen negative guard. Origin-token bleeds (kimono, regalia...) now meet the "observed" bar from ethnicity-guidance C.3.1 — add the guard. An existing guard being overridden can be weighted in the negative: `(earrings:1.3)`. |
| "I don't like her face" (but consistent) | Attractor rejection | Not a prompt-detail fix. Offer variance levers: name token (or different name), descriptor reduction re-cast, different casting checkpoint. |
| Burned/oversaturated output | Settings, not prompt | Diagnose in order: CFG above checkpoint range, cumulative weights, wrong VAE. Update frontmatter `cfg` if changed. |
| "Actually, make her hair longer / change X" | Deliberate spec amendment | Legitimate — but distinct from drift-fixing. Update the spec attribute AND identity block AND any dependent items (long hair: add `hair swept behind shoulders` variable, swap `long hair` guard for `ponytail, braid, bun, updo`, flag skull-outline change on the template). |
| Framing/background/watermark problems | Pre-flight failure | Fix anchor variables or base negative; remind that these should be caught on the single pre-flight image before batching. |
| View generation (006) fails the SAME way on EVERY seed (e.g. a requested turn never happens, an unrelated feature always appears) | Structural failure | NOT a prompt problem. Suspect: wrong model for the instruction (reorientation rule — check `rotation_model` vs `edit_model`), a missing/muted node, wrong file loaded. If the user can export the workflow's API JSON, read the actual executed graph rather than reasoning about it from memory or a screenshot — a node that looks present on canvas can be absent from what actually ran. |
| View generation drifts on SOME seeds only (a style changes, a pose varies) | Seed-luck variance | Same rule as casting per-seed variance: no prompt change, reroll and select. Only escalate to a prompt/model fix after the SAME specific defect repeats across separately-seeded attempts. |

**Then, in every iteration pass:**

1. Apply the routed edits to the character file: attributes, identity block (regenerate the block from the spec — never patch it ad hoc, so spec and block cannot diverge), negative guards, frontmatter (`updated` date, any settings changes).
2. Append a log entry — this is not optional; an undocumented change to frozen content is drift by definition:
   ```
   ### <timestamp> — Batch <N> feedback
   - **Observed:** <each finding with its count, e.g. "hair brown 9/12">
   - **Change:** <each edit, old -> new, with its classification>
   - **Result:** <what the next batch should show; which items are now selection criteria vs prompt fixes>
   ```
3. Deliver the updated file + fresh paste-ready positive/negative pair + a one-line "check these specifically next batch" list (the items just changed).
4. Guard against churn: if the same attribute is being adjusted for the third time, say so — the checkpoint may simply not render that term reliably, and the honest options are a different term family, a weight, accepting inpainting, or a different checkpoint.

**Winner selection:** when the user picks a candidate — record `locked_seed` in the frontmatter, set `status: locked`, tick the Casting and Lock checklist items, log the selection (seed, what tipped the choice, which small features need inpainting), and brief the next stage: FaceDetailer pass, feature inpainting, upscale, then the anchor kit.

## Tone and boundaries

Character design is the user's call — propose, don't dictate; when their preference contradicts a guideline (e.g., they insist on weighted first prompts), state the tradeoff once and follow their choice, logging it. On ethnicity: table rows are checkpoint-rendering defaults, not descriptions of real people; present them as adjustable starting points and never resist a user's deviation from a phenotype default.
