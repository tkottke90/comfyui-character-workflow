# Character Image Management — Design

## Problem

Character images (working files produced during Refinement, Targeted Fix,
Views, and Casting, plus finalized picks) exist on disk but are only ever
visible a few at a time, embedded in the page that produced them. There is
no way to:

- browse the full set of images belonging to a character
- delete an individual working file
- send an existing image into Refinement or Targeted Fix as input, without
  re-uploading it from disk
- reference an existing image when starting a new pose/perspective in the
  Views workflow

Refinement and Targeted Fix currently only accept a new image via file
upload (`data-file-upload` → `POST /:slug/images/:phaseBindingKey`), even
though the character may already have a suitable image sitting in another
phase binding's folder or in `finalizedImages/`.

## Current architecture (relevant parts)

- No database. Each character is a folder containing a Markdown file with
  YAML frontmatter (`src/schemas/character.schema.ts`,
  `src/services/characters.service.ts`).
- `src/services/character-images.service.ts` treats each character's
  directory as the source of truth for images:
  - Working files live under a folder per `phaseBindingKey` (e.g.
    `refinement_face_detail`, `refinement_cleanup`, `refinement_upscale`,
    `targeted_fix`, `casting_batch`), named
    `<timestamp>-(image|mask)[-n].<ext>`.
  - `finalizedImages/` holds curated, sequentially-numbered images.
  - `listImages(slug)` returns `{ finalized, working }`.
  - The "current image" for a phase binding is **derived**, not stored: it
    is the newest working file in that folder. `mapping-resolver.ts`
    (`resolveCurrentImageOrMask`) performs this same lookup at job-submit
    time, and a job's output is stored back as a new working file in the
    same folder — this is how the Refinement chain threads images forward
    without explicit references.
  - `promoteToPhaseBinding` already exists as the primitive for "copy an
    existing image into a phase binding as a new working file." Today it
    has exactly one caller: the casting-lock route, which promotes the
    winning casting candidate into `refinement_face_detail`.
- `GET /:slug/images` already exists as a route returning `listImages()` as
  JSON, but nothing in the UI consumes it today.
- The Views/Polish pages (`view_generation.njk`, `polish.njk`) have full
  CRUD for view metadata (status, seed, imagePath, rating) and their
  phase-binding keys (`view_generation_same_facing`,
  `view_generation_turn`) are registered in the workflow registry, but
  neither page has a "Run" form wired to `ExecutionService` — generation
  for views is done manually outside the app today and the result is
  recorded via the metadata form. **Wiring up execution for Views is out
  of scope for this project.**

## Design

### 1. Backend: generalize the promote and add delete

- **Generalize `promoteToPhaseBinding`** so it can be called from any route
  with a source image reference (`{phaseBindingKey, filename}` for a
  working file, or a finalized/casting reference) and a target
  `phaseBindingKey`. Behavior is unchanged: it copies the source file in as
  a new timestamped working file in the target folder. This becomes the
  single mechanism behind both "choose from library" (Section 2) and any
  future promote-style action — no new concept, just widening who can call
  the existing primitive.
- **New route**: `POST /:slug/images/:phaseBindingKey/:filename/delete` —
  deletes one working file.
  - Idempotent: deleting an already-gone file is treated as success, not
    an error.
  - Path containment: validated the same way existing working-file access
    is validated, so a crafted filename can't escape the character's own
    directory.
  - The route determines (and the delete-confirmation UI surfaces) whether
    the target file is the *current* image for its phase binding (i.e. the
    newest file in that folder) so the confirmation dialog can show an
    extra warning. The server does not block the delete either way.
  - `finalizedImages/` and casting candidates are **not** deletable through
    this route — they keep their existing finalize/casting-specific flows.
- **Extend `GET /:slug/images`** into the data source for both the new
  gallery page and the in-page picker, tagging each image with its source
  (`phaseBindingKey` for working files, `finalized`, or `casting`) so
  consumers can filter/badge without re-deriving it.

### 2. New Images gallery page

- `GET /:slug/images` becomes a real page (in addition to serving as the
  JSON data source above), linked as a new tab from the character overview
  alongside Refinement / Targeted Fix / Views.
