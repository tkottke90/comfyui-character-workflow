# Manual Workspace — Images Gallery — Design

## Problem

`/manual/:id/workspace/images` (`src/templates/manual/workspace/images.njk`)
is currently a static "Images coming soon." placeholder, even though the
"Images" tab already exists in the workspace subnav
(`partials/manual-workspace-subnav.njk`) and `session.images` is already a
real, growing collection: images are written by
`POST /api/v1/manual/:id/images` (used today by image-type field values on
the Generation page) and referenced by generations via `generation.imageId`
(shown as thumbnails in the Generation tab's Outputs strip,
`manual-generation-outputs.njk`). There is no page where a user can browse
everything that's ever landed in a workspace's `assets/` directory, and no
way to remove one — `session.images` and `assets/` can only grow. This spec
was explicitly called out as follow-up scope in the
[Generation page design](2026-08-30-manual-workspace-generation-page-design.md)
("Per-tile actions (delete, select-as-winner, etc.) on generation output
tiles — that belongs to `/manual/{id}/images`").

## Current implementation

- `GET /:id/workspace/images` (`src/views/manual.views.ts:104-110`) already
  loads the session and renders `manual/workspace/images.njk`, but passes
  nothing beyond `session` and the template ignores `session.images`
  entirely.
- `ImageSchema` (`src/services/manual-workflow.service.ts:11-19`):
  `{ id, filename, size: {width, height}, parent?, createdAt, final, nsfw }`.
  `filename` (added by the Generation page spec) is what makes an image
  servable; `parent`/`final`/`nsfw` aren't written or read by any UI yet and
  are out of scope here.
- Images are served from disk via the existing
  `GET /:id/assets/:filename` route (`manual.views.ts:95-102`).
- `ManualWorkflowRegistry` (`manual-workflow.service.ts:84-214`) has
  `addSession`/`deleteSession`/`getSession`/`updateSession` but no
  image-level delete method. `updateSession(id, partial)` validates and
  persists a partial update against `UploadSessionSchema`, which already
  includes `images` in its `.pick()` list (line 64-72), so replacing the
  `images` array is a supported partial update.
- Reusable UI already in place: the shared click-to-expand modal
  (`partials/image-viewer.njk` + `public/image-viewer.js`, triggered via
  `data-viewer-trigger`/`data-viewer-group`, with prev/next stepping across
  elements sharing the same group), and the tile-grid pattern established
  by `characters/images.njk` and `manual-generation-outputs.njk`
  (`grid grid-cols-2 sm:grid-cols-4 gap-4`, `aspect-[3/4]` tiles).
- Destructive actions across the app (`characters/images.njk:50-53`,
  `casting_batch.njk`, character delete, etc.) all use the same convention:
  a `<form method="post">` whose submit button is guarded by
  `onsubmit="return confirm('...')"`. There is no reusable confirm-dialog
  component — this plain pattern is what any new delete action should
  follow.
- Date display convention (`manual/detail.njk:27`,
  `workspace/configuration.njk:15`):
  `ui.mono(date.toISOString().slice(0, 16).replace('T', ' '))`.

## Design

### Route: list images

`GET /:id/workspace/images` (`manual.views.ts:104-110`) is updated to sort
`session.images` newest-first and pass it to the template:

```ts
router.get('/:id/workspace/images', async (req: Request, res: Response) => {
  const session = await req.app.manualWorkflows.getSession(req.params.id.toString());
  const sessionJson = session.toJSON() as ManualWorkflowSession;
  const images = [...sessionJson.images].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.render('manual/workspace/images.njk', {
    session: sessionJson,
    images
  });
});
```

### Backend: delete

New method on `ManualWorkflowRegistry`, alongside `addSession`/
`deleteSession`, following the same idempotent shape as the characters
pipeline's `deleteWorkingFile`/`deleteCastingCandidate`:

```ts
async deleteImage(id: string, imageId: string): Promise<{ deleted: boolean }> {
  const sessionPath = this.checkForSession(id);
  const session = await this.loadSession(sessionPath);
  const image = session.images.find((img) => img.id === imageId);

  if (!image) return { deleted: false };

  await rm(path.join(session.workflowDir, 'assets', image.filename), { force: true });

  const images = session.images.filter((img) => img.id !== imageId);
  await this.updateSession(id, { images });

  return { deleted: true };
}
```

`rm(..., { force: true })` (already imported in this file) makes a missing
file a no-op rather than an error, matching the idempotent-delete
convention used elsewhere. No check is made for whether the image is a
current field value or a generation's output — per decision, deletion is
unconditional; a dangling reference (e.g. a broken thumbnail in the
Generation tab) is an accepted consequence.

### Route: delete

New route in `manual.views.ts`, next to the images-list route:

```ts
router.post('/:id/workspace/images/:imageId/delete', async (req: Request, res: Response) => {
  await req.app.manualWorkflows.deleteImage(req.params.id.toString(), req.params.imageId.toString());
  res.redirect(`/manual/${req.params.id}/workspace/images`);
});
```

No no-op/guard branches beyond what `deleteImage` already handles — always
allow, unconditionally.

### Template: `manual/workspace/images.njk`

Replaces the placeholder with an empty state or a grid, following
`characters/images.njk`'s structure minus the filter pills and the
multi-branch action list (only one action exists here):

```njk
{% extends "layout.njk" %}
{% set section = "manual" %}
{% import "macros.njk" as ui %}
{% set workspaceTab = "images" %}
{% block content %}
  {{ ui.crumbs([{label: 'Manual', href: '/manual'}, {label: session.workflowName, href: '/manual/' + session.id}, {label: 'Workspace'}]) }}
  <h1 class="text-xl font-black tracking-tight mb-1">{{ session.workflowName }}</h1>
  {% include "partials/manual-workspace-subnav.njk" %}

  {% if images.length == 0 %}
    <div class="rounded-lg border border-dashed border-steel-300 dark:border-steel-700 p-8 text-center text-steel-500">
      No images yet.
    </div>
  {% else %}
    <div class="flex items-center justify-end mb-4">
      {{ ui.mono(images.length ~ ' images') }}
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {% for image in images %}
        <div class="rounded-lg border border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 overflow-hidden">
          <div class="aspect-[3/4] relative overflow-hidden">
            <img src="/manual/{{ session.id }}/assets/{{ image.filename }}"
              data-viewer-trigger data-viewer-group="workspace-images" class="absolute inset-0 w-full h-full object-cover" alt="" />
          </div>
          <div class="p-2.5">
            <div class="mb-1.5 text-[12px] text-steel-500">{{ ui.mono(image.createdAt.toISOString().slice(0, 16).replace('T', ' ')) }}</div>
            <form method="post" action="/manual/{{ session.id }}/workspace/images/{{ image.id }}/delete"
              onsubmit="return confirm('Delete this image? This cannot be undone.');">
              <button type="submit" class="text-[12px] font-semibold text-rose-700 dark:text-rose-300 hover:underline">Delete</button>
            </form>
          </div>
        </div>
      {% endfor %}
    </div>
  {% endif %}
{% endblock %}
```

`data-viewer-group="workspace-images"` is scoped to this page (not shared
with the Generation tab's `"manual-generations"` group), so prev/next
stepping in the modal spans exactly the tiles on screen.

## Error handling & edge cases

- **Delete of a non-existent `imageId`**: `deleteImage` returns
  `{ deleted: false }`; the route still redirects normally (no error
  surfaced to the user), matching the double-delete/replay case.
- **File already missing on disk**: `rm(..., { force: true })` treats this
  as success, same as the characters pipeline's delete methods.
- **Image still referenced by a field value or a generation**: allowed,
  unconditionally, per the decision above. No cascading cleanup of
  `fields`/`generations` records is performed.
- **Path containment**: `image.filename` is a server-generated value
  (`<uuid>.<ext>`, written by the existing `POST /:id/images` route), not
  user-supplied at delete time, so no additional sanitization is needed
  beyond what already exists on write.

## Explicitly out of scope

- Any action link beyond Delete (e.g. "Send to field", "Mark final") — the
  `final`/`parent` schema fields stay unused.
- Filter pills / grouping by source, unlike `characters/images.njk`  — there
  is only one kind of image here today.
- Guarding or warning on delete of an in-use image (current field value or
  generation output).
- Cascading updates to `fields`/`generations` when their referenced image
  is deleted.
- A v1 JSON API delete endpoint — this follows the same view-level
  `POST .../delete` + redirect convention as the rest of the app's
  destructive actions, not the `/api/v1/manual/...` controller.

## Testing

- Service test (`manual-workflow.service.test.ts` or equivalent): normal
  delete removes the file and the `session.images` record; idempotent
  re-delete (or delete of an unknown `imageId`) returns
  `{ deleted: false }` without throwing.
- Route test: `GET .../workspace/images` renders the empty state with no
  images, and a populated grid sorted newest-first; `POST
  .../images/:imageId/delete` removes the image and redirects back to the
  images tab.
- Manual verification via the `run` skill: upload/generate a couple of
  images into a workspace, confirm they appear in the Images tab
  newest-first; click a thumbnail and confirm the full-preview modal opens
  with prev/next working across the grid; delete one via the confirm
  dialog and confirm it disappears from the grid and is no longer served at
  `/manual/:id/assets/:filename`.
