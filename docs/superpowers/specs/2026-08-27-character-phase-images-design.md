# Character Phase Images (Display Image + Phase Pill) — Design

## Problem

The `/characters/{slug}/images` gallery already shows a "current" pill for
whichever image is the newest working file per phase binding, but that
signal is entirely filesystem-derived (`character-images.service.ts`'s
`listGalleryTiles`) — nothing about "which image represents this character
right now" is persisted in the character's own frontmatter. Two gaps follow
from that:

- Casting-winner candidates never get a "current"-style pill in the images
  gallery at all today, even though a winner is explicitly selected via
  `POST /:slug/casting/candidates/:seed/select`.
- The `/characters` list page has no display image for any character —
  every card renders the same placeholder block, regardless of how far
  along the character is.

This project adds a small, explicit record of "the image that represents
this character, per phase" to the character's YAML frontmatter, uses it to
drive both a consistent gallery pill (pre-flight + casting only) and the
`/characters` list thumbnail, and keeps the existing filesystem-derived
"current" pill for every other phase (refinement, etc.) untouched.

## Current architecture (relevant parts)

- `character.images` (`ImageAssetSchema`: `label`, `path`, `maskPath`,
  `notes`) is a small, hand-curated "kit" list — Hero full-body, Face crop,
  etc. — written via `upsertImage()` in `characters.views.ts`. It is
  unrelated to the live gallery and is **not** touched by this project.
- `character.castingCandidates` (`CastingCandidateSchema`: `seed`, `note`,
  `createdAt`, `imagePath`) plus `character.winnerCandidateSeed` track
  casting. The winner is a pointer (`winnerCandidateSeed`), not a flag on
  the candidate itself. Selecting a winner
  (`POST /:slug/casting/candidates/:seed/select`,
  `characters.views.ts:562`) only ever writes `winnerCandidateSeed` today.
- Pre-flight has no dedicated schema section — it's `checklist['preflight.*']`
  booleans plus a `heroPath` text note stored in the `images` kit list under
  label `'Hero full-body'` (`characters.views.ts:496`, the "Save Pre-flight"
  handler, `POST /:slug/casting/preflight`). The actual pre-flight image
  file is a working file under the `casting_preflight` phase binding,
  independent of that text note.
- `character-images.service.ts`'s `getCurrentWorkingFile(slug,
  phaseBindingKey, kind)` returns the newest working file for a phase
  binding — the single existing definition of "current" for working files.
- `listGalleryTiles(slug)` (`character-images.service.ts:317`) computes
  `GalleryTile[]` purely from disk: working tiles get `isCurrent: true` for
  the newest file per `phaseBindingKey`; finalized and casting tiles always
  get `isCurrent: false`.
- `GET /:slug/images` (`characters.views.ts:210`) renders those tiles in
  `images.njk`, which shows a green "current" pill when `tile.isCurrent`
  (line 37-39). Casting tiles have no pill branch for this today.
- `GET /` (character list, `characters.views.ts:166`) renders
  `characters/list.njk`, which currently renders only a placeholder block
  per character (no image, no display-image concept exists anywhere in the
  schema).

## Design

### 1. Data model: `phaseImages`

New field on `CharacterSchema` (`src/schemas/character.schema.ts`),
independent of the existing `images` kit array:

```ts
export const PhaseImageSchema = z.object({
  phase: z.enum(['preflight', 'casting']),
  path: z.string(),
  display_image: z.boolean().default(false),
  selectedAt: z.string(),
});

