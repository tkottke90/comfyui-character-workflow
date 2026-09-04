# Manual Images — Multiselect Mode — Design

## Problem

`manual/workspace/images.njk` (added by the
[images gallery design](2026-08-31-manual-workspace-images-gallery-design.md),
extended by the [NSFW blur](2026-09-02-manual-image-nsfw-blur-design.md),
[lock/unlock](2026-09-03-manual-image-lock-design.md), and
[copy-URL](2026-09-03-manual-image-copy-url-design.md) designs) only supports
per-image actions — Delete, Copy URL, Set/Unset NSFW, Lock/Unlock — each
requiring its own click (and, for Delete, its own confirm dialog). The batch
generation feature (`POST /:id/generate-batch`) is great for producing many
attempts at the same input to compare, but cleaning up the ones you don't
want means clicking Delete-then-confirm once per image. We want a
"Multiselect" mode on the images grid: toggle it on, check the images you
care about, then apply one action (Delete, Lock, Unlock, or Mark NSFW) to
all of them at once.

## Current implementation

- `ImageSchema` (`src/services/manual-workflow.service.ts:11`):
  `{ id, filename, size, parent?, createdAt, final, nsfw, locked }`.
- `ManualWorkflowRegistry.deleteImage` (`manual-workflow.service.ts:227-238`)
  throws `ConflictError` for a locked image, otherwise removes the file and
  the `session.images` record; an unknown `imageId` is a silent
  `{ deleted: false }`.
- `ManualWorkflowRegistry.setImageNsfw` / `setImageLocked`
  (`manual-workflow.service.ts:250-262`, `270-282`) each find-and-replace one
  image's flag via `updateSession`, throwing `NotFoundError` for an unknown
  `imageId`. `updateSession` calls for the same session id are serialized
  (`updateLocks`, referenced at `manual-workflow.service.ts:110-113`), so
  concurrent writes to the same session resolve in submission order with no
  torn state.
- `PATCH /:id/images/:imageId` (`src/controllers/v1/manual.ts:328-341`) is
  the existing single-image "update editable metadata" route: it dispatches
  on whichever of `nsfw`/`locked` is present as a boolean in the body,
  calling the matching registry method, and throws `BadRequestError` if
  neither is present.
- `manual/workspace/images.njk` renders one tile per image: an
  `aspect-[3/4]` thumbnail (`data-viewer-trigger data-viewer-group=
  "workspace-images"`, opening the shared preview dialog), a `data-nsfw-
  target` wrapper toggled via `data-nsfw-enabled`, and a footer with a
  `data-delete-slot`-wrapped Delete form, a `ui.copyable(...)` Copy URL
  button, an `data-nsfw-toggle` button, and a `data-lock-toggle` button. The
  grid root carries `data-images-endpoint="/api/v1/manual/{id}/images"`.
  Each tile carries `data-image-tile data-image-id="{id}"` and
  `data-locked` when locked.
- `public/nsfw-toggle.js` and `public/lock-toggle.js` are the client
  patterns to extend: a delegated click listener on `[data-images-endpoint]`,
  a `request(method, url, body)` `fetch` wrapper, PATCHing on click and
  updating the tile's data attribute + button label on success only.
- `image-viewer.js` (`public/image-viewer.js:119-128`) opens the shared
  preview dialog via a `document`-level, **capture-phase** click listener on
  `[data-viewer-trigger]`, calling `event.stopPropagation()` — deliberately
  capture rather than bubble so it can intercept before any ancestor's own
  click handler runs (see the inline comment at that line).
- `public/toast.js` exposes `window.toast.show(message, { type })`, with
  `type: 'error'` staying until dismissed (`duration: 0`) and other types
  auto-dismissing.
- `layout.njk` script tags: `nsfw-toggle.js` and `lock-toggle.js` are already
  loaded; a new script joins them.

## Design

### Data flow

Two new JSON routes, alongside the existing single-image `PATCH
/:id/images/:imageId`, each backed by a new `ManualWorkflowRegistry` method.
Both accept plain arrays of image ids and are resilient to unknown ids
(dropped silently, not surfaced as an error) since a bulk request can race
with another tab's edit.

