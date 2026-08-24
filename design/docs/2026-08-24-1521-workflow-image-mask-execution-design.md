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
- **Character deletion becomes recursive.** `characters.service.ts`'s `remove()` today only deletes the single `<slug>.md` file, which was correct for the old flat layout. With characters living under nested `config/characters/<slug>/` directories (working images, finalized images, and a potential `.safetensors`), deleting a character must remove that entire directory tree — otherwise every deleted character leaves its image data (and, worse, its trained LoRA) behind forever. Triggered by the existing "Delete Character" button/action.
- **No separate cleanup path for an abandoned (never-finalized) character.** Deliberate: a character that's started and never finalized keeps its working files indefinitely — that's the user's data to manage, and the recursive deletion above is the mechanism for reclaiming it (delete the character to reclaim its space). No automatic/scheduled cleanup for abandoned characters is planned.
- **Filesystem path sanitization.** Every value that feeds into a constructed path under `config/characters/` — character slug, phase-binding key, timestamp, seed — must be sanitized before touching the filesystem. Two distinct reasons, not one: (1) correctness/security — a bad value must not be able to escape the intended directory (path traversal), and (2) plain robustness — several of these values (seed, phase-binding key) aren't currently validated against filesystem-illegal characters anywhere, and an unsanitized value reaching `fs.writeFileSync` should fail predictably rather than throw a raw OS error.

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

- **Mapping resolver:** for each `NodeMapping`, resolve `domain` via a lodash `_.get`-style path lookup against the character record (now including the new per-phase-binding image/mask paths), and `static` as a literal. **`computed` is deferred out of this effort** — its resolution semantics (the substitution DSL, and what non-character invocation context like `{{view.changeClause}}` would even draw from) are their own scope and were adding complexity this effort doesn't need. For now every mapped value is either `domain` or `static`. In the Workflow Mapping editor (`workflow-mapping-detail.njk`), the "Computed" option is removed from the `sourceType` select and its "If Computed →" input is dropped from the edit form — not merely disabled, so a user can't select a source type the engine can't execute. The `computed` value stays in `NodeMappingSchema`'s `sourceType` enum (schema-level, unused for now) so existing/future data isn't broken when computed support is eventually built.
- **Submit pipeline:** clone the version's stored raw graph (`workflow-mapping.service.ts` already persists `v${version}.json`) → upload `Current Image`/`Current Mask` via `/upload/image` (`overwrite: true`) → splice returned filenames into the graph → generate a `client_id` → `POST /prompt` → track the returned `prompt_id`. **Acknowledged risk, not solved:** if the process crashes between `POST /prompt` succeeding and the `prompt_id` being recorded, a retry after restart could double-submit the same work to ComfyUI. Accepted as a wasteful-but-not-dangerous edge case (extra GPU time, extra output files) rather than designed around.
- **Completion + pull:** listen on ComfyUI's `/ws` (scoped by `client_id`) for the `executed` event on that `prompt_id` → use the version's `resultOutput` (`{nodeId, outputIndex, label}`) to find the produced filename in the history entry → pull bytes via `/view` → save into the phase-binding's output directory (§4/§6).

## 8a. Failure handling

Failure is a first-class outcome, not an afterthought — the engine needs a defined behavior for every way a run can fail, not just the happy path in §8.