// on CharacterSchema:
phaseImages: z.array(PhaseImageSchema).default(() => []),
```

- `path` is a character-relative path, the same convention as
  `ImageAsset.path` / `CastingCandidate.imagePath` (e.g.
  `casting_preflight/2026...-image.png`, `casting_batch/seed-123.png`).
- `selectedAt` is an ISO timestamp, recorded for audit/debugging — not
  otherwise consumed by this project.
- The array holds **at most one entry per phase** (`preflight`, `casting`).
  Each phase's entry is replaced in place, never appended to, by every
  write in this project.
- Existing characters get `phaseImages: []` automatically via the Zod
  default when their frontmatter is parsed — no migration script needed;
  `character-markdown.ts` already round-trips unknown/defaulted array
  fields the same way it does for `castingCandidates` today.

#### Invariant: at most one `display_image: true`

Enforced structurally, not by convention or a cross-field Zod refinement.
A single helper, alongside the existing `upsertImage()` in
`characters.views.ts`:

```ts
function upsertPhaseImage(
  phaseImages: CharacterRecord['phaseImages'],
  phase: 'preflight' | 'casting',
  path: string,
  displayImage: boolean,
): CharacterRecord['phaseImages'] {
  const withoutPhase = phaseImages.filter((p) => p.phase !== phase);
  const cleared = displayImage
    ? withoutPhase.map((p) => ({ ...p, display_image: false }))
    : withoutPhase;
  return [...cleared, { phase, path, display_image: displayImage, selectedAt: new Date().toISOString() }];
}
```

This is the **only** function in the codebase that writes to
`phaseImages`. Because it always clears every other entry's
`display_image` before setting a new `true`, and because both write paths
below go through it, "at most one `display_image: true`" is guaranteed by
construction — no separate validation pass is needed.

### 2. Write path: Save Pre-flight

`POST /:slug/casting/preflight` (`characters.views.ts:496`) gains one more
step alongside its existing checklist/`heroPath` update:

- Look up the current pre-flight working file:
  `characterImages.getCurrentWorkingFile(character.slug, 'casting_preflight', 'image')`.
- If one exists, compute
  `displayImage = !character.phaseImages.some((p) => p.phase === 'casting')`
  (pre-flight becomes the display image only while no casting winner exists
  yet — once casting exists, it always outranks pre-flight, per the
  hand-off rule below) and call
  `upsertPhaseImage(character.phaseImages, 'preflight', file.relativePath, displayImage)`.
- If no working file exists yet (pre-flight checklist saved before any
  image has been generated), skip the upsert entirely — nothing to record.
- Persist via the same `characters.update(...)` call already being made for
  `checklist`/`images`.

This is the "align with the Save Pre-flight button" trigger: no new UI, no
change to when pre-flight images are generated — only the existing Save
action additionally snapshots "this is the pre-flight image" into
`phaseImages`.

### 3. Write path: Select Casting Winner

`POST /:slug/casting/candidates/:seed/select` (`characters.views.ts:562`)
gains one more step alongside its existing `winnerCandidateSeed` update:

- Find the selected candidate in `character.castingCandidates` by seed.
- Call `upsertPhaseImage(character.phaseImages, 'casting', candidate.imagePath, true)`
  — casting winners are always the display image the moment they're
  selected (per your confirmed hand-off rule), which also clears
  pre-flight's `display_image` if it was set.
- Persist via the same `characters.update(...)` call.

### 4. Read path: Images gallery pill

`GET /:slug/images` (`characters.views.ts:210`), after calling
`characterImages.listGalleryTiles(...)`, post-processes the tile list
before rendering:

```ts
const phaseImagePaths = new Set(character.phaseImages.map((p) => p.path));
const tiles = characterImages.listGalleryTiles(character.slug).map((tile) => {
  const inScope =
    (tile.source.kind === 'working' && tile.source.phaseBindingKey === 'casting_preflight') ||
    tile.source.kind === 'casting';
  return inScope ? { ...tile, isCurrent: phaseImagePaths.has(tile.relativePath) } : tile;
});
```

- Pre-flight working tiles and casting tiles have `isCurrent` driven
  entirely by `phaseImages` membership instead of the live filesystem
  computation.
- Every other working tile (refinement, targeted-fix, any future phase
  binding) is untouched — `tile.isCurrent` keeps its existing
  filesystem-derived value.
- `images.njk` needs no template change: it already renders the pill off
  `tile.isCurrent` (line 37-39) for every tile kind, so casting tiles start
  showing a "current" pill for the first time as a side effect of this
  override, with no new branch required.

### 5. Read path: `/characters` list display image

`GET /` (`characters.views.ts:166`) computes a display path per character
before rendering:

```ts
res.render('characters/list.njk', {
  characters: characters.list().map((character) => ({
    ...character,
    displayImagePath: character.phaseImages.find((p) => p.display_image)?.path ?? null,
  })),
});
```

`list.njk`'s placeholder block becomes:

```html
<div class="aspect-[3/4] {{ '' if character.displayImagePath else 'placeholder-photo' }} flex items-center justify-center text-steel-400 text-xs overflow-hidden">
  {% if character.displayImagePath %}
    <img src="/characters/{{ character.slug }}/images/file/{{ character.displayImagePath }}" class="w-full h-full object-cover" alt="" />
  {% elif character.status == 'draft' %}
    not generated yet
  {% endif %}
