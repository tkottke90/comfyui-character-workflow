# Style Registry — Design

## Problem

Checkpoint, sampler, scheduler, CFG, and steps interact as a set — many
checkpoints only look right with a particular sampler/scheduler/CFG/steps
combination, and users currently re-enter these values by hand on every
character (`checkpoint`, `sampler`, `scheduler`, `cfg`, `steps`,
`style` — art-style tag — in `src/schemas/character.schema.ts:133-139`).
There's no way to save a known-good combination and reuse it. A "Style"
registry lets a user define these as a named, reusable preset once, then
apply it to any character from the spec builder.

## Current architecture (relevant parts)

- No database. Every persisted resource is a directory of Markdown files
  with YAML frontmatter (`gray-matter`), validated with `zod` on read and
  write.
- `src/services/templates.service.ts` is the closest existing analog: a
  flat (non-nested) collection of named records, each its own
  Markdown+frontmatter file, with `create`/`get`/`list`/`update`/`remove`,
  `slugify()`-derived slugs, and a `TemplateConflictError` on duplicate
  names. This is the pattern the Style registry follows.
- `src/services/comfyui-client.service.ts:97-112` (`getObjectInfoChoices`)
  fetches valid choices for a given ComfyUI node classType + input name
  from ComfyUI's `/object_info` endpoint. It's already used for the
  checkpoint list on the Integration page
  (`src/views/integration.views.ts:47-73`, `CheckpointLoaderSimple.ckpt_name`).
  There is no existing sampler/scheduler choice source.
- The Character spec builder (`src/templates/characters/spec.njk`,
  routes in `src/views/characters.views.ts`) is a single form covering
  attributes, checkpoint/sampler/scheduler/cfg/steps/art-style, body
  template, negative prompt, distinguishing features, and identity block
  preview, all part of one `CharacterSchema` (`src/schemas/character.schema.ts`).
- Sidebar nav (`src/templates/partials/sidebar.njk:16-50`) is a flat,
  hardcoded list of `<a>` links (Characters, Templates, Integration), each
  highlighted via a `section` template variable.

## Data model

New `src/schemas/style.schema.ts`:

```ts
StyleSchema = {
  name: string (min 1),
  description: string (default ''),        // short description
  artStyle: string (default ''),            // free text, e.g. "photorealistic", "anime"
  checkpoint: string (min 1),
  sampler: string (min 1),
  scheduler: string (min 1),
  cfg: number (min 1, max 20),
  steps: number (min 1, max 100),
  createdAt: string,
}
StyleRecord extends StyleSchema { slug: string }
```

`CharacterSchema` gets one new field:

```ts
styleSourceName: string (default '')   // display-only label, e.g. "Cinematic Portrait"
```

This is **not** a live reference — it's a snapshot label set at the moment
a style is applied, shown next to the checkpoint/sampler fields for
context ("from: Cinematic Portrait"). It is never re-synced if the source
style is later edited or deleted, and the character's own
`style`/`checkpoint`/`sampler`/`scheduler`/`cfg`/`steps` fields remain
independently editable after being pre-filled.

## Design

### 1. Backend: Style storage service

- `src/services/styles.service.ts`, modeled directly on
  `templates.service.ts`: one Markdown+frontmatter file per style in a
  flat `styles/` directory, `matter.stringify()` to write, `matter()` to
  read, validated against `StyleSchema` on every read/write.
- `create`/`get`/`list`/`update`/`remove`, slug via the existing
  `slugify()` (`src/lib/character-logic.ts`).
- Name uniqueness enforced the same way templates do: a duplicate `name`
  on create throws `StyleConflictError` (mirrors `TemplateConflictError`).
- `remove` is unconditional — no reference tracking against characters.
  Since applying a style only ever copies values onto a character at
  selection time, deleting a style has no effect on characters that
  already used it; it simply stops appearing in the dropdown.

### 2. Backend: sampler/scheduler choice sourcing

- Extend the existing `getObjectInfoChoices` usage pattern to also read
  `KSampler.sampler_name` and `KSampler.scheduler` from ComfyUI's
  `/object_info`, alongside the already-working
  `CheckpointLoaderSimple.ckpt_name` lookup. All three Style-form
  dropdowns (checkpoint, sampler, scheduler) are populated live from
  ComfyUI, consistent with how the Integration page already sources
  checkpoints — no hardcoded lists to maintain or drift out of sync.

### 3. New Styles page and nav entry