### Backend: `bulkDeleteImages`

New method on `ManualWorkflowRegistry`, next to `deleteImage`:

```ts
async bulkDeleteImages(id: string, imageIds: string[]): Promise<{ deleted: string[]; skippedLocked: string[] }> {
  const sessionPath = this.checkForSession(id);
  const session = await this.loadSession(sessionPath);
  const targets = session.images.filter((img) => imageIds.includes(img.id));

  const skippedLocked = targets.filter((img) => img.locked).map((img) => img.id);
  const toDelete = targets.filter((img) => !img.locked);

  await Promise.all(toDelete.map((img) =>
    rm(path.join(session.workflowDir, 'assets', img.filename), { force: true })
  ));

  const deletedIds = new Set(toDelete.map((img) => img.id));
  const images = session.images.filter((img) => !deletedIds.has(img.id));
  await this.updateSession(id, { images });

  return { deleted: [...deletedIds], skippedLocked };
}
```

Unlike single-image delete (which throws `ConflictError` for a locked
image, blocking the whole request), a bulk request partially succeeds:
unlocked images are deleted, locked ones are left untouched and reported
back in `skippedLocked`.

### Backend: `bulkEditImages`

New method on `ManualWorkflowRegistry`, next to `setImageNsfw`/
`setImageLocked`. Takes a partial update object rather than one named
boolean, so a single call can apply `locked`, `nsfw`, or both to the same
set of ids:

```ts
async bulkEditImages(
  id: string,
  imageIds: string[],
  updates: { locked?: boolean; nsfw?: boolean }
): Promise<ManualImage[]> {
  const sessionPath = this.checkForSession(id);
  const session = await this.loadSession(sessionPath);
  const images = session.images.map((img) =>
    imageIds.includes(img.id) ? { ...img, ...updates } : img
  );
  await this.updateSession(id, { images });

  return images.filter((img) => imageIds.includes(img.id));
}
```

### API route: bulk delete

New route in `src/controllers/v1/manual.ts`, next to the existing image
routes:

```ts
manualRouter.post('/:id/images/bulk-action/delete', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  if (!Array.isArray(req.body.imageIds) || req.body.imageIds.some((id: unknown) => typeof id !== 'string')) {
    throw new BadRequestError('imageIds must be an array of strings');
  }

  const result = await app.manualWorkflows.bulkDeleteImages(session.id, req.body.imageIds);
  res.status(200).json(result);
});
```

### API route: bulk edit

New route, next to the bulk delete route. Unlike the single-image `PATCH`
(which dispatches on exactly one of `nsfw`/`locked`), this route collects
whichever fields are present into one `updates` object and applies them
together:

```ts
manualRouter.patch('/:id/images/bulk-action/edit', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  if (!Array.isArray(req.body.imageIds) || req.body.imageIds.some((id: unknown) => typeof id !== 'string')) {
    throw new BadRequestError('imageIds must be an array of strings');
  }

  const updates: { locked?: boolean; nsfw?: boolean } = {};
  if (typeof req.body.locked === 'boolean') updates.locked = req.body.locked;
  if (typeof req.body.nsfw === 'boolean') updates.nsfw = req.body.nsfw;
  if (Object.keys(updates).length === 0) {
    throw new BadRequestError('nsfw or locked must be a boolean');
  }

  const images = await app.manualWorkflows.bulkEditImages(session.id, req.body.imageIds, updates);
  res.status(200).json({ images });
});
```

The bulk action bar (below) only ever sends one field per click (`Lock` →
`{ locked: true }`, `Mark NSFW` → `{ nsfw: true }`), but the route itself
doesn't restrict combined requests.

### Template: `manual/workspace/images.njk`

The toolbar row (currently just the right-aligned image count) gains a
`data-select-toggle` button, and the grid root gains `data-select-mode-
root` (co-located with the existing `data-images-endpoint` attribute):

