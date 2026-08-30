# Manual Workspace — Generation Page — Design

## Problem

`/manual/:id/workspace/generation` (added in the [nav-tabs and manual
workspace shell design](2026-08-30-nav-tabs-and-manual-workspace-shell-design.md))
is currently a static "Generation coming soon." placeholder. Unlike the
character pipeline — where every workflow's inputs are pre-mapped to a
fixed `DOMAIN_FIELDS` catalog via `NodeMapping` — manual sessions attach an
arbitrary ComfyUI workflow with no field mapping at all (per the
[Configuration workflow form design](2026-08-30-manual-workspace-configuration-workflow-form-design.md):
"manual workflows are run as-is, not through the character-integration
mapping pipeline").

The Generation page needs to give a user a place to (1) define whatever
input fields their particular workflow needs, (2) tweak those fields'
values, (3) trigger a generation, and (4) review past results — without
that workflow having gone through any node-mapping step first. The fields
defined here are the "domain fields" a future Configuration-page mapping
screen (out of scope for this spec, analogous to the character-integration
workflow-mapping screen) will bind to actual workflow node inputs.

## Current implementation

- `GET /:id/workspace/generation` (`src/views/manual.views.ts:61-67`)
  already loads the session and renders `manual/workspace/generation.njk`
  — currently just a "coming soon" placeholder `<div>`.
- `ManualWorkflowSessionSchema` (`src/services/manual-workflow.service.ts:27-40`)
  has no field-definition or generation-record concept yet — only
  `workflowFile`/`workflowSource` (the attached raw graph),
  `images: ImageSchema[]` (currently a passive schema field — nothing
  writes to it yet), and `sessionNotes`.
- `ImageSchema` (`src/services/manual-workflow.service.ts:11-18`) is
  `{ id, size: {width, height}, parent?, createdAt, final, nsfw }` — no
  writer exists for it on manual sessions (confirmed: no `addImage`-style
  method on `ManualSession`/`ManualWorkflowRegistry`).
- The character pipeline's equivalent image writer,
  `CharacterImagesService.storeWorkingFile` (`src/services/character-images.service.ts`),
  decodes a data URL via `parseDataUrl` (`src/lib/data-url.ts`) and writes
  it to a per-character directory — but it does **not** compute
  width/height (`WorkingFile` records carry no `size` field). The
  `image-size` package (already a dependency) provides `imageSize(buffer)`
  for that, currently used only in `src/lib/mask-validation.ts`.
- `addSession` (`src/services/manual-workflow.service.ts:79-108`) already
  creates an `assets/` subdirectory per session — staged but unused so
  far.
- `ManualWorkflowRegistry.updateSession(id, partial)`
  (`src/services/manual-workflow.service.ts:134-145`) validates and
  persists a partial update against `ManualWorkflowSessionSchema`; the
  allowed partial shape is `UploadSessionSchema`, a `.pick()` of specific
  fields (`workflowName`, `description`, `workflowFile`, `workflowSource`,
  `images`, `sessionNotes`).
- Reusable UI: `ui.card()`/`ui.button()`/`ui.mono()` macros
  (`src/templates/macros.njk`), the shared click-to-expand modal
  (`src/templates/partials/image-viewer.njk` + `public/image-viewer.js`,
  triggered via `data-viewer-trigger`/`data-viewer-group`), and the
  responsive tile-grid pattern established by `casting_batch.njk`/
  `images.njk` (`grid grid-cols-2 sm:grid-cols-4 gap-4`, `aspect-[3/4]`
  tiles).
- `src/templates/partials/manual-workflow-form.njk` establishes the
  upload-vs-select radio-panel pattern (client-side `FileReader` → hidden
  data-URL field for upload; `<select>` for pick-existing) that this spec
  reuses for image-type field values.

## Design

### Data model

`ImageSchema` (`src/services/manual-workflow.service.ts:11-18`) gets one
new field, `filename: z.string()` — it currently stores only `id` and
`size`, which is enough for the (still unbuilt) Images gallery to *list*
images but not enough for anything to *serve* one, since the on-disk name
includes an extension (`<id>.<extension>`) that isn't otherwise
recoverable from `id` alone. This is a required fix, not new scope: the
Outputs/image-field work below is the first thing that actually needs to
read an image back off disk. `ImageSchema` is also exported (it currently
isn't) so the new controller code below can validate against it directly.

Two new arrays on `ManualWorkflowSessionSchema`
(`src/services/manual-workflow.service.ts`), stored the same way as the
existing `images`/`sessionNotes` — plain JSON on disk, no new persistence
layer. `ManualFieldSchema` and `ManualGenerationSchema` are exported
alongside `ImageSchema` for the same reason:

```ts
const ManualFieldSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  key: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Key must be alphanumeric/underscore only'),
  type: z.enum(['text', 'number', 'boolean', 'image']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  createdAt: DefaultDateSchema,
  updatedAt: DefaultDateSchema
});

const ManualGenerationSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  status: z.enum(['queued', 'running', 'done', 'error']),
  fieldValuesSnapshot: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  imageId: z.string().optional(),
  error: z.string().optional(),
  createdAt: DefaultDateSchema,
  completedAt: z.coerce.date().optional()
});
```

Added to `ManualWorkflowSessionSchema`:

```ts
fields: z.array(ManualFieldSchema).default([]),
generations: z.array(ManualGenerationSchema).default([]),
```

`fields` (but not `generations`) is added to `UploadSessionSchema`'s
`.pick()` list, since field CRUD writes through `updateSession` in this
spec, but nothing writes `generations` yet (see "Actions" below) — it
exists purely so the Outputs section has a real, typed, currently-empty
collection to render against, rather than the follow-up execution spec
having to design the page around it retroactively.

`ManualSession` (the class, same file) gets `fields`/`generations`
instance properties assigned in the constructor, matching the existing
`images`/`sessionNotes` pattern.

A field's `value` default on creation/type-change: `''` (text), `0`
(number), `false` (boolean), `null` (image — no image selected). Keys
must be unique within a session; enforced server-side on create and on
rename.

### Backend: field CRUD (`src/controllers/v1/manual.ts`)

Three new routes, same style as the existing `set-workflow` handler —
load the session, compute the new `fields` array, persist via
`updateSession`:

```ts
function defaultValueForType(type: string) {
  switch (type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'image': return null;
    default: return '';
  }
}

manualRouter.post('/:id/fields', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const key = String(req.body.key ?? '');
  const type = String(req.body.type ?? 'text');

  if (session.fields.some((f) => f.key === key)) {
    throw new BadRequestError(`A field with key "${key}" already exists`);
  }

  const field = ManualFieldSchema.parse({ key, type, value: defaultValueForType(type) });
  await app.manualWorkflows.updateSession(session.id, { fields: [...session.fields, field] });

  res.status(201).json(field);
});

manualRouter.patch('/:id/fields/:fieldId', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const existing = session.fields.find((f) => f.id === req.params.fieldId);
  if (!existing) throw new NotFoundError('Field not found');

  const nextKey = req.body.key !== undefined ? String(req.body.key) : existing.key;
  const nextType = req.body.type !== undefined ? String(req.body.type) : existing.type;

  if (nextKey !== existing.key && session.fields.some((f) => f.id !== existing.id && f.key === nextKey)) {
    throw new BadRequestError(`A field with key "${nextKey}" already exists`);
  }

  const value = nextType !== existing.type
    ? defaultValueForType(nextType)
    : (req.body.value !== undefined ? req.body.value : existing.value);

  const updated = ManualFieldSchema.parse({ ...existing, key: nextKey, type: nextType, value, updatedAt: new Date() });
  const fields = session.fields.map((f) => (f.id === existing.id ? updated : f));
  await app.manualWorkflows.updateSession(session.id, { fields });

  res.status(200).json(updated);
});

manualRouter.delete('/:id/fields/:fieldId', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const fields = session.fields.filter((f) => f.id !== req.params.fieldId);
  if (fields.length === session.fields.length) throw new NotFoundError('Field not found');

  await app.manualWorkflows.updateSession(session.id, { fields });
  res.status(204).end();
});
```

Value-only edits (typing in Interact mode, on blur) go through the same
`PATCH` with just `{ value }` in the body — `nextKey`/`nextType` fall back
to the existing ones, so no special-case branch is needed.

### Backend: image storage for image-type fields (`src/controllers/v1/manual.ts`)

Manual sessions have no image writer yet. This spec adds the minimum
needed for an image-type field's "upload" path, following the same
decode → write → register shape as `CharacterImagesService.storeWorkingFile`,
plus dimension-reading via the already-available `image-size` package:

```ts
manualRouter.post('/:id/images', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const dataUrl = String(req.body.imageDataUrl ?? '');
  if (!dataUrl) throw new BadRequestError('An image file is required');

  const { buffer, extension } = parseDataUrl(dataUrl);
  const { width, height } = imageSize(buffer);
  const id = crypto.randomUUID();
  const filename = `${id}.${extension}`;

  const assetsDir = path.join(session.workflowDir, 'assets');
  await mkdir(assetsDir, { recursive: true });
  await writeFile(path.join(assetsDir, filename), buffer);

  const image = ImageSchema.parse({ id, filename, size: { width, height } });
  await app.manualWorkflows.updateSession(session.id, { images: [...session.images, image] });

  res.status(201).json(image);
});
```

A matching static-serve route in `src/views/manual.views.ts`:

```ts
router.get('/:id/assets/:filename', async (req: Request, res: Response) => {
  const session = await req.app.manualWorkflows.getSession(req.params.id.toString());
  res.sendFile(path.join(session.workflowDir, 'assets', req.params.filename));
});
```

Both are small, self-contained additions that the future
`/manual/{id}/images` page will also depend on — they're introduced here
only because an image-type field's "upload" mode has no other way to
produce something selectable.

### Frontend: `generation.njk`

Follows `configuration.njk`'s structure (crumbs, title, subnav include),
then a flex row of two `ui.card()`s per the approved layout — left column
narrower (Inputs), right column wider (Actions above Outputs):

```njk
{% extends "layout.njk" %}
{% set section = "manual" %}
{% import "macros.njk" as ui %}
{% set workspaceTab = "generation" %}
{% block content %}
  {{ ui.crumbs([{label: 'Manual', href: '/manual'}, {label: session.workflowName, href: '/manual/' + session.id}, {label: 'Workspace'}]) }}
  <h1 class="text-xl font-black tracking-tight mb-1">{{ session.workflowName }}</h1>
  {% include "partials/manual-workspace-subnav.njk" %}

  <div class="flex flex-col md:flex-row gap-4" data-manual-fields data-session-id="{{ session.id }}">
    <div class="md:basis-2/5">
      {% call ui.card('Inputs') %}
        <div data-fields-list>
          {% for field in session.fields %}
            {% include "partials/manual-field-row.njk" %}
          {% endfor %}
        </div>
        <button type="button" class="mt-3 text-[13px] font-semibold text-apple-700 dark:text-apple-300" data-add-field>+ Add Field</button>
      {% endcall %}
    </div>

    <div class="md:basis-3/5 flex flex-col gap-4">
      {% call ui.card('Actions') %}
        <span title="Workflow field mapping isn't available yet — coming in a follow-up update.">
          {{ ui.button('Generate', 'primary', 'button', true) }}
        </span>
      {% endcall %}

      {% call ui.card('Outputs') %}
        {% if session.generations.length == 0 %}
          <div class="rounded-lg border border-dashed border-steel-300 dark:border-steel-700 p-8 text-center text-steel-500">
            No generations yet.
          </div>
        {% else %}
          {% include "partials/manual-generation-outputs.njk" %}
        {% endif %}
      {% endcall %}
    </div>
  </div>
{% endblock %}
```

`manual-generation-outputs.njk` (new partial) renders the latest `done`
generation as a full-width hero, then the rest in the standard
`grid grid-cols-2 sm:grid-cols-4 gap-4` tile pattern — both tagged
`data-viewer-trigger data-viewer-group="manual-generations"`. Each
generation's `imageId` is looked up against `session.images` to get the
`filename` used in the `<img src="/manual/{{ session.id }}/assets/{{ image.filename }}">`
URL, so the shared modal's prev/next spans the whole set.

`manual-field-row.njk` (new partial) renders one field in Interact mode
by default:

```njk
<div class="mb-3" data-field-row data-field-id="{{ field.id }}" data-field-type="{{ field.type }}">
  <div class="flex items-center justify-between mb-1">
    <label class="text-[13px] font-semibold text-steel-600 dark:text-steel-300">{{ field.key }}</label>
    <div class="relative" data-field-menu>
      <button type="button" class="text-steel-400 hover:text-steel-600 text-[13px] px-1" data-field-menu-trigger>⋯</button>
      <div class="hidden absolute right-0 mt-1 bg-white dark:bg-steel-800 border border-steel-200 dark:border-steel-700 rounded-md shadow-sm text-[12.5px] z-10" data-field-menu-panel>
        <button type="button" class="block w-full text-left px-3 py-1.5 hover:bg-steel-50 dark:hover:bg-steel-700" data-field-edit>Edit</button>
        <button type="button" class="block w-full text-left px-3 py-1.5 text-rose-700 dark:text-rose-300 hover:bg-steel-50 dark:hover:bg-steel-700" data-field-delete>Delete</button>
      </div>
    </div>
  </div>
  <div data-field-value-slot>
    {% if field.type == 'text' %}
      <input type="text" class="w-full rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[13px]" value="{{ field.value }}" data-field-value />
    {% elif field.type == 'number' %}
      <input type="number" class="w-full rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[13px]" value="{{ field.value }}" data-field-value />
    {% elif field.type == 'boolean' %}
      <input type="checkbox" {{ 'checked' if field.value }} data-field-value />
    {% elif field.type == 'image' %}
      {% include "partials/manual-field-image-value.njk" %}
    {% endif %}
  </div>
</div>
```

Clicking "Edit" (or the just-added field's row rendering directly in this
state) swaps `data-field-value-slot`'s content for a dashed-border block
with `key`/`type`/`value` inputs plus a trash icon and a "Done" checkmark,
per the approved Section 3 behavior. That swap is driven client-side from
the same field data already in the DOM (`data-field-*` attributes) —  no
extra server round-trip just to enter Edit mode.

### Frontend: `public/manual-fields.js` (new file)

A new small module, matching the self-contained-feature convention of
`mask-editor.js`/`image-viewer.js`, scoped by `[data-manual-fields]`:

- **Add field**: `+ Add Field` → `POST /api/v1/manual/:id/fields` with a
  default key (e.g. `field_1`, incrementing) and type `text` → prepend/
  append the new row already in Edit mode (rendered client-side from the
  JSON response, no page reload).
- **Edit mode toggle**: "⋯ → Edit" swaps a row's value-slot markup to the
  dashed-border editable form (built client-side from the field's
  `data-field-*` attributes); "Done" or blur-outside-the-row calls
  `PATCH /api/v1/manual/:id/fields/:fieldId` with `{key, type, value}`,
  then re-renders the row in Interact mode from the response.
  Duplicate-key errors (409/400 from the API) render an inline message
  under the key input rather than collapsing the row.
- **Value-only edit**: a value control's `blur` event (Interact mode)
  calls `PATCH .../fields/:fieldId` with just `{ value }`.
- **Delete**: `DELETE /api/v1/manual/:id/fields/:fieldId`, remove the row
  from the DOM on success.
- **Image field "Change"**: reveals the same upload/select radio-panel
  markup as `manual-workflow-form.njk` (upload via `FileReader` → data
  URL → `POST /api/v1/manual/:id/images` → then
  `PATCH .../fields/:fieldId` with `{ value: image.id }`; select via a
  `<select>` of `session.images`), then updates the thumbnail shown in
  Interact mode using the resolved image's `filename`
  (`/manual/:id/assets/:filename`).

### Explicitly out of scope

- Resolving field values into the attached workflow graph, or anything
  that makes the `Generate` button do something — that requires the
  Configuration-page node-mapping UI (a separate future spec, analogous
  to the character-integration workflow-mapping screen) plus an
  execution/job-polling path for manual sessions. `Generate` stays
  rendered-but-disabled in this spec.
- Any `ManualGenerationSchema` record ever being created — the array
  exists and the Outputs UI renders against it, but nothing writes to it
  yet; it will always render the empty state until the execution spec
  lands.
- Drag-to-reorder fields.
- Per-tile actions (delete, select-as-winner, etc.) on generation output
  tiles — that belongs to `/manual/{id}/images`.
- Any validation of an uploaded image beyond decoding + dimension read
  (no NSFW check, no size/format limits beyond what `parseDataUrl`
  already enforces).

## Testing

- Schema tests: `ManualFieldSchema`/`ManualGenerationSchema` parsing,
  including default-value-by-type and the key regex.
- Controller/service tests for the three field routes (create, rename
  with duplicate-key rejection, type-change resetting value, delete) and
  the new `POST /:id/images` route (decodes a small fixture data URL,
  confirms a file lands in `<workflowDir>/assets/` and a matching record
  appears in `session.images` with correct `size`).
- View test for `GET .../workspace/generation`: renders correctly with
  (a) no fields + no generations, (b) fields present + no generations —
  covers all four field types in Interact mode.
- Manual verification via the `run` skill:
  - Add one field of each type; confirm each renders in Edit mode first,
    collapses to Interact on Done/blur-away.
  - Attempt a duplicate key — confirm inline error, row stays in Edit
    mode.
  - Edit an existing field via "⋯ → Edit", change its type — confirm
    value resets to that type's default.
  - Add an image-type field, upload an image — confirm it appears as a
    thumbnail in Interact mode and is fetchable at
    `/manual/:id/assets/:filename`.
  - Confirm `Generate` is disabled with the expected tooltip.
  - Confirm the Outputs card shows "No generations yet." (there is no
    path yet to populate it otherwise).
  - Resize to mobile width — confirm the two columns stack and the field
    "⋯" menu / dashed-border edit rows remain usable.
