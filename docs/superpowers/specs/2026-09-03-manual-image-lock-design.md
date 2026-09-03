# Manual Images — Lock/Unlock Toggle — Design

## Problem

`manual/workspace/images.njk` (added by the
[images gallery design](2026-08-31-manual-workspace-images-gallery-design.md))
gives every image an unconditional Delete action — there is no way to
protect an image from accidental deletion. We want a per-image Lock/Unlock
toggle: locked images hide their Delete button in the UI, and the server
also refuses to delete a locked image even if the delete request reaches it
directly (e.g. a stale page, a replayed form submission). By default every
image is unlocked.

This closely follows the precedent set by the
[NSFW blur toggle design](2026-09-02-manual-image-nsfw-blur-design.md):
a new boolean on `ImageSchema`, a registry method that flips it, the
existing generic `PATCH /:id/images/:imageId` route extended to accept the
new field, and a small delegated-click JS file mirroring
`nsfw-toggle.js`.

## Current implementation

- `ImageSchema` (`src/services/manual-workflow.service.ts:11-19`):
  `{ id, filename, size, parent?, createdAt, final, nsfw }`. No `locked`
  field exists yet.
- `ManualWorkflowRegistry.deleteImage` (`manual-workflow.service.ts:225-238`)
  unconditionally removes the file and the `session.images` record for any
  known `imageId`; an unknown `imageId` returns `{ deleted: false }` without
  error.
- `ManualWorkflowRegistry.setImageNsfw` (`manual-workflow.service.ts:247-258`)
  is the pattern to mirror: find the image, throw `NotFoundError` if
  missing, otherwise map-replace the flag and persist via `updateSession`.
- `PATCH /:id/images/:imageId` (`src/controllers/v1/manual.ts:328-336`)
  already exists as the "update an image's editable metadata" route,
  currently handling only `nsfw`.
- `POST /:id/workspace/images/:imageId/delete` and
  `GET /:id/workspace/images` (`src/views/manual.views.ts:153-167`) are
  plain view routes — form POST + redirect, and a render call. Neither has
  any try/catch or error-surfacing today.
- `src/errors/http.errors.ts` defines `HttpError` (500), `BadRequestError`
  (400), `NotFoundError` (404), `InternalServerError` (500). No 409-class
  error exists yet.
- `layout.njk:56-60` already has a generic, currently-unused
  `{% if error %}` banner block (red border/background) that any template
  extending `layout.njk` picks up automatically when `error` is passed to
  `res.render`. The only established convention for a view-route POST to
  surface a visible error without losing page context is the
  redirect-with-query-param pattern used by
  `src/views/integration.views.ts` (`testResult`/`testError` on
  `POST /connection/test`): the POST handler catches, redirects to
  `GET ...?xError=<message>`, and the GET handler reads the query param
  into the render context.
- `public/nsfw-toggle.js` is the pattern to mirror for the new toggle: a
  `[data-images-endpoint]` root, a delegated click listener, a small
  `request()` fetch wrapper, PATCHing on click and updating the button
  label/attribute on success only.
- `public/toast.js` exposes `window.toast.show(message, { type })`;
  `type: 'error'` renders a red toast with `duration: 0` (stays until
  dismissed) — see `DEFAULT_DURATIONS`/`VARIANT_CLASSES` in that file.

## Design

### Data model

Add to `ImageSchema` (`manual-workflow.service.ts:11-19`):

```ts
locked: z.boolean().default(false)
```

Existing images without the field default to `locked: false` on load, same
rollout behavior as `nsfw`.

### New error class

`src/errors/http.errors.ts`, alongside the existing error classes:

```ts
export class ConflictError extends HttpError {
  statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
```

### Backend: `setImageLocked`

New method on `ManualWorkflowRegistry`, next to `setImageNsfw`:

```ts
/**
 * Sets (or clears) the locked flag on a single image in a session's gallery.
 * @throws {NotFoundError} when the image is not found
 */
async setImageLocked(id: string, imageId: string, locked: boolean): Promise<ManualImage> {
  const sessionPath = this.checkForSession(id);
  const session = await this.loadSession(sessionPath);
  const image = session.images.find((img) => img.id === imageId);

  if (!image) throw new NotFoundError(`No image found for id - ${imageId}`);

  const images = session.images.map((img) => (img.id === imageId ? { ...img, locked } : img));
  await this.updateSession(id, { images });

  return images.find((img) => img.id === imageId)!;
}
```

### Backend: `deleteImage` gains a lock guard

One new branch in the existing method (`manual-workflow.service.ts:225-238`),
inserted between the not-found check and the delete:

```ts
async deleteImage(id: string, imageId: string): Promise<{ deleted: boolean }> {
  const sessionPath = this.checkForSession(id);
  const session = await this.loadSession(sessionPath);
  const image = session.images.find((img) => img.id === imageId);

  if (!image) return { deleted: false };
  if (image.locked) throw new ConflictError('Image is locked and cannot be deleted');

  await rm(path.join(session.workflowDir, 'assets', image.filename), { force: true });

  const images = session.images.filter((img) => img.id !== imageId);
  await this.updateSession(id, { images });

  return { deleted: true };
}
```

Unknown `imageId` keeps the existing silent `{ deleted: false }` behavior —
only a *found-but-locked* image is a hard stop. This is the one place the
server enforces the lock; nothing else in the app deletes an image.

### API route: extend the existing PATCH

`src/controllers/v1/manual.ts:328-336`, updated to dispatch on whichever
field is present in the body:

```ts
/**
 * Update an image's editable metadata (nsfw or locked)
 */
manualRouter.patch('/:id/images/:imageId', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());

  if (typeof req.body.nsfw === 'boolean') {
    const image = await app.manualWorkflows.setImageNsfw(session.id, req.params.imageId.toString(), req.body.nsfw);
    return res.status(200).json(image);
  }

  if (typeof req.body.locked === 'boolean') {
    const image = await app.manualWorkflows.setImageLocked(session.id, req.params.imageId.toString(), req.body.locked);
    return res.status(200).json(image);
  }

  throw new BadRequestError('nsfw or locked must be a boolean');
});
```

### Route: delete now catches `ConflictError`

`src/views/manual.views.ts:164-167`:

```ts
router.post('/:id/workspace/images/:imageId/delete', async (req: Request, res: Response) => {
  try {
    await req.app.manualWorkflows.deleteImage(req.params.id.toString(), req.params.imageId.toString());
  } catch (err) {
    if (err instanceof ConflictError) {
      const message = encodeURIComponent(err.message);
      return res.redirect(`/manual/${req.params.id}/workspace/images?deleteError=${message}`);
    }
    throw err;
  }

  res.redirect(`/manual/${req.params.id}/workspace/images`);
});
```

Any other error (e.g. an unexpected `rm` failure) still propagates to the
app's default error-handling middleware, unchanged.

### Route: images list reads the flash param

`src/views/manual.views.ts:153-162`:

```ts
router.get('/:id/workspace/images', async (req: Request, res: Response) => {
  const session = await req.app.manualWorkflows.getSession(req.params.id.toString());
  const sessionJson = session.toJSON() as ManualWorkflowSession;
  const images = [...sessionJson.images].sort(SortImages);

  res.render('manual/workspace/images.njk', {
    session: sessionJson,
    images,
    error: typeof req.query.deleteError === 'string' ? req.query.deleteError : undefined
  });
});
```

Passing `error` plugs directly into `layout.njk`'s existing banner block —
no new banner markup needs to be built in `images.njk`.

### CSS: hide the Delete slot, driven by one attribute

Same convention the NSFW toggle established (`app.css`'s `[data-nsfw-enabled]`
rule) — one attribute on the tile drives visibility, no JS class juggling
and no DOM insertion/removal needed for the unlock direction:

```css
[data-locked] [data-delete-slot] {
  display: none;
}
```

### Template: `manual/workspace/images.njk`

The tile root gets a `data-locked` attribute when the image starts out
locked; the Delete form is wrapped in a `[data-delete-slot]` div rather than
conditionally rendered, so both lock and unlock can be applied client-side
by toggling one attribute:

```njk
<div class="rounded-lg border border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 overflow-hidden"
  data-image-tile data-image-id="{{ image.id }}" {% if image.locked %}data-locked{% endif %}>
  ...
  <div class="flex items-center justify-between">
    <div data-delete-slot>
      <form method="post" action="/manual/{{ session.id }}/workspace/images/{{ image.id }}/delete"
        onsubmit="return confirm('Delete this image? This cannot be undone.');">
        <button type="submit" class="text-[12px] font-semibold text-rose-700 dark:text-rose-300 hover:underline">Delete</button>
      </form>
    </div>
    <div class="flex items-center gap-3">
      <button type="button" data-nsfw-toggle
        class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline">
        {{ 'Unset NSFW' if image.nsfw else 'Set NSFW' }}
      </button>
      <button type="button" data-lock-toggle
        class="text-[12px] font-semibold text-steel-600 dark:text-steel-300 hover:underline">
        {{ 'Unlock' if image.locked else 'Lock' }}
      </button>
    </div>
  </div>
</div>
```