```njk
<div class="flex items-center justify-between mb-4">
  {{ ui.mono(images.length ~ ' images') }}
  <div data-select-controls>
    <button type="button" data-select-toggle class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline">Select</button>
    <button type="button" data-select-all class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline hidden">Select all</button>
    <button type="button" data-select-cancel class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline hidden">Cancel</button>
  </div>
</div>

<div class="grid grid-cols-2 sm:grid-cols-4 gap-4" data-images-endpoint="/api/v1/manual/{{ session.id }}/images" data-select-mode-root>
  {% for image in images %}
    <div class="rounded-lg border border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 overflow-hidden" data-image-tile data-image-id="{{ image.id }}" {% if image.locked %}data-locked{% endif %}>
      <div class="aspect-[3/4] relative overflow-hidden" data-nsfw-target {% if image.nsfw %}data-nsfw-enabled{% endif %}>
        <input type="checkbox" data-select-checkbox class="absolute top-1.5 left-1.5 h-4 w-4" aria-label="Select image" />
        <img src="/manual/{{ session.id }}/assets/{{ image.filename }}"
          data-viewer-trigger data-viewer-group="workspace-images" class="absolute inset-0 w-full h-full object-cover" alt="" />
        <div data-nsfw-badge class="absolute bottom-1 right-1">{{ ui.pill('nsfw', 'danger') }}</div>
      </div>
      <div class="p-2.5">
        <div class="mb-1.5 text-[12px] text-steel-500">{{ ui.mono(image.createdAt.toISOString().slice(0, 16).replace('T', ' ')) }}</div>
        <div data-tile-actions class="flex items-center justify-between">
          <!-- existing Delete / Copy URL / Set NSFW / Lock controls, unchanged -->
        </div>
      </div>
    </div>
  {% endfor %}
</div>

<div data-select-bar class="hidden fixed bottom-0 left-0 right-0 border-t border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 p-3 flex items-center justify-between">
  <span data-select-count class="text-[13px] font-semibold"></span>
  <div class="flex items-center gap-3">
    <button type="button" data-bulk-action="lock" class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline">Lock</button>
    <button type="button" data-bulk-action="unlock" class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline">Unlock</button>
    <button type="button" data-bulk-action="nsfw" class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline">Mark NSFW</button>
    <button type="button" data-bulk-action="delete" class="text-[12px] font-semibold text-rose-700 dark:text-rose-300 hover:underline">Delete</button>
  </div>
</div>
```

### CSS: mode-driven visibility

```css
[data-select-mode-root][data-select-mode] [data-select-checkbox] { display: block; }
[data-select-mode-root][data-select-mode] [data-tile-actions] { display: none; }
```

`data-select-mode` on the grid root drives checkbox visibility and hides
the per-tile action row for the duration of Select mode — the whole tile
becomes a selection target, so the individual Delete/Copy URL/Set NSFW/Lock
controls (which would otherwise sit under the same click) are hidden rather
than fought over. `data-select-bar`'s `hidden` class is toggled by JS
directly (shown once selection count > 0), not via a CSS attribute
selector, since it also needs its count text updated on every change.

### JS: `public/bulk-select.js`

New file, loaded from `layout.njk` after `lock-toggle.js`. Tracks selected
ids in a `Set`; `data-select-toggle`/`data-select-cancel` add/remove
`data-select-mode` on the root (clearing the set and hiding the bar on
cancel); `data-select-all` selects/deselects every currently rendered tile
and relabels itself "Select all" ↔ "Deselect all"; each checkbox click
adds/removes its tile's id and re-renders the bar's visibility/count.

