# Winner Audit — Show the Whole Character Image — Design

## Problem

The Winner Audit page (`src/templates/characters/winner_audit.njk`) exists
so the user can compare the winning candidate's photo against the character
spec, attribute by attribute, before locking the seed. The photo is
currently cropped to a fixed `3:4` box, so any generated image whose native
aspect ratio differs from `3:4` gets cut off. Attributes near the cropped
edges (hair length, clothing, pose, background details) can't be verified —
defeating the point of the page.

## Current implementation

```njk
<!-- src/templates/characters/winner_audit.njk:17-22 -->
{% if winner and winner.imagePath %}
  <img src="/characters/{{ character.slug }}/images/file/{{ winner.imagePath }}"
    class="aspect-[3/4] max-h-[440px] w-full object-cover rounded-lg" alt="" />
{% else %}
  <div class="aspect-[3/4] max-h-[440px] placeholder-photo rounded-lg"></div>
{% endif %}
```

`aspect-[3/4]` forces a fixed-ratio box; `object-cover` then fills that box
by cropping whatever doesn't fit. This same `aspect-[…] … object-cover`
combination is the project's standard treatment for photo **tiles** —
`casting_batch.njk`, `casting_preflight.njk`, `targeted_fix.njk`,
`refinement.njk`, `images.njk`, `list.njk` all use it for grids/thumbnails,
where a uniform crop is the intended look. Winner Audit is not a thumbnail
grid — it's a single-image detail view whose whole purpose is inspecting
the full photo — so it should not share that treatment.

The codebase already has a precedent for showing an image uncropped:
`templates/detail.njk` and `templates/library.njk` (the unrelated
"templates" feature) use `object-contain` to shrink an image to fit a box
without cropping it.

## Design

Replace the cropped `object-cover` box with a letterboxed, `object-contain`
box, scoped to `winner_audit.njk` only:

```njk
{% if winner and winner.imagePath %}
  <div class="flex items-center justify-center max-h-[520px] h-full bg-steel-50 dark:bg-steel-900 rounded-lg p-2">
    <img src="/characters/{{ character.slug }}/images/file/{{ winner.imagePath }}"
      class="max-h-full max-w-full object-contain rounded-md" alt="" />
  </div>
{% else %}
  <div class="aspect-[3/4] max-h-[440px] placeholder-photo rounded-lg"></div>
{% endif %}
```

- The wrapping `<div>` is a fixed-height, centered flex box with a subtle
  background (`bg-steel-50` / dark-mode `bg-steel-900`) so any letterboxed
  space around a non-matching-aspect-ratio image reads as intentional
  padding, not a layout bug.
- The `<img>` drops `aspect-[3/4] w-full object-cover` for
  `max-h-full max-w-full object-contain`: it now shrinks to fit inside the
  box on whichever axis is constraining, so the entire image is always
  visible regardless of its native aspect ratio.
- The empty-state placeholder (no winner selected yet) is unchanged — there
  is no real photo to letterbox, so the existing `aspect-[3/4]
  placeholder-photo` box stays as-is.

No route or data changes — this is template-only.

## Explicitly out of scope

- The grid/thumbnail views (Casting Batch, Casting Preflight, Targeted Fix,
  Refinement, the finalized-images gallery) — their fixed-ratio crop is
  intentional for a uniform grid and is not changed.
- Click-to-enlarge / lightbox — no such pattern exists anywhere in this
  codebase yet, and the letterboxed in-place view already shows the whole
  image without needing one.

## Testing

- **Manual verification**: open Winner Audit for a character with a winning
  candidate photo whose aspect ratio is not `3:4` (e.g. a square or
  differently-proportioned generation) and confirm the entire image renders
  without cropping, letterboxed within the box. Then check a character with
  no winner selected yet and confirm the placeholder box still renders as
  before. Spot-check both light and dark mode for the letterbox background.
- No unit tests apply — this is a CSS/markup-only change with no logic to
  cover.
