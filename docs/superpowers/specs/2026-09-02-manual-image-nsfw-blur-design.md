# Manual Images — NSFW Blur Toggle — Design

## Problem

`ImageSchema` (`src/services/manual-workflow.service.ts:11-19`) already has
`nsfw: z.boolean().default(false)`, and `manual/detail.njk:71-72` already
renders a read-only `nsfw` pill when it's set — but nothing ever writes the
field, and the workspace gallery (`manual/workspace/images.njk`, added by the
[images gallery design](2026-08-31-manual-workspace-images-gallery-design.md))
ignores it entirely. There's no way for a user to mark an image NSFW, and no
visual consequence when one is. We want images marked NSFW to be blurred by
default in both grids where thumbnails appear, with a per-image button to
toggle the flag, and the existing click-to-enlarge preview to always show the
image unblurred.

## Current implementation

- **Gallery grid** (`manual/workspace/images.njk:18-34`): one tile per image,
  `grid grid-cols-2 sm:grid-cols-4 gap-4`, each an `aspect-[3/4]` thumbnail
  (`<img data-viewer-trigger data-viewer-group="workspace-images">`) plus a
  `Delete` button in a `<form method="post">` posting to
  `/manual/:id/workspace/images/:imageId/delete`.
- **Detail page grid** (`manual/detail.njk:56-83`): a read-only preview of
  `recentImages`, `aspect-square` tiles, no `data-viewer-trigger` (not
  clickable), already conditionally rendering `{{ ui.pill('nsfw', 'danger') }}`
  top-left and `{{ ui.pill('final', 'green') }}` top-right when set.
- **Preview dialog** (`partials/image-viewer.njk` + `public/image-viewer.js`):
  one shared `<dialog data-image-viewer>` per page, opened by any
  `[data-viewer-trigger]` click. `image-viewer.js` sets the dialog's own
  `<img data-viewer-image>` `src` directly from the trigger's `<img>` — it
  never touches the trigger's classes/attributes, so it stays a distinct DOM
  node from whatever grid tile opened it.
- **Field update convention** (`public/dynamic-fields.js:195-210,232`): a root
  container carries a `data-fields-endpoint="/api/v1/manual/:id/fields"`
  attribute; a `request(method, url, body)` helper wraps `fetch` with JSON
  headers and throws on a non-ok response; a delegated listener resolves
  `endpoint + '/' + id` per row. `PATCH /:id/fields/:fieldId`
  (`src/controllers/v1/manual.ts:209-260`) is the matching generic
  update-one-field API route.
- **CSS**: `public/app.css:33-35` already has a `:root { --toast-ease-*: ...; }`
  block for shared custom properties.

## Design

### Backend: `setImageNsfw`

New method on `ManualWorkflowRegistry`
(`src/services/manual-workflow.service.ts`), next to `deleteImage`
(line ~225):

```ts
async setImageNsfw(id: string, imageId: string, nsfw: boolean): Promise<ManualImage> {
  const sessionPath = this.checkForSession(id);
  const session = await this.loadSession(sessionPath);
  const image = session.images.find((img) => img.id === imageId);
  if (!image) throw new NotFoundError('Image not found');

  const images = session.images.map((img) => (img.id === imageId ? { ...img, nsfw } : img));
  await this.updateSession(id, { images });

  return images.find((img) => img.id === imageId)!;
}
```

### API route

New route in `src/controllers/v1/manual.ts`, next to the existing
`POST /:id/images` upload route (line ~303). Generic "update one image"
route — not `nsfw`-specific — so it can carry other per-image fields later:

```ts
/**
 * Update an image's editable metadata (currently just nsfw)
 */
manualRouter.patch('/:id/images/:imageId', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  if (typeof req.body.nsfw !== 'boolean') {
    throw new BadRequestError('nsfw must be a boolean');
  }

  const image = await app.manualWorkflows.setImageNsfw(session.id, req.params.imageId, req.body.nsfw);
  res.status(200).json(image);
});
```

`setImageNsfw`'s `NotFoundError` on an unknown `imageId` propagates to a `404`
via the app's existing error-handling middleware, same as every other route
here.

### CSS: blur + badge, driven by one attribute

`public/app.css`, added to the existing `:root` block:

```css
:root {
  --nsfw-blur: 14px;
}

[data-nsfw-enabled] img {
  filter: blur(var(--nsfw-blur));
}

[data-nsfw-badge] {
  display: none;
}

[data-nsfw-enabled] [data-nsfw-badge] {
  display: block;
}
```

`data-nsfw-enabled` goes on the tile's image-wrapper div (the
`aspect-[3/4]`/`aspect-square` element), not the `<img>` itself, so both the
blur and the badge are driven by one attribute add/remove — no JS class
juggling. The preview dialog's `<img data-viewer-image>` is a separate DOM
node that only ever has its `src` set, so it's never blurred.

### Template: `manual/workspace/images.njk`

