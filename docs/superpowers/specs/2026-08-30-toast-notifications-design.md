# Toast Notifications — Design

## Problem

The app is server-rendered Nunjucks + vanilla JS, and most actions confirm
themselves via a full-page reload or redirect (`sse-client.js`'s
`location.reload()`, `data-delete-url`'s redirect). But a growing set of
actions happen client-side with nothing to reload: `copy.js` (currently an
empty stub for `[data-copy-target]` click-to-copy), fetch calls in `app.js`
(`data-randomize-seed`, whose failure is currently a silent no-op), and any
future JS-only interaction. There is no way to tell the user "that worked"
or "that failed" without reloading the page. A `#toast-portal` container
(`src/templates/partials/toaster.njk`) and an empty `public/toast.js` stub
already exist, scaffolded for this.

## Current implementation

- `src/templates/partials/toaster.njk` — a bare `<div id="toast-portal">`,
  not yet included by `layout.njk`.
- `public/toast.js` — empty stub (`const toaster = {}`), not yet included
  by `layout.njk`.
- `public/copy.js` — empty stub, registers a listener on
  `[data-copy-target]` clicks but does nothing.
- `src/templates/layout.njk:64-69` — includes `partials/image-viewer.njk`
  and loads `app.js`, `mask-editor.js`, `sse-client.js`, `image-viewer.js`,
  `copy.js` as plain `<script>` tags (no bundler, no framework).
- Existing color tokens (`layout.njk`'s inline `tailwind.config`): `apple`
  (green, primary actions), `steel` (blue-gray, chrome/neutral text),
  `rose` (red, existing error banner in `layout.njk:57-59`), `success`
  (green, used for status pills in `macros.njk`). `sky` and `amber` are not
  customized but are available from Tailwind's default palette.

## Design

### API

`public/toast.js` (IIFE, matching `app.js`/`sse-client.js`'s style) exposes
one global:

```js
window.toast.show(message, { type = 'info', duration } = {})
// type: 'success' | 'error' | 'info' | 'warning'
```

Default `duration` per type: `4000`ms for `success`/`info`, `6000`ms for
`warning`, `0` (no auto-dismiss) for `error` — a failure waits for the user
to acknowledge it via the close button rather than risk disappearing
unread. Callers may pass an explicit `duration` to override.

### Markup

Each call renders a card and prepends it into `#toast-portal`:

```html
<div class="toast" data-toast-type="error" role="alert">
  <span class="toast-message">Job failed: ComfyUI timeout</span>
  <button type="button" class="toast-close" aria-label="Dismiss">×</button>
</div>
```

`role="alert"` for `error`/`warning` (interrupts screen readers
immediately), `role="status"` for `success`/`info` (announced politely).
No JS framework — `toast.js` builds these nodes with
`document.createElement`, following `app.js`'s existing pattern (e.g. the
autocomplete list in `app.js:167-182`).

### Position and stacking

`toaster.njk`'s portal is styled `fixed bottom-4 right-4 z-50 flex
flex-col-reverse gap-2` — bottom-right corner, new toasts prepended so the
stack grows upward. `layout.njk` includes the partial once, near the
`image-viewer.njk` include, so it's available on every page.

### Variant styling

Tailwind utility classes per `data-toast-type`, matching the app's existing
token usage:

| type      | background/border/text                                  |
|-----------|-----------------------------------------------------------|
| `success` | `bg-success-100 border-success-500 text-success-700` (+ dark) |
| `error`   | `bg-rose-50 border-rose-300 text-rose-800` (+ dark), matches the existing error banner in `layout.njk:57-59` |
| `info`    | `bg-sky-50 border-sky-300 text-sky-800` (+ dark)          |
| `warning` | `bg-amber-50 border-amber-300 text-amber-800` (+ dark)    |

### Dismissal

- Auto-dismiss via `setTimeout` (skipped when `duration` is `0`).
- A `×` button always dismisses immediately regardless of `duration`.
- Hovering a toast (`mouseenter`) pauses its timer; `mouseleave` resumes it
  with the remaining time — so a message can't vanish while being read.

### Animation

Tailwind's CDN build can't express custom easing/keyframes, so animation
CSS is added to `public/app.css` (same reasoning as the existing
`dialog[data-image-viewer]::backdrop` rule there), driven by a small FLIP
(First-Last-Invert-Play) routine in `toast.js`: capture each toast's
`getBoundingClientRect()` before a DOM change, make the change, then invert
and animate from the old position to the new one.

Two easing curves, as CSS custom properties:

- `--toast-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)` — overshoot/bounce
  approximation of a spring (true spring physics isn't expressible via CSS
  transitions). Used for the two "big" moves.
- `--toast-ease-out: cubic-bezier(0.16, 1, 0.3, 1)` — smooth deceleration,
  no bounce. Used for the passive reflow moves.

**Enter** (~350ms total):
1. The new toast is appended off-screen (`translateX(100%)`, `opacity:0`),
   which immediately reserves its layout space in the flex column.
2. Existing toasts above it animate from their pre-insertion position to
   their new one — `--toast-ease-spring`, ~250ms ("slide up").
3. ~100ms later, the new toast animates `translateX(100%)→0`,
   `opacity 0→1` — `--toast-ease-out`, ~250ms ("slide in from the side").

**Exit**:
1. On dismiss (auto or manual), the toast animates
   `translateX(0)→100%`, `opacity 1→0` — `--toast-ease-spring`, ~250ms.
2. On `transitionend`, the node is removed from the DOM.
3. The remaining toasts above it animate from their pre-removal position to
   their new (shifted-down) one — `--toast-ease-out`, ~250ms ("slide down
   to fill").

`prefers-reduced-motion: reduce` disables the slide/spring transforms
(toasts still fade in/out) since this app already supports
`prefers-color-scheme` media-query-based theming and this is the same kind
of user preference.

### Integration scope (this pass)

- Build `toast.js` and wire it up (script tag + `toaster.njk` include) in
  `layout.njk`.
- Implement `copy.js`'s empty `[data-copy-target]` handler: on click, copy
  the target's text via `navigator.clipboard.writeText`, then
  `toast.show('Copied to clipboard', { type: 'success' })` on success or
  `toast.show('Could not copy to clipboard', { type: 'error' })` on
  failure (clipboard API can reject, e.g. without a secure context or
  permission).

### Explicitly out of scope

- Replacing `app.js`'s existing `window.alert('Delete failed...')`
  (`data-delete-url` handler) or the silent-catch on
  `data-randomize-seed` failure. Both are toast-shaped, but left for a
  follow-up so this pass stays scoped to the module plus the one stub
  (`copy.js`) that already exists for it.
- Queuing a toast across a full-page reload/redirect (e.g. via
  `sessionStorage`). Reload-driven flows already show their result inline
  (the promoted image, `layout.njk`'s error banner) — a toast would be
  redundant. Can be added later if a real gap shows up.
- Any server-side/SSE-triggered toasts. `sse-client.js`'s inline status
  text (`data-sse-status`) already serves that role for job progress.

## Testing

- Manual verification via the `run` skill: trigger `copy.js`'s
  click-to-copy on a page that has `[data-copy-target]`, confirm the
  success toast appears, animates in, auto-dismisses after 4s, and that
  clicking `×` on a manually-triggered `error`/`warning` toast (simulate
  via the browser console: `toast.show('test', { type: 'error' })`)
  dismisses it since it has no auto-dismiss timer.
- Trigger two toasts in quick succession and confirm the enter/exit
  choreography (existing toasts reflow before/after the affected one
  animates) rather than everything jumping instantly.
- Confirm dark mode variant colors read correctly for all four types.
- No unit tests apply — this is client-side-only DOM/animation code with no
  existing test harness for `public/*.js` in this repo (`app.js`,
  `sse-client.js`, etc. are also untested).
