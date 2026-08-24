# Workflow Image/Mask Mapping & ComfyUI Execution — Design Doc

**Status:** Draft — decisions captured from design discussion, not yet broken into implementation issues
**Date:** 2026-08-24
**Author:** t.kottke90@gmail.com (via design conversation with Claude)

## 1. Problem

The Workflow Mapping editor (`Integration → Workflow Mapping`) lets a user import a ComfyUI workflow export and map each node input to a `character.*` domain field, a computed value, or a static value. It has no way to map a node's input to "whatever image/mask the user is currently working on for this character" — there's no domain field for it, no storage backing it, and (as this discussion surfaced) no way to actually *run* a mapped workflow against ComfyUI at all. What started as "add two dropdown options" turned out to require a working execution pipeline underneath them. This doc captures the full design as worked out, before it's split into implementation-sized pieces.

## 2. Current state (as of this discussion)

- `src/comfy/domain-fields.ts` has no mask field and no per-phase "current image" concept — only a single global `uploaded_image.hero` stage-input that nothing reads or writes.
- `src/services/comfyui-client.service.ts` only implements `/system_stats`, `/queue`, `/object_info`, `/free` — no `/upload/image`, `/prompt`, `/history`, `/view`, or `/ws`. There is no execution engine; the workflow-mapping feature is config-only today.
- `character.images` (`ImageAssetSchema { label, path, notes }`) is populated by a hand-typed text field, not a real upload. Characters have no `uploadsDir`, unlike the Templates library (`templates.service.ts`), which already has a real `storeImage()` + `/uploads/templates` static mount that this design reuses the pattern of (not the code — characters get their own nested layout, see §4).
- `castingCandidates` (`{ seed, note, createdAt }`) has no image file backing it at all.
- No mask-drawing UI exists anywhere; `polish.njk`'s "brush size" is a bare number input with no canvas.
- ComfyUI itself has **no delete endpoint** for uploaded files (confirmed via web search — core `server.py` routes have no `DELETE` counterpart to `/upload/image`; only third-party custom nodes like `ComfyUI-api-tools`/`ComfyUI-fileCleaner` add one). This shaped the overwrite-in-place decision in §3.

## 3. ComfyUI file handling

- ComfyUI requires a two-step upload-then-reference flow: `POST /upload/image` (multipart, `type: input|temp|output`, optional `subfolder`, `overwrite`) returns `{name, subfolder, type}`; the returned filename is then set as the literal string value of a `LoadImage` node's `image` input inside the `POST /prompt` graph. There is no inline-bytes submission.
- **Dual Load Image, not alpha-channel-encoded.** Image and mask are two separate physical files, each loaded by its own `LoadImage` node — matching the shape of the imported `003-Cleanup` export. Rejected the single-RGBA-with-mask-in-alpha-channel approach.
- **Stable, overwritten filenames.** Since ComfyUI has no delete API, every (character, phase-binding, role) uploads to the *same* filename with `overwrite: true` rather than a new file per run, so ComfyUI's `input/` directory doesn't grow unbounded. No upload history is kept on the ComfyUI side — only locally (§4).

## 4. Local storage & directory layout

Pre-MVP — **no migration path needed**; existing flat `config/characters/<slug>.md` characters are not a concern.

```
config/
  config.yaml
  characters/
    <slug>/
      <slug>.md
      <slug>.safetensors          # presence = "LoRA exists" (see §7)
      finalizedImages/
        hero.png
        hero.txt                  # caption — deferred, see §10
        <img-001>.png
        <img-001>.txt
      <phase-binding-key>/        # one directory per phase binding, e.g. casting_preflight/,
        ...                       # refinement_cleanup/, targeted_fix/, polish/, casting_batch/, etc.
```