- `src/views/styles.views.ts` + `src/templates/styles/{library,form}.njk`,
  following the shape of `templates.views.ts` /
  `templates/library.njk` / `templates/upload.njk`:
  - **Library page** (`GET /styles`): list of existing styles (name,
    description, checkpoint/sampler/scheduler/cfg/steps summary), each
    with Edit/Delete actions, and an "Add Style" entry point.
  - **Add/Edit form** (`GET/POST /styles/new`, `GET/POST /styles/:slug/edit`):
    Name, Description, Art Style (free text), Checkpoint (dropdown,
    ComfyUI-sourced), CFG (number, 1–20), Steps (number, 1–100), Sampler
    (dropdown, ComfyUI-sourced), Scheduler (dropdown, ComfyUI-sourced).
    Client- and server-side validation via `StyleSchema` (min/max on
    cfg/steps, required name/checkpoint/sampler/scheduler).
  - **Delete** (`POST /styles/:slug/delete`): removes the style
    unconditionally per Section 1.
- `src/templates/partials/sidebar.njk`: new `<a>` for "Styles" alongside
  Characters/Templates/Integration; new views set `section: 'styles'` the
  same way `characters.views.ts`/`templates.views.ts` already do.

### 4. Character spec builder integration

- `spec.njk` gets a new "Style" dropdown near the existing
  checkpoint/sampler/scheduler/cfg/steps/art-style fields: options are all
  registered style names, or a disabled "No Styles Available" option when
  the registry is empty.
- Selecting a style and submitting is handled by the existing spec-update
  POST flow in `characters.views.ts`: server-side, the selected style's
  `artStyle`, `checkpoint`, `sampler`, `scheduler`, `cfg`, and `steps`
  values are copied onto the character's own fields (`style`, `checkpoint`,
  `sampler`, `scheduler`, `cfg`, `steps`), and `styleSourceName` is set to
  the style's `name`. This is a one-time pre-fill, not a binding — the
  user can immediately hand-edit any of the copied fields afterward, and
  nothing about the character re-syncs if the style changes later.
- The Style dropdown itself is not persisted as a selection — only its
  effect (the copied field values plus `styleSourceName`) is saved to the
  character's frontmatter.

## Error handling & edge cases

- **Duplicate style name**: `StyleConflictError` surfaced as a form
  validation error on the Add/Edit Style page, same UX as the existing
  Template name-conflict handling.
- **CFG/steps out of range**: rejected by `StyleSchema` validation
  (min 1/max 20 for CFG, min 1/max 100 for steps) both client-side (input
  `min`/`max` attributes) and server-side (Zod).
- **No styles registered**: Style dropdown in the spec builder shows a
  single disabled "No Styles Available" option; applying is a no-op.
- **Style deleted after being applied to a character**: no effect on the
  character — its copied fields and `styleSourceName` label remain as-is
  (label is purely historical/display, not a live lookup).
- **ComfyUI unreachable when loading the Style form**: checkpoint/sampler/
  scheduler dropdowns fall back to the same empty/error state the
  Integration page's model dropdowns already use in that case — no new
  error handling pattern needed.

## Testing

- **Unit tests** (`test/styles.service.test.ts`, mirroring
  `test/templates.service.test.ts`): create, duplicate-name conflict,
  list, get, update, delete, using `fs.mkdtempSync` per test.
- **ComfyUI client tests**: sampler/scheduler `getObjectInfoChoices` calls
  covered alongside the existing checkpoint-choices test, if such a test
  file exists for `comfyui-client.service.ts`.
- **Route tests** (`characters.views.ts` patterns): applying a style via
  the spec-update route copies the expected fields and sets
  `styleSourceName`; re-editing the copied fields afterward is unaffected
  by the style; deleting an applied style doesn't change the character.
- **Manual verification**: add a style with the full field set; confirm
  it appears in Characters > spec builder's Style dropdown; select it and
  confirm checkpoint/sampler/scheduler/cfg/steps/art-style populate on the
  character and `styleSourceName` displays; hand-edit one field and
  confirm it stays edited; delete the style and confirm the character is
  unaffected and "No Styles Available" appears once the registry is
  empty again.

## Explicitly out of scope

- Any live/bound relationship between a character and the style it was
  created from (no re-sync on style edit, no cascading delete
  protection).
- A fixed/curated vocabulary for the Art Style field — it stays free text,
  matching the existing character-level `style` field's shape.
- Per-style image/thumbnail upload (unlike Templates, which support an
  image) — not requested and not part of the described workflow.