- **Connection failures** (ComfyUI unreachable at submit time, or the `/ws` connection drops mid-run): surfaced distinctly from an execution failure. The failure state offers a **"Check Connection" button that takes the user to `/integration/connection`** (the existing Integration → Connection page, which already has a "Test Connection" action against `comfyui-client.service.ts`), rather than a generic error message.
- **Execution failures** (ComfyUI accepted the prompt but a node errored mid-run): ComfyUI's `/history/{prompt_id}` entry carries error detail (failing node, exception type/message) when a prompt errors — surface that detail to the user whenever it's available, rather than a bare "it failed." Exact presentation TBD at implementation time, but the raw information should not be discarded.
- **Retry.** Any failed run (connection or execution) can be retried by the user — resubmits the same phase the same way a first attempt would (re-uploads the current image/mask under the same stable filename, submits a new prompt). Retrying does not require re-entering anything.
- **"Open in ComfyUI"** (deep-linking the user into ComfyUI's own UI at the failed prompt/node for hands-on debugging) would be a nice-to-have if straightforward, but is **not a committed requirement** — don't block on it.

## 8b. Mapping editor type-awareness

Today the mapping editor (`workflow-mapping-detail.njk`) offers the same domain-field dropdown for every node input regardless of what that input actually expects — `parseWorkflowGraph` (`comfyui-workflow.ts`) treats every non-link input as an untyped widget value, so nothing stops mapping `Current Mask` onto a `KSampler.seed`, or mapping both `Current Image` and `Current Mask` onto the same `LoadImage` node.

- **Confirmed assumption:** masks are always imported as images — a mask is a second `LoadImage` node (same `classType` as the image node, not the dedicated `LoadImageMask` node), whose output is converted/fed into something like `SetLatentNoiseMask.mask`. Both the image node and the mask node in a workflow are indistinguishable by `classType` alone.
- **Scoped to the cheap check only.** `LoadImage.image` is defined by ComfyUI with `{"image_upload": true}` in its `INPUT_TYPES` (confirmed against ComfyUI's own node source/docs) — a purpose-built flag, already reachable via the `/object_info` call `comfyui-client.service.ts` already makes for static-value verification, that reliably identifies "this input wants an uploaded file." The mapping editor should use that flag to **restrict which inputs `Current Image`/`Current Mask` can be mapped onto** to those flagged `image_upload: true` — catching the "mapped to entirely the wrong kind of input" class of mistake.
- **Explicitly not in scope now: distinguishing the image LoadImage node from the mask LoadImage node.** Since both share `classType: LoadImage`, telling them apart requires following graph edges (which node's output reaches `SetLatentNoiseMask.mask` vs. which feeds the main image pipeline) — and `parseWorkflowGraph` currently discards all link-reference inputs, so the mapping model has no graph-topology awareness at all. Making the editor catch "image and mask mapped to the swapped node" is a bigger, structural change (parsing and exposing link edges) and is deferred as a future item, the same way `computed` mapping support was deferred (§10).
- **No heuristic auto-suggestion for which node is image vs. mask — by design, not just deferred.** The whole point of `Current Image`/`Current Mask` as domain fields is that the user explicitly identifies which node is which in the mapping editor — that mapping *is* the translation layer between the app's concepts and the imported workflow's graph. The app deliberately does not try to guess this via filename/title heuristics; the explicit mapping is the mechanism, not a fallback for a missing one.

## 9. Async UI model

- **SSE, not blocking-wait.** Triggering a phase returns immediately with the page rendered in a loading state; a `text/event-stream` connection (per-page-scoped, e.g. `/characters/:slug/<phase>/events`) delivers the completion event.
- **Reload-safe, duplicate-submit-proof.** A page reload while a job is in flight must not lose the pending result or allow a second submission. On (re)connection, the SSE endpoint must emit the *current* known status immediately (still running / done / errored), not only forward future transitions — otherwise a reload racing a just-finished job would leave the page stuck.
- **Job state store: LMDB** (new dependency) — an embedded, memory-mapped, persistent key-value store, chosen over a bare in-memory `Map`/`Record` specifically because run history is wanted in the future (LMDB was chosen over SQLite/LevelDB/Keyv for read-speed; the user is fine adding the dependency since it directly drives UI correctness). Job state survives process restarts, so a stale "in progress" state can be reconciled against ComfyUI's `/history/{promptId}` rather than trusted blindly forever.
- **Completion event is a plain signal for single-result phases**, not a payload carrying the result — the client does the equivalent of `location.reload()` on completion, consistent with the rest of this app's plain form-post/redirect pattern (no client-side framework or DOM patching exists today). **Casting batch is the exception to this rule** — see §9a.

## 9a. Progress feedback

ComfyUI's `/ws` carries real step-level progress, not just a done signal, and it's worth surfacing rather than leaving every run as an undifferentiated spinner. Confirmed message set per `prompt_id`:

- `execution_start` — the prompt has begun
- `executing` — `{node, prompt_id}`; fires as each node starts. **`node: null` is the authoritative "this prompt is fully finished" signal** — more reliable than watching for `executed`, which fires per *output* node and a workflow can have more than one
- `progress` — `{value, max, node, prompt_id}` — step-level progress for whatever's currently sampling (e.g. `value: 12, max: 28` mid-`KSampler`)
- `executed` — `{node, output, prompt_id}` — an output node produced something, carries the filename info used for the pull step (§8)
- `execution_cached` — nodes skipped because their inputs didn't change (not surfaced to the UI, informational only)
- `execution_error` — `{prompt_id, node_id, exception_message, ...}` — feeds directly into §8a's failure handling

**Decision: build real progress bars (`value`/`max`), not just coarse status labels.** This requires a translation layer between the one server-side ComfyUI websocket connection and the per-page SSE streams: it maps each incoming `{value, max, node, prompt_id}` to whichever character/phase/sub-job owns that `prompt_id`, and the LMDB job record is extended to hold live progress state (not just a done/not-done boolean), so a page reload mid-run can redraw the progress bar where it actually was rather than resetting to an undifferentiated "loading."

**Single-result phases** (e.g. `003-Cleanup`): one `prompt_id`, its `progress` events relay straight through as a step counter / percentage on the loading-state page.

**Casting batch is the harder, and the more valuable, case — this is where the SSE payload decision below actually matters:**
- Following the N-separate-prompts decision (§6), the LMDB record for one casting-batch run is a parent run with **N independent sub-job entries** (one per seed), each carrying its own status (`queued`/`running`/`done`/`error`), its own `{value, max}` progress, and its own resulting file path once pulled.
- The page renders a grid of N tiles. Each tile independently transitions — spinner → progress bar → thumbnail — as *its own* events land, rather than the whole grid waiting on the slowest candidate.
- **Decision: the SSE payload carries real per-tile data for casting batch** — which seed/candidate, its status, its progress, and its thumbnail path once done — so the page can patch just that one tile in place. This is a deliberate exception to §9's "plain signal, client reloads" rule: reloading the entire page every time any one of 16 candidates finishes would be wasteful and visibly janky. Single-result phases keep the simple reload behavior; casting batch does not.
- **Bonus, low additional cost:** ComfyUI only actually executes one prompt at a time by default — the rest of the N sit pending in ComfyUI's own queue. `/queue` (already wrapped by `getQueueStatus()` in `comfyui-client.service.ts`, currently only as running/pending counts) returns the pending list with per-item detail, so extending that read gives each tile a "queued: position 4 of 12" state for free, not just running/done.
- **Restart-reconciliation scales with N.** §9's "reconcile a stale job against `/history/{promptId}` on restart" now means reconciling N individual `prompt_id`s for one casting-batch run, resuming whichever sub-jobs hadn't finished when the process went down.

## 9b. ComfyUI connection resilience

The server holds one persistent websocket connection out to ComfyUI (what §9a's translation layer listens on) — separate from, and underneath, the browser's SSE reconnect behavior (§9). That connection needs its own reconnect strategy:

- **Retry/backoff, capped at 5 attempts.** On disconnect, the server retries with backoff up to a maximum of 5 attempts before giving up and surfacing the connection as down (feeding into §8a's connection-failure handling).
- **Manual reset in the UI.** Once the retry budget is exhausted, the UI shows a control to reset the retry count and attempt reconnection again — the user isn't stuck waiting for an automatic retry that's already given up, and isn't forced to restart the whole app to recover once ComfyUI comes back.
- Exact backoff curve (interval growth between the 5 attempts) TBD at implementation time — this section fixes the attempt cap and the manual-reset requirement, not the precise timing.

## 10. Deferred / explicitly out of scope for this effort

- **Caption authoring** (`.txt` files alongside `finalizedImages/*.png`) — the Kohya-style paired caption file is illustrative of what the folder is *for*, but writing/editing captions is a separate future piece.
- **LoRA training itself** — this app never trains a LoRA; it only checks for the resulting `.safetensors` file's presence.
- **`computed` mapping support** (§8) — removed from the mapping editor and unsupported by the resolver for this effort; every mapped value is `domain` or `static` for now.
- **Graph-edge-aware image/mask mapping validation** (§8b) — the mapping editor gets a cheap `image_upload`-flag-based restriction now, but distinguishing which of two same-`classType` `LoadImage` nodes is the image vs. the mask (by tracing downstream link edges) is a bigger structural change and is future work.
- **ComfyUI's own `output/` directory accumulation** (§3 covers `input/`; the same "no delete API" constraint applies to whatever the mapped workflow's own `SaveImage`/similar nodes write to `output/`, which this app never asked ComfyUI to clean up). Accepted as an open gap this effort does not close — likely needs its own separate system (e.g. a periodic external sweep) rather than a fix folded into this work.
- Nothing here migrates existing on-disk characters to the new nested directory layout — not needed pre-MVP.

## 11. Next step

Split this into implementation-sized pieces (storage/directory layout + migration-free schema changes, mask editor, output archival incl. casting, execution engine incl. mapping resolver, SSE/job-tracking layer) rather than landing it as one change.