- **Keyed by phase-binding key, not workflow-slot id.** `001-Seed` alone has two phase bindings (`casting_preflight`, `casting_batch`) that are two different pages with different jobs — storage follows the phase binding (`workflow-registry.ts`'s `phaseBindings[].key`), not the slot id.
- **Working files are timestamped; finalized files are not** — a promotion system. Working files accumulate (`<timestamp>-image.<ext>`, `<timestamp>-mask.<ext>`) inside their phase-binding directory for as long as the character is in progress. Nothing is deleted while the character is active.
- **Data model:** reuse `ImageAssetSchema`, extended with an optional `maskPath`, one entry per phase-binding (`{ label: <phase-binding-key>, path, maskPath?, notes }`).
- **Finalize = promotion + cleanup, triggered by LoRA existence.** "Finalize" happens once a LoRA has been trained for the character. The app doesn't train the LoRA itself — it **checks for `<slug>.safetensors` on disk** (file-presence check, not a tracked boolean), since training happens externally (e.g. kohya_ss) and this app has no business knowing how to do it. Finalizing promotes the working files that fed the LoRA into `finalizedImages/` and then **deletes every non-finalized working file for the character** ("sweeping up the sawdust" — those assets are no longer needed once the LoRA replaces them).
- **`finalizedImages/`** is the LoRA training dataset pool backing `character.dataset.{imagesCount, targetMin, targetMax}` — `hero.png`/`hero.txt` is a special-cased always-present entry, everything else is sequentially numbered.
- A new endpoint is needed to list all of a character's images grouped by finalized/non-finalized, ordered by timestamp.

## 5. Mask input — polygon editor

- Editable-vertex polygon canvas: starts as a single shape (e.g. a square), user can add/remove/drag vertices, minimum 3 vertices. Multiple independent shapes are out of scope for v1.
- Rasterized output: white polygon(s) at 100% opacity on a black background, sized to exactly match the current image's dimensions (this is *drawn* to match, sidestepping most dimension-mismatch cases by construction).
- **Two mutually exclusive input modes**: (A) draw in-app, or (B) upload a pre-made mask file — uploading disables the drawing tools. **Switching modes discards whatever was in the other mode** (no dual-state preservation).
- **Validation:** `image-size` (new dependency) checks an uploaded mask's pixel dimensions against the current image's. On mismatch: show an error and **disable the ability to trigger the phase**. The user can upload a different file or clear the upload to revert to the canvas.

## 6. Output archival

Most output-producing phases already have a 1-per-key shape in the schema and can reuse the exact same phase-binding-directory + working/finalized convention as inputs, just holding a produced result instead of an uploaded one: `005-FaceCrop` (`FaceCropSchema.path`), `006-Edit`/`010-Angle` (`ViewSchema.imagePath`, one per view key), `008-Polish` (`Polish`, one per view key).

**`001-Seed`'s casting batch is the exception** — it produces N candidates per run (8–16), not one current file. `castingCandidates` gets real file backing, named by seed (`seed-<value>.png`) rather than timestamp, and **all candidates are retained until a winner is picked** (no overwrite-in-place for this one).

**Casting batch submits N separate prompts, not one batched prompt.** Rather than one `/prompt` submission with `EmptyLatentImage.batch_size = N` (which would produce one `SaveImage` node writing N files under a single history entry), the engine submits N independent `POST /prompt` calls — one per seed (`startSeed + i`) — each its own `client_id`/`prompt_id` pair, pulled individually via `/view` as each completes. This is the ComfyUI-preferred approach per our research into character-building workflows; batching the outputs together is explicitly avoided. This means the execution engine (§8) needs a "batch of jobs" mode: the casting-batch job tracked in LMDB is a set of N sub-jobs, not a single `prompt_id`. Still open: whether the SSE/UI reveals candidates incrementally as each of the N finishes, or waits for all N before updating the page — not decided yet.

## 7. Casting winner → next steps (this session's final decision)

When a casting winner is picked:
- The user is redirected to the character's main/overview page (not kept on the casting page).
- The **Specification**, **Pre-flight**, and **Casting & lock** checklist phases (`src/checklist/definitions.ts`) are marked fully checked off — every item under `specification.*`, `preflight.*`, and `casting.*` in `emptyChecklist()`'s keyspace, not just `casting.winner_selected`/`casting.seed_locked`.

## 8. Execution engine

Building the engine turned out to be required, not deferrable, because pulling generated images back from ComfyUI needs a reliable way to correlate a `/history` entry with a specific character/phase run — which only works cleanly if this app is the thing that submitted the prompt.

- **Mapping resolver:** for each `NodeMapping`, resolve `domain` via a lodash `_.get`-style path lookup against the character record (now including the new per-phase-binding image/mask paths), `static` as a literal, and `computed` via a **simple substitution DSL** (e.g. `{{character.identityBlock}}, {{view.changeClause}}`-style token replacement — exact grammar TBD at implementation time).
- **Submit pipeline:** clone the version's stored raw graph (`workflow-mapping.service.ts` already persists `v${version}.json`) → upload `Current Image`/`Current Mask` via `/upload/image` (`overwrite: true`) → splice returned filenames into the graph → generate a `client_id` → `POST /prompt` → track the returned `prompt_id`.
- **Completion + pull:** listen on ComfyUI's `/ws` (scoped by `client_id`) for the `executed` event on that `prompt_id` → use the version's `resultOutput` (`{nodeId, outputIndex, label}`) to find the produced filename in the history entry → pull bytes via `/view` → save into the phase-binding's output directory (§4/§6).

## 9. Async UI model

- **SSE, not blocking-wait.** Triggering a phase returns immediately with the page rendered in a loading state; a `text/event-stream` connection (per-page-scoped, e.g. `/characters/:slug/<phase>/events`) delivers the completion event.
- **Reload-safe, duplicate-submit-proof.** A page reload while a job is in flight must not lose the pending result or allow a second submission. On (re)connection, the SSE endpoint must emit the *current* known status immediately (still running / done / errored), not only forward future transitions — otherwise a reload racing a just-finished job would leave the page stuck.
- **Job state store: LMDB** (new dependency) — an embedded, memory-mapped, persistent key-value store, chosen over a bare in-memory `Map`/`Record` specifically because run history is wanted in the future (LMDB was chosen over SQLite/LevelDB/Keyv for read-speed; the user is fine adding the dependency since it directly drives UI correctness). Job state survives process restarts, so a stale "in progress" state can be reconciled against ComfyUI's `/history/{promptId}` rather than trusted blindly forever.
- **Completion event is a plain signal**, not a payload carrying the result — the client does the equivalent of `location.reload()` on completion, consistent with the rest of this app's plain form-post/redirect pattern (no client-side framework or DOM patching exists today).

## 10. Deferred / explicitly out of scope for this effort

- **Caption authoring** (`.txt` files alongside `finalizedImages/*.png`) — the Kohya-style paired caption file is illustrative of what the folder is *for*, but writing/editing captions is a separate future piece.
- **LoRA training itself** — this app never trains a LoRA; it only checks for the resulting `.safetensors` file's presence.
- Nothing here migrates existing on-disk characters to the new nested directory layout — not needed pre-MVP.

## 11. Next step

Split this into implementation-sized pieces (storage/directory layout + migration-free schema changes, mask editor, output archival incl. casting, execution engine incl. mapping resolver, SSE/job-tracking layer) rather than landing it as one change.
