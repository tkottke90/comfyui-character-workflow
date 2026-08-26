# Split Casting Preflight / Batch Nav — Design

## Problem

The character subnav (`character-subnav.njk`) has a single **"Casting"**
tab, and it always links to `/casting/preflight`. There is no way to reach
`/casting/batch` from the top-level nav directly — the only path is
Preflight's own "Continue to Casting Batch →" link at the bottom of the
page. Once a character's preflight is done, every later visit to Batch
(e.g. queuing another round of candidates) still has to route through
Preflight first, which is unnecessary given Batch is otherwise a normal
peer page like Refinement or Validation.

## Current architecture (relevant parts)

- `character-subnav.njk` builds its tab list from a single `tabs` array
  (7 entries today: Spec, Casting, Refinement, Targeted Fix, Images,
  Anchor kit, Validation, Dataset). Every tab is always rendered and
  always clickable — nothing in this list is gated on phase-completion
  state, even though that state exists elsewhere
  (`character-logic.ts`'s `isPhaseComplete` / `getNextAction`). The active
  tab is whichever one's `key` matches the page's `subsection` variable.
- Three templates currently set `subsection = "casting"`:
  `casting_preflight.njk`, `casting_batch.njk`, and `winner_audit.njk`.
  All three therefore highlight the same single "Casting" tab today.
- `casting_preflight.njk` has an in-page link at the bottom,
  `Continue to Casting Batch →`, pointing at `/casting/batch` — today this
  is the *only* way to reach Batch from Preflight.
- `casting_batch.njk` has its own in-page link,
  `Continue to Winner Audit →`, shown once a winner is selected — Winner
  Audit is reached only through this link, never from the top nav. This
  design doesn't change that.
- The responsive mobile variant (`#character-subnav-menu`, added in
  "Replace wrapping character subnav with a responsive dropdown") is
  generated from the same `tabs` array, so no separate change is needed
  there.

## Design

### Two peer tabs instead of one

Replace the single `casting` entry in `character-subnav.njk`'s `tabs`
array with two entries, in the same position:

```js
{ key: 'casting-preflight', label: 'Casting Preflight', href: '/characters/' + character.slug + '/casting/preflight' },
{ key: 'casting-batch', label: 'Casting Batch', href: '/characters/' + character.slug + '/casting/batch' },
```

Both are always enabled and clickable — consistent with how every other
tab in this list already behaves. No new gating logic (e.g. disabling
Batch until Preflight's checklist is complete) is introduced; the checklist
still lives on the Preflight page itself and still governs phase
completion/status, just not tab clickability.

### Subsection key changes

- `casting_preflight.njk`: `subsection` changes from `"casting"` to
  `"casting-preflight"`.
- `casting_batch.njk` and `winner_audit.njk`: `subsection` changes from
  `"casting"` to `"casting-batch"`. Winner Audit is a sub-step reached only
  via Batch's in-page link (per explicit scope decision below), so it
  highlights the Batch tab rather than introducing a third tab or leaving
  nothing highlighted.

### Remove the now-redundant in-page link

`casting_preflight.njk`'s "Continue to Casting Batch →" link is removed.
With Batch directly in the top nav, the link duplicates a control that's
now always one click away from anywhere in the character's pages, on both
desktop and the mobile dropdown.

`casting_batch.njk`'s "Continue to Winner Audit →" link is unchanged —
Winner Audit still has no nav tab of its own (see out-of-scope, below), so
this remains its only entry point.

## Error handling & edge cases

This is a static nav/template change with no new routes, forms, or
server-side logic — there is no new failure mode to handle. The two tabs
are plain links to existing, already-working routes.

## Testing

- **Manual verification**: for a character in various states (draft,
  preflight in progress, preflight complete with candidates queued, winner
  selected), confirm:
  - Both "Casting Preflight" and "Casting Batch" tabs render, in both the
    desktop tab row and the mobile dropdown.
  - Visiting `casting/preflight` highlights "Casting Preflight"; visiting
    `casting/batch` or `winner-audit` highlights "Casting Batch".
  - Clicking "Casting Batch" from any other character page (e.g. Spec,
    Refinement) lands directly on the batch grid — no detour through
    Preflight.
  - The mobile dropdown's trigger label matches the active tab's label
    (`activeLabel`) correctly for both new keys.
  - The removed "Continue to Casting Batch →" link no longer appears on
    the Preflight page; the "Continue to Winner Audit →" link still
    appears on Batch once a winner is selected.

No unit/route tests are needed — no server-side code changes.

## Explicitly out of scope

- Gating/disabling the Batch tab until Preflight's checklist is complete.
  Every other tab in this nav is always enabled regardless of phase
  progress; this change keeps that consistent rather than introducing new
  conditional-nav behavior.
- A third nav tab for Winner Audit. It only makes sense once a winner
  candidate exists, so surfacing it at the top level before that point
  would be misleading; it stays reachable via the existing in-page link
  from Batch.
- Any change to phase-completion logic, `character-logic.ts`, or the
  `getNextAction`/status derivation used elsewhere in the app.