The Delete `<form>` stays in the DOM (just hidden via CSS) even when
locked — harmless, since `deleteImage` enforces the lock server-side
regardless of what the client sends. No badge/indicator is added to the
thumbnail itself — the button label (`Lock` vs `Unlock`) and the hidden
Delete slot are the only signals that an image is locked, per decision.

### JS: `public/lock-toggle.js`

New file, structurally identical to `nsfw-toggle.js`. Unlike the NSFW
toggle (whose failure is a silent no-op — a display-only flag), a failed
lock/unlock surfaces a toast, since locking is a protection mechanism the
user needs to know didn't take:

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
      var button = event.target.closest('[data-lock-toggle]');
      if (!button) return;

      var tile = button.closest('[data-image-tile]');
      var next = !tile.hasAttribute('data-locked');

      request('PATCH', endpoint + '/' + tile.getAttribute('data-image-id'), { locked: next })
        .then(function () {
          tile.toggleAttribute('data-locked', next);
          button.textContent = next ? 'Unlock' : 'Lock';
        })
        .catch(function () {
          if (window.toast) window.toast.show('Failed to update lock status.', { type: 'error' });
        });
    });
  });
})();
```

`layout.njk`: add `<script src="/lock-toggle.js"></script>` next to the
existing `nsfw-toggle.js` script tag.

## Error handling & edge cases

- **Delete of a locked image (direct POST, bypassing the hidden button)**:
  `deleteImage` throws `ConflictError`; the view route redirects to
  `?deleteError=Image is locked and cannot be deleted`; the images page
  reloads showing the red banner and the image still present, still locked.
- **Delete of an unknown `imageId`**: unchanged — silent
  `{ deleted: false }`, redirect with no error param.
- **Lock/unlock of an unknown `imageId`**: `setImageLocked` throws
  `NotFoundError` → 404 via the existing error-handling middleware, same as
  `setImageNsfw` today; the toggle's `.catch` shows the failure toast.
- **Non-boolean `locked` in the PATCH body**: 400 via `BadRequestError`,
  same as the existing `nsfw` validation.
- **Concurrent lock + delete of the same image**: `updateSession` calls for
  the same session id are already serialized
  (`ManualWorkflowRegistry.updateLocks`, `manual-workflow.service.ts:109-113`
  /`192-200`), so a lock-then-delete or delete-then-lock race resolves in
  submission order with no torn writes; whichever operation's read sees
  `locked: true` first behaves per the rules above.
- **Toggling NSFW and Lock in quick succession on the same image**: each
  toggle is an independent PATCH request; the serialized `updateSession`
  queue means the second request's read-modify-write reflects the first
  request's completed write, so neither flag is lost.

## Explicitly out of scope

- Any lock indicator/badge on the thumbnail itself — button label only.
- The detail page's `recentImages` grid (`manual/detail.njk`) gaining lock
  state or a toggle — it stays read-only, same as its NSFW handling.
- Preventing other mutations of a locked image (e.g. the NSFW toggle still
  works on a locked image) — locking only protects against deletion.
- Any cascading protection (e.g. blocking a whole session from being
  deleted because it contains a locked image) — session-level delete is
  unaffected.
- A v1 JSON API delete endpoint gaining the same guard — there isn't one;
  the only delete path is the view-level POST route already covered above.

## Testing

- **Service** (`test/manual-workflow.service.test.ts`): `setImageLocked`
  flips `false → true` and `true → false` and returns the updated image;
  throws `NotFoundError` for an unknown `imageId`. `deleteImage` throws
  `ConflictError` for a locked image and leaves the file/record untouched;
  unlocked-image delete behavior is unchanged.
- **Route** (`test/manual-controller.test.ts`): `PATCH /:id/images/:imageId`
  with `{ locked: true }` returns 200 with the updated image; `400` for a
  non-boolean `locked`.
- **View route** (`test/manual-*.test.ts` equivalent): `POST
  .../images/:imageId/delete` on a locked image redirects to
  `.../images?deleteError=...` without deleting; `GET .../images` with
  `?deleteError=...` renders the error banner via `layout.njk`'s existing
  `{% if error %}` block.
- **Manual verification** via the `run` skill: lock an image, confirm its
  Delete button disappears and the button now reads "Unlock"; reload the
  page and confirm the locked state persisted; unlock it and confirm
  Delete reappears; attempt a delete via a direct POST (e.g. curl) against
  a locked image's delete URL and confirm it 30X-redirects back with the
  error banner visible and the image still present.