- **Layout**: a single flat grid across all three image sources (working
  files from every phase binding, finalized images, casting candidates),
  sorted newest first. Each tile carries a small badge naming its source
  (e.g. "Refinement · Cleanup", "Targeted Fix", "Finalized", "Casting"). A
  filter control above the grid narrows to one badge at a time. This
  generalizes the existing casting-batch grid pattern
  (`casting_batch.njk`, `data-casting-tile`).
- The tile that is currently the "current image" for its phase binding
  carries a visual marker, since deleting it triggers the extra warning.
- **Per-tile actions** (working-file tiles only):
  - **Delete** → confirmation dialog; adds the extra warning copy when the
    tile is the current image for its phase binding (see 1 above).
  - **Send to Refinement** / **Send to Targeted Fix** → links to that page
    with a query param identifying the source image (e.g.
    `?fromImage=<phaseBindingKey>:<filename>`). Nothing is committed by
    following this link — see Section 3.
  - **Send to Poses** → same pre-select link pattern, pointed at
    `view_generation.njk`'s image-input field. Since Views has no
    execution wiring, this only places the image reference for the
    existing manual/metadata flow; no job is submitted.
- Finalized and casting tiles show their badge but no delete/send-to
  actions here — clicking them deep-links to their existing dedicated
  pages (finalize curation / casting batch), which already own those
  actions.

### 3. In-page "choose from library" on Refinement / Targeted Fix

- Next to the existing upload form on each panel, add a "Choose from
  library" toggle that expands an inline panel (collapsed by default).
  It lists scoped candidates: finalized images plus current/recent working
  files from *other* phase bindings (not this phase's own folder, since
  that's already shown as the current image above the form).
- **Selecting a tile commits immediately** — it calls the generalized
  promote primitive (Section 1) to store the picked image as a new working
  file for this phase binding, exactly like choosing a file in the upload
  form already does today. The panel then collapses and the existing
  "current image" preview updates. There is one commit code path,
  regardless of how the user got to this panel.
- **Gallery hand-off**: when the page loads with `?fromImage=...`, the
  panel auto-expands and scrolls to/highlights the referenced tile, but
  does not auto-commit. The user still clicks it to confirm — this is what
  makes the gallery's "send to" action feel like "arrives pre-selected,
  not yet committed."
- If the referenced image in `?fromImage=` no longer exists (deleted since
  the link was generated), the page loads normally with the panel in its
  default collapsed state — no error.
- The mask editor's own upload mode is unaffected; this only changes the
  image-input side of these pages.

## Error handling & edge cases

- **Double-delete**: idempotent, treated as success.
- **Delete of the current image**: confirmation dialog names the
  consequence (which file becomes current afterward, or that none will be
  left); the delete itself is not blocked. Job submission already handles
  "no current image" as a normal validation error.
- **Promote/pick failure** (I/O error, or source file removed between
  opening the picker and clicking a tile): show an inline error in the
  panel without collapsing it, so the user can retry or pick another tile.
- **Stale `?fromImage=` link**: falls back to default collapsed state, no
  error surfaced.
- **Path containment**: promote and delete both validate the resolved
  source/target path stays inside the character's own directory.

## Testing

- **Unit tests** (`character-images.service.ts` patterns): generalized
  promote (working→working, finalized→working, casting→working); delete
  (normal file, current-file case, idempotent re-delete, rejected
  cross-character path).
- **Route tests** (`characters.views.ts` patterns): delete route (success,
  idempotent, current-image flag in response); gallery page renders all
  three sources with correct badges/filters; `?fromImage=` round-trip on
  the Refinement/Targeted-Fix GET routes.
- **Manual verification**: open a character with images across several
  phases; open the gallery and filter by badge; send an image to
  Refinement via the gallery link and confirm the panel auto-expands and
  highlights without committing; click it to confirm it commits and
  becomes the current image; delete a non-current image; delete a current
  image and confirm the warning copy; confirm "send to poses" lands on
  `view_generation.njk` with no job submitted.

## Explicitly out of scope

- Wiring up a "Run" / execution path for Views/Polish generation. This
  project only gets an existing image into the right spot on that page;
  actually submitting a pose-generation job to ComfyUI is a separate,
  future project.
- Any change to finalize/casting-specific delete or curation flows — the
  gallery links out to them rather than duplicating their actions.