</div>
```

Reuses the existing `/characters/:slug/images/file/:path` static route
(`characters.views.ts`) — no new file-serving route needed. Characters
with no `phaseImages` entry yet (never run pre-flight) fall back to
today's placeholder exactly as before.

## Error handling & edge cases

- **Pre-flight saved with no working file yet**: no `phaseImages` write;
  list page keeps the placeholder, images gallery has nothing to mark
  current (unchanged from today, since there's no image at all).
- **Pre-flight working file deleted after being recorded**: `phaseImages`
  keeps the stale path (`display_image`/pill logic references a path with
  no backing file). `list.njk`'s `<img>` tag would 404-render broken —
  acceptable and consistent with how `casting_batch` candidate deletion
  today does not scrub `winnerCandidateSeed` either; not addressed by this
  project.
- **Re-saving pre-flight after a winner already exists**: preflight entry
  is written/replaced with `display_image: false`; casting's `true` is
  left alone by `upsertPhaseImage` (it only clears other entries when the
  new one is `true`).
- **Selecting a different casting winner**: `upsertPhaseImage` replaces the
  single `casting` entry outright — no stale second casting entry.
- **Casting winner re-selected after `casting/lock`**: out of scope (see
  below) — locking doesn't touch `phaseImages`, so the casting entry keeps
  pointing at whichever candidate was last selected, independent of lock
  state.

## Testing

- **Unit tests** (`character.schema.test.ts` or similar): `PhaseImageSchema`
  parses/defaults correctly; `upsertPhaseImage` — clears other entries only
  when setting `true`, replaces same-phase entry in place, leaves array
  untouched shape for the untouched phase.
- **Route tests** (`characters.views.test.ts`):
  - Save Pre-flight with an existing working file writes a `preflight`
    `phaseImages` entry with `display_image: true` when no casting entry
    exists, `false` when one does.
  - Save Pre-flight with no working file leaves `phaseImages` unchanged.
  - Select Winner writes a `casting` entry with `display_image: true` and
    clears any existing preflight `display_image`.
  - `GET /:slug/images`: pre-flight and casting tiles' `isCurrent` reflect
    `phaseImages` membership; a refinement working tile's `isCurrent` is
    unaffected by an unrelated `phaseImages` state.
  - `GET /`: `displayImagePath` resolves to the `display_image: true`
    entry's `path`, or `null` when `phaseImages` is empty.
- **Manual verification**: run pre-flight, hit Save Pre-flight, confirm the
  images gallery shows a "current" pill on that image and the character
  list shows it as the thumbnail; run a casting batch and select a winner,
  confirm the pill moves to the casting tile in the images gallery and the
  list thumbnail switches to the winner; re-save pre-flight after a winner
  exists and confirm the list thumbnail stays on the winner.

## Explicitly out of scope

- Any change to the hand-curated `images` kit array or its `upsertImage()`
  flow — `phaseImages` is a separate array with a separate schema.
- Extending `phaseImages`/frontmatter-driven "current" pills to any phase
  beyond `preflight` and `casting` (refinement, targeted-fix, locked, etc.)
  — those keep today's live filesystem-derived `isCurrent`.
- A manual "set as display image" UI action — the display image is fully
  derived from the automatic pre-flight/casting hand-off rule.
- Any change to `POST /:slug/casting/lock` or the promotion of the winner
  into the `refinement_face_detail` phase binding — `phaseImages` is not
  touched by locking.
- Scrubbing `phaseImages` when a working file or casting candidate is
  deleted out from under it (see Edge Cases above).
