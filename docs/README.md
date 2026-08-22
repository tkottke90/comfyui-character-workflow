# README — SDXL/Qwen Consistent-Character Pipeline

**Read this first, in any new chat in this project, before doing anything else.** You (Claude) are picking this project up with no memory of how it got here. This file exists to make that survivable in five minutes instead of an hour of re-derivation — and to stop you from re-learning lessons that already cost real debugging time once.

## What this project is

The user (tkottke, Arch Linux, AMD Ryzen AI Max+ 395 "Strix Halo," 64GB unified memory, ROCm, ComfyUI) is building a **repeatable pipeline for creating consistent AI characters** — the same person, recognizable, across any pose/outfit/scene — for use in image generation and eventually agent-driven workflows. The end goal per character is a **trained LoRA**: a small model file that lets the character be generated from a text prompt alone, in any scene, without reference images or adapter machinery.

Two artifact types exist in project knowledge:

1. **The guide** (`sdxl-consistent-character-anchor-guide.md`) — the general-purpose technical reference. Model-agnostic principles, install instructions, the full 8-workflow ComfyUI pipeline, every pitfall found and its fix. **This is the document to search first for "how do I do X" questions.**
2. **Character files** (e.g. `rin-takahashi-test-character.md`) — one per character. Spec, frozen prompts, exact settings, and an append-only log of every decision made about that specific character. **This is the document to search for "what did we decide about character Y" questions.**

If asked to work on a *specific* character, read that character's file in full before doing anything — it is the source of truth for that character, and it will often contradict the guide's generic defaults in ways that are deliberate (a locked seed, a character-specific prompt tail, a settings override). The character file always wins for that character.

## The architecture, in one paragraph

Two model families do different jobs, on purpose: **SDXL is the production family** — the checkpoint the final LoRA targets, fast, well-tooled, runs the adapter stack (FaceID) and the numbered ComfyUI workflows. **Qwen-Image-Edit is the view/dataset factory** — an instruction-following image editor that preserves identity from a reference photo natively, used to generate the multi-angle kit and (later) the LoRA training dataset, because it does this far better than SDXL+adapters ever could. LoRAs are locked to their model family; datasets are not — that asymmetry is why two families coexist. A third family, **Wan 2.2**, is scoped for a later motion/video phase and not yet built.

## The pipeline (8 numbered ComfyUI workflows + a 9xx utility range)

Read the guide's §5 "Workflow registry" table and the `rin-full-pipeline-overview.mermaid` diagram for the full picture. Short version:

| # | Job |
|---|---|
| 001 | Seed hunt (casting) |
| 002 | Face repair, pre-identity (bare model, denoise 0.4 — no face crop exists yet) |
| 003 | Background/artifact cleanup — **replace mode** (`VAEEncodeForInpaint`, denoise 1.0) |
| 004 | Upscale (4× model → 0.5 → low-denoise polish) |
| 005 | Face crop (mandatory once the hero is final — feeds everything downstream) |
| 006 | Qwen view/pose generation |
| 007 | Targeted inpaint — **modify mode** (`VAE Encode` + `SetLatentNoiseMask`, partial denoise) |
| 008 | Winner polish — post-Qwen restyle toward the production checkpoint's look (FaceID-wrapped FaceDetailer) |
| 999 | `DualFaceID` — utility/diagnostic range (9xx), not part of the linear sequence |

**003 vs. 007 are not interchangeable** — this is the single most re-discovered bug in the project's history. 003 erases and rebuilds (destructive, needs denoise 1.0). 007 preserves and lightly reworks (needs partial denoise). Mixing the wrong node with the wrong denoise value silently no-ops or leaves a visible patch. If an inpaint "does nothing at denoise 1.0," also check the mask isn't just partially-opaque (some mask editors paint with partial alpha per stroke — a single click can leave a sub-saturated mask that barely samples even at full denoise).

## Standing lessons — read before touching FaceID or Qwen rotation

- **`weight_faceidv2` defaults to 1.0 and that default is a trap.** It's the CLIP-vision detail channel (cheeks, eyes, skin character) — separate from `weight` (facial geometry). Left at default, likeness plateaus at "right bone structure, generic face" no matter how high `weight` goes. Set it 1.5–2.0.
- **Reorientation (turning a character's body or even just her head) is a model choice, not a prompt-wording problem.** Newer, consistency-tuned Qwen-Image-Edit releases (2509, 2511) resist orientation change — that's the tradeoff they made for better identity stability. An older/base Qwen-Image-Edit release plus a multi-angle LoRA (fal's 2511 MultiAngle is the current community standard) handles rotation; the newer release handles same-facing edits (outfit, marks, background) with better identity fidelity. Don't spend cycles rephrasing a rotation prompt on the wrong model — it structurally cannot work, no matter how it's worded.
- **Long, heavily-pinned prompts measurably degrade facial identity in instruction-editing models.** This cuts against instinct: the fix for a drifting attribute is often a *shorter*, more targeted prompt plus the right model, not a longer one with more pins. Add a pin only after the same drift is observed on two separate generations; drop pins that a model upgrade made redundant.
- **Multi-reference FaceID (batching 2+ face crops) is not a reliable likeness booster.** Tested empirically (Rin, Phase 2) — batched vs. single reference produced near-identical output on a pose-different generation. It doesn't hurt, but don't assume it helps; A/B it before relying on it.
- **When something looks wired but doesn't work, get the actual API-format JSON export of the ComfyUI graph before theorizing further.** Screenshots and descriptions of a graph are not reliable evidence — nodes that appear connected on canvas can be muted, absent from the executed graph, or feeding the wrong consumer. Every genuinely mysterious bug in this project's history was solved by reading the exported JSON directly, and none were solved faster any other way.
- **Adapter methods (FaceID, HyperLoRA, etc.) have a real ceiling** — they do not reliably produce "unmistakably her" on poses/lighting far from the reference photos, no matter how they're tuned. This is expected, not a bug to chase. It's *why* the LoRA is the project's actual destination rather than an optional upgrade — see the guide's §6.1 escalation ladder.

## Project state (update this section — see below)

As of this writing: one test character, **Rin Takahashi**, status `kit-complete`. Her full anchor kit (hero, dual face-crop references, three-quarter/profile/back views, two portraits) exists and is validated. Phase 2 (adapter-quality sanity check) is closed. **Next step is Phase 3: the dataset campaign** — generating 25–40 varied images via Qwen for LoRA training. Two decisions are open and block that phase from starting: Rin's **deployment domain** (biases the dataset toward where she'll actually be used) and her **trigger token** (the word that invokes her in a trained-LoRA prompt).

The character-creator Claude Skill (separate from this project's files — lives in the skill system) has been rewritten to match this pipeline and should be current as of the last skill-housekeeping pass. If it looks out of sync with this README or the guide, the guide and character files are authoritative; flag the mismatch to the user rather than silently trusting the skill.

## How to keep this file useful

**This README will go stale.** It was accurate as of the session that wrote it and will not update itself. When project state changes significantly (a character reaches a new status, a new character starts, the pipeline gains or loses a workflow, a standing lesson gets superseded), **update this file and re-upload it** — don't let it silently drift from what the character files and guide actually say. If this README ever contradicts the guide or a character file, trust the guide/character file; they're the source of truth and this is only a map.

If you're an agent/instance reading this cold: search project knowledge for the guide and the relevant character file next, in that order, before responding to whatever the user actually asked.