Because Select mode means clicking the thumbnail should toggle selection
instead of opening the preview dialog, and `image-viewer.js` intercepts
clicks via a **`document`-level** capture-phase listener
(`image-viewer.js:119-128`), this file registers its own capture-phase
listener on **`window`** instead. Capture propagates outermost-first
(`window` → `document` → … → target), so a `window` listener always
runs before `document`'s regardless of script load order, letting it call
`stopPropagation()` in time:

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

  document.querySelectorAll('[data-select-mode-root]').forEach(function (root) {
    var endpoint = root.getAttribute('data-images-endpoint');
    var toggle = document.querySelector('[data-select-toggle]');
    var cancel = document.querySelector('[data-select-cancel]');
    var selectAll = document.querySelector('[data-select-all]');
    var bar = document.querySelector('[data-select-bar]');
    var countEl = bar.querySelector('[data-select-count]');
    var selected = new Set();

    function tiles() {
      return Array.prototype.slice.call(root.querySelectorAll('[data-image-tile]'));
    }

    function render() {
      bar.classList.toggle('hidden', selected.size === 0);
      countEl.textContent = selected.size + ' selected';
      selectAll.textContent = selected.size === tiles().length ? 'Deselect all' : 'Select all';
    }

    function setSelected(tile, on) {
      var id = tile.getAttribute('data-image-id');
      var box = tile.querySelector('[data-select-checkbox]');
      if (on) selected.add(id); else selected.delete(id);
      box.checked = on;
      render();
    }

    function enterMode() {
      root.setAttribute('data-select-mode', '');
      toggle.classList.add('hidden');
      cancel.classList.remove('hidden');
      selectAll.classList.remove('hidden');
    }

    function exitMode() {
      root.removeAttribute('data-select-mode');
      selected.clear();
      tiles().forEach(function (tile) { setSelected(tile, false); });
      toggle.classList.remove('hidden');
      cancel.classList.add('hidden');
      selectAll.classList.add('hidden');
      bar.classList.add('hidden');
    }

    toggle.addEventListener('click', enterMode);
    cancel.addEventListener('click', exitMode);
    selectAll.addEventListener('click', function () {
      var all = tiles();
      var makeSelected = selected.size !== all.length;
      all.forEach(function (tile) { setSelected(tile, makeSelected); });
    });

    // Capture on `window`, not `document`: must run before image-viewer.js's
    // own document-level capture listener so the preview dialog never opens
    // while selecting.
    window.addEventListener('click', function (event) {
      if (!root.hasAttribute('data-select-mode')) return;
      var tile = event.target.closest('[data-image-tile]');
      if (!tile || !root.contains(tile)) return;
      event.stopPropagation();
      event.preventDefault();
      setSelected(tile, !selected.has(tile.getAttribute('data-image-id')));
    }, true);

    bar.addEventListener('click', function (event) {
      var button = event.target.closest('[data-bulk-action]');
      if (!button) return;
      var action = button.getAttribute('data-bulk-action');
      var ids = Array.from(selected);
      if (ids.length === 0) return;

      if (action === 'delete') {
        if (!confirm('Delete ' + ids.length + ' image' + (ids.length === 1 ? '' : 's') + '? This cannot be undone.')) return;
        request('POST', endpoint + '/bulk-action/delete', { imageIds: ids })
          .then(function (result) {
            result.deleted.forEach(function (id) {
              var tile = root.querySelector('[data-image-tile][data-image-id="' + id + '"]');
              if (tile) tile.remove();
            });
            var message = result.deleted.length + ' deleted';
            if (result.skippedLocked.length > 0) message += ', ' + result.skippedLocked.length + ' skipped (locked)';
            if (window.toast) window.toast.show(message, { type: 'info' });
            exitMode();
          })
          .catch(function () {
            if (window.toast) window.toast.show('Failed to delete images.', { type: 'error' });
          });
        return;
      }

      var body = { imageIds: ids };
      if (action === 'lock') body.locked = true;
      if (action === 'unlock') body.locked = false;
      if (action === 'nsfw') body.nsfw = true;

      request('PATCH', endpoint + '/bulk-action/edit', body)
        .then(function (result) {
          result.images.forEach(function (image) {
            var tile = root.querySelector('[data-image-tile][data-image-id="' + image.id + '"]');
            if (!tile) return;
            tile.toggleAttribute('data-locked', image.locked);
            tile.querySelector('[data-nsfw-target]').toggleAttribute('data-nsfw-enabled', image.nsfw);
          });
          if (window.toast) window.toast.show('Updated ' + result.images.length + ' image' + (result.images.length === 1 ? '' : 's') + '.', { type: 'success' });
          exitMode();
        })
        .catch(function () {
          if (window.toast) window.toast.show('Failed to update images.', { type: 'error' });
        });
    });
  });
})();
```

Per-tile buttons hidden by CSS during Select mode don't need their own
labels resync'd (`nsfw-toggle.js`/`lock-toggle.js` still update them
underneath — invisibly — when a bulk edit changes the same flags a tile's
own button reads on next render/reload).

## Error handling & edge cases

- **Unknown/stale ids** in either endpoint's `imageIds` (e.g. an image
  deleted from another tab between page load and the bulk call): dropped
  silently by both `bulkDeleteImages` and `bulkEditImages` — absent from
  `deleted`, `skippedLocked`, and the returned `images` alike. No error
  surfaced.
- **Bulk delete, all selected locked**: `deleted: []`, `skippedLocked` holds
  every id; toast reads "0 deleted, 3 skipped (locked)". When none are
  locked, the skipped clause is omitted entirely.
- **`imageIds` not an array of strings**: `400 BadRequestError`, same
  convention as the existing single-image routes.
- **Neither `locked` nor `nsfw` boolean on the edit body**: `400
  BadRequestError('nsfw or locked must be a boolean')`.
- **Concurrent per-tile toggle + bulk action on overlapping images**:
  already serialized by the existing per-session `updateSession` queue, so
  writes land in submission order with no torn state — same guarantee the
  lock-toggle design relies on.
- **`bulk-select.js` fails to load**: "Select" does nothing (no handler
  attached); no partial/broken state, same no-JS-fallback posture as the
  rest of the app.
- **A bulk edit response referencing a tile no longer in the DOM** (raced
  with a concurrent delete): the `result.images.forEach` loop's `if
  (!tile) return;` guard skips it — no error thrown client-side.

## Explicitly out of scope

- Copy URL as a bulk action — copying N URLs into one clipboard entry isn't
  meaningful; stays per-tile only.
- Bulk "Unmark NSFW" — the bar's one NSFW button always sets `nsfw: true`;
  clearing the flag on an image still requires its own per-tile toggle.
- Pagination-aware or cross-page selection — the grid has no pagination
  today, so "Select all" means every tile currently rendered.
- Bulk actions spanning multiple workspaces/sessions.
- Undo for bulk delete — the confirm dialog is the only safeguard, same as
  the existing single-delete convention.
- `manual/detail.njk`'s read-only `recentImages` grid gaining Select mode.
- Keyboard shortcuts or shift-click range selection — one click per tile.

## Testing

- **Service** (`test/manual-workflow.service.test.ts`): `bulkDeleteImages`
  deletes unlocked images, skips locked ones, returns the correct
  `deleted`/`skippedLocked` split, and silently drops unknown ids;
  `bulkEditImages` applies `locked`, `nsfw`, or both together to matching
  ids and leaves non-matching images untouched.
- **Route** (`test/manual-controller.test.ts`): `POST
  .../images/bulk-action/delete` returns `200` with `{deleted,
  skippedLocked}`, `400` for a malformed `imageIds`; `PATCH
  .../images/bulk-action/edit` returns `200` with `{images}` for `locked`,
  `nsfw`, or both in one call, `400` when neither is a boolean.
- **Manual verification** via the `run` skill: enter Select mode and
  confirm per-tile actions hide and checkboxes appear; select a mix of
  locked/unlocked images and confirm clicking a thumbnail toggles selection
  instead of opening the preview modal; exercise Select all/Cancel; run
  Lock/Unlock/Mark NSFW and confirm tiles update live and Select mode exits
  afterward; run Delete on a mixed-lock selection and confirm one `confirm()`
  prompt, unlocked tiles disappearing, locked tiles remaining, and the toast
  reporting both counts; exit Select mode and confirm normal per-tile
  actions and click-to-preview still work unchanged.