```njk
<div class="grid grid-cols-2 sm:grid-cols-4 gap-4" data-images-endpoint="/api/v1/manual/{{ session.id }}/images">
  {% for image in images %}
    <div class="rounded-lg border border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 overflow-hidden" data-image-tile data-image-id="{{ image.id }}">
      <div class="aspect-[3/4] relative overflow-hidden" data-nsfw-target {% if image.nsfw %}data-nsfw-enabled{% endif %}>
        <img src="/manual/{{ session.id }}/assets/{{ image.filename }}"
          data-viewer-trigger data-viewer-group="workspace-images" class="absolute inset-0 w-full h-full object-cover" alt="" />
        <div data-nsfw-badge class="absolute bottom-1 right-1">{{ ui.pill('nsfw', 'danger') }}</div>
      </div>
      <div class="p-2.5">
        <div class="mb-1.5 text-[12px] text-steel-500">{{ ui.mono(image.createdAt.toISOString().slice(0, 16).replace('T', ' ')) }}</div>
        <div class="flex items-center justify-between">
          <form method="post" action="/manual/{{ session.id }}/workspace/images/{{ image.id }}/delete"
            onsubmit="return confirm('Delete this image? This cannot be undone.');">
            <button type="submit" class="text-[12px] font-semibold text-rose-700 dark:text-rose-300 hover:underline">Delete</button>
          </form>
          <button type="button" data-nsfw-toggle
            class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline">
            {{ 'Unset NSFW' if image.nsfw else 'Set NSFW' }}
          </button>
        </div>
      </div>
    </div>
  {% endfor %}
</div>
```

### Template: `manual/detail.njk`

Only the wrapper attribute is added (line ~66) — the pill markup at lines
71-73 already exists and is left as-is:

```njk
<div class="aspect-square rounded-md overflow-hidden relative" {% if image.nsfw %}data-nsfw-enabled{% endif %}>
```

Since `[data-nsfw-badge]` isn't used here, this page's existing `nsfw` pill
just always renders (as it does today) whenever `image.nsfw` is true — the
new CSS rule only adds the blur. No toggle button on this page (matches its
existing no-actions, read-only pattern) and no `data-viewer-trigger` wiring
(unchanged — still not clickable).

### JS: `public/nsfw-toggle.js`

New file, loaded from `layout.njk` alongside `dynamic-fields.js`. Mirrors its
`request()` helper:

```js
(function () {
  'use strict';

  function request(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error('Request failed');
      return res.json();
    });
  }

  document.querySelectorAll('[data-images-endpoint]').forEach(function (root) {
    var endpoint = root.getAttribute('data-images-endpoint');

    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-nsfw-toggle]');
      if (!button) return;

      var tile = button.closest('[data-image-tile]');
      var target = tile.querySelector('[data-nsfw-target]');
      var next = !target.hasAttribute('data-nsfw-enabled');

      request('PATCH', endpoint + '/' + tile.getAttribute('data-image-id'), { nsfw: next })
        .then(function () {
          target.toggleAttribute('data-nsfw-enabled', next);
          button.textContent = next ? 'Unset NSFW' : 'Set NSFW';
        })
        .catch(function () {
          /* no-op: leave the button and tile exactly as the user left them */
        });
    });
  });
})();
```

## Error handling & edge cases

- **Unknown `imageId`** on the PATCH route: `NotFoundError` → `404`, surfaced
  to the client's `fetch` as a non-ok response; the toggle button's `.catch`
  leaves the UI unchanged (same "no-op on failure" convention as
  `image-viewer.js:188-190`'s ajax-form submit).
- **Non-boolean `nsfw` in the request body**: `400` via `BadRequestError`,
  same no-op behavior client-side.
- **Concurrent toggle + delete of the same image**: `setImageNsfw` throws
  `NotFoundError` if the image was deleted first (map finds nothing to
  update); no special handling needed beyond the existing 404 path.
- **Preview dialog always unblurred**: guaranteed structurally (separate DOM
  node, `src`-only), not by any nsfw-aware logic in `image-viewer.js` — that
  file is not modified by this design.

## Explicitly out of scope

- The detail page's `recentImages` grid gaining a toggle button or
  click-to-preview wiring — it stays read-only, per decision.
- Bulk/multi-select NSFW marking.
- Any server-side gating (e.g. hiding NSFW images from an API response) —
  this is a client-side blur only; the underlying image is still served
  normally at `/manual/:id/assets/:filename`.
- Persisting a user's "always show NSFW" preference — the blur always
  reapplies on page load for a flagged image.

## Testing

- **Service** (`test/manual-workflow.service.test.ts`): `setImageNsfw` flips
  `false → true` and `true → false` and returns the updated image; throws
  `NotFoundError` for an unknown `imageId`.
- **Route** (`test/manual-controller.test.ts`): `PATCH /:id/images/:imageId`
  returns `200` with the updated image on success; `400` for a non-boolean
  `nsfw`; `404` for an unknown `imageId`.
- **Manual verification** via the `run` skill: mark an image NSFW from the
  gallery grid, confirm it blurs immediately with the badge showing bottom
  right and no page reload; click it and confirm the preview dialog shows it
  unblurred; unset it and confirm the blur/badge clear immediately; reload
  the page and confirm the blur persists for a flagged image; check the
  workflow detail page shows the same image blurred with its existing pill.
  No automated JS test infra exists for `image-viewer.js`/`dynamic-fields.js`
  today, so `nsfw-toggle.js` follows the same manual-verification-only
  convention.
