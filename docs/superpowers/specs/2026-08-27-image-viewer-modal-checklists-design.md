# Image Viewer Modal + In-Modal Checklists — Design

## Problem

Several pages show generated images inside small, fixed-size boxes —
`aspect-[2/3] max-h-[520px]` on Casting Preflight, `aspect-[3/4]` grid tiles
on Casting Batch, Refinement's picker, and the Images gallery. There is no
way to inspect a candidate closely; the user has to squint at a ~250px-wide
thumbnail to judge things like face detail, hand artifacts, or background
mismatches. Separately, on Casting Preflight, Winner Audit, and Refinement,
the checklist/audit panel that the user is meant to be checking the image
*against* lives in a side column or a section below the image — inspecting
closely (zoomed in mentally, or just moving the mouse to a checkbox) means
losing sight of the detail you were just checking.

## Current implementation

No click-to-enlarge/lightbox exists anywhere in the app today — confirmed
across `src/`, `public/`, and the design-system prototype's `Dialog.jsx`
(a reference component, not wired into the running app). Six image surfaces
are in scope for this change:

- **Casting Preflight** hero image — `casting_preflight.njk:15-27`, single
  image in an `aspect-[2/3] max-h-[520px]` box.
- **Casting Batch** candidate grid — `casting_batch.njk:53-83`, each tile's
  whole surface is already a `<form>`/`<button type=submit>` for
  select/delete (`casting_batch.njk:69-77`).
- **Winner Audit** winner image — `winner_audit.njk:17-24`, single
  letterboxed (`object-contain`) image.
- **Refinement** — three surfaces on one page: input image
  (`refinement.njk:39-46`, click-to-upload), output preview
  (`refinement.njk:75-83`), and the "choose from library" picker grid
  (`refinement.njk:55-68`, tiles are also submit buttons).
- **Images gallery** — `images.njk:28-61`, tiles with action links/delete
  forms below each thumbnail, no click behavior on the image itself.

Checklists/audit rows, all backed by `character.checklist` (a flat
`Record<string, boolean>`, `src/schemas/character.schema.ts:175`) or
`character.auditRows`, always full-page POST and redirect back to the same
route — there is no JSON/AJAX response anywhere in the app today:

- Preflight: `ui.checkrow` macro loop (`casting_preflight.njk:56-75`) →
  `POST /:slug/casting/preflight` (`characters.views.ts:508-534`, redirects).
- Refinement: same `ui.checkrow` macro (`refinement.njk:180-187`) →
  `POST /:slug/refinement` (`characters.views.ts:792+`, redirects).
- Winner Audit: bespoke attribute-audit rows, not the checkbox macro
  (`winner_audit.njk:26-65`) → `POST /:slug/casting/audit-rows/:index/toggle`
  and `.../amend` (`characters.views.ts:627-661`, both redirect).

## Design

### Shared viewer component

One `<dialog>`-based viewer, following the native-`<dialog>` pattern from
the design system's `Dialog.jsx` (ported to Nunjucks + vanilla JS, matching
how `public/app.js`/`mask-editor.js` already drive `data-*`-attributed
widgets — no new client framework). Two new files:

- `src/templates/partials/image-viewer.njk` — a macro rendering one hidden
  `<dialog data-image-viewer>` per page, with an `<img>`, prev/next arrow
  buttons, a close button, and an empty `<div data-viewer-checklist-slot>`.
- `public/image-viewer.js` — IIFE module (same style as `app.js`), wires
  triggers to the dialog, handles prev/next, and handles in-modal checklist
  submits.

### Trigger markup

Each existing image element gets `data-viewer-trigger="<full-size-image-url>"`.
Where the whole tile is already a form/button (Casting Batch, Refinement
picker, Images gallery), a small overlay expand icon
(`<button type="button" data-viewer-trigger="..." class="absolute top-1 left-1 ...">`)
is added instead of repurposing the tile's existing click target, so
select/delete/pick behavior is untouched. Grid tiles additionally get
`data-viewer-group="casting-batch"` (or `refinement-picker`,
`images-gallery`) so `image-viewer.js` can collect sibling image URLs for
prev/next; single-image surfaces (Preflight hero, Winner Audit, Refinement
input/output) have no group and render without arrows.

### Sizing

The dialog's image area is capped at `max-h-[80vh]` (a new
viewport-relative convention for this app — everything else uses fixed px
— justified here because it's a full-image inspector, not a page layout
box). Content is a flex column: image area first, then, when present, the
checklist/audit panel below on narrow viewports or beside it at `lg:` width,
matching the existing side-panel layout each page already uses.

### Checklist/audit panel: moved, not duplicated

Duplicating the checklist markup into the dialog would create duplicate
checkbox `name`/`id` attributes and risk double-submission. Instead, the
existing panel is given a stable id —
`id="preflight-checklist-panel"` (`casting_preflight.njk`),
`id="refinement-checklist-panel"` (`refinement.njk`),
`id="winner-audit-panel"` (`winner_audit.njk`) — and `image-viewer.js`
physically moves that DOM node into `data-viewer-checklist-slot` on open,
restoring it to its original parent/position on close. Exactly one live
copy of the controls exists at all times, so the plain-form fallback (JS
disabled) is unaffected — the panel just never leaves its normal spot.

Preflight and Refinement triggers point at their page's `ui.checkrow`
panel; Winner Audit's single trigger points at the attribute-audit rows
card (`winner_audit.njk:26-65`), full interactivity included (flag
mismatch, amend spec, reject candidate). Casting Batch, Refinement's
picker grid, and the Images gallery have no page-level checklist, so their
triggers omit `data-viewer-checklist` and the modal is image+nav only.

### In-modal checklist/audit submits without closing the modal

`casting/preflight`, `refinement`, and `casting/audit-rows/:index/toggle`
and `.../amend` (`characters.views.ts:508, 627, 642, 792`) get one small
addition each: when the request carries `X-Requested-With: fetch` (sent by
`image-viewer.js`'s submit handler), the handler responds
`res.json({ checklist })` (or the updated row) instead of redirecting. The
existing redirect path is unchanged for the plain-form case — this is
additive. `image-viewer.js` intercepts `submit` events on any form inside
`data-viewer-checklist-slot`, does `fetch(form.action, { method: 'POST',
body: new FormData(form), headers: { 'X-Requested-With': 'fetch' } })`,
and on success patches just the affected checkbox's checked state / audit
row's classes from the JSON response — no reload, modal stays open.

### Closing behavior

Standard `<dialog>` semantics: Escape key, backdrop click, and a close
button all call `.close()`; the `close` event handler is what moves the
checklist panel back and clears the image `src`.

## Explicitly out of scope

- Any page/surface beyond the six listed above — `targeted_fix.njk`,
  `kit.njk` (Anchor Kit), and `list.njk` also render image tiles but were
  not selected for this pass.
- Deep zoom/pan within the enlarged image (pinch-to-zoom, click-to-zoom
  past 100%) — the ask is a bigger view (80vh), not a magnifier.
- Any change to the existing full-page-POST checklist/audit behavior
  outside the modal — forms still redirect exactly as they do today when
  submitted from their normal on-page location.
- SSE-driven tile patching (`data-sse-batch`, `sse-client.js`) is untouched;
  moving the checklist panel doesn't interact with it since SSE only ever
  targets `data-sse-*` elements, never the checklist DOM.

## Testing

- **Manual verification** via the `run` skill on each of the six surfaces:
  open/close, prev/next on the three grids (Casting Batch, Refinement
  picker, Images gallery), and confirming the overlay expand icon doesn't
  trigger the tile's underlying select/delete/pick form.
- Toggle a checklist item and an audit row from inside the modal on
  Preflight, Refinement, and Winner Audit; confirm the change reflects
  immediately without the modal closing, and reload the page to confirm it
  actually persisted server-side.
- Disable JavaScript and confirm every page's checklist/audit form still
  submits and redirects exactly as it does today (no click-to-enlarge
  available, which is expected — it's a progressive enhancement).
- No unit tests apply to the client-side viewer itself; the two modified
  route handlers (preflight, refinement, audit-rows toggle/amend) get
  focused unit-test additions for the new `X-Requested-With: fetch` → JSON
  branch, alongside their existing redirect-path tests.
