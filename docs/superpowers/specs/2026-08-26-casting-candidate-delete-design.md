# Casting Batch — Delete Candidate — Design

## Problem

A casting batch run produces 8–16 candidate images per submission, and
users typically run several batches while hunting for a seed. The batch
grid (`casting_batch.njk`) only ever grows — there is no way to remove a
candidate that's an obvious miss (wrong pose, artifact, off-model) or one
the user has simply ruled out, so narrowing down a large batch means
scrolling past everything that's already been rejected.

## Current architecture (relevant parts)

- `character.castingCandidates` is an array of
  `{ seed, note, createdAt, imagePath }` (`src/schemas/character.schema.ts`).
  `imagePath` starts empty and is set exactly once, by
  `execution.service.ts` (`runBatchSubJob`), after that seed's job
  completes successfully. A candidate whose job is still queued, still
  running, or has failed has `imagePath === ''` — there is no separate
  status field on the candidate itself; the job's live status only exists
  transiently in `jobStore` while a batch is in flight.
- Each candidate's image file lives on disk at
  `casting_batch/seed-<seed>.<ext>` under the character's directory,
  written by `character-images.service.ts`'s `storeCastingCandidate`.
- `casting_batch.njk` renders one tile per candidate
  (`data-casting-tile data-seed="{{ candidate.seed }}"`). Non-winner tiles
  render a "Select as winner" form
  (`POST /:slug/casting/candidates/:seed/select`); the winner tile renders
  a "winner" pill instead.
- While a batch is in flight, `public/sse-client.js`'s `patchBatchTiles`
  patches each tile in place from SSE events (swapping the placeholder for
  an `<img>`, updating a status line) rather than reloading the page — a
  reload would lose the in-progress state of every candidate that hadn't
  finished yet.
- A separate, generic working-file delete already exists
  (`POST /:slug/images/:phaseBindingKey/:filename/delete`,
  `character-images.service.ts`'s `deleteWorkingFile`) but a prior design
  (`2026-08-25-character-image-management-design.md`) explicitly excluded
  casting candidates from it, leaving casting deletion as a future,
  casting-specific flow. This project is that flow.

## Design

### Gate: only completed candidates are deletable

"Completed" is defined as `candidate.imagePath` being truthy — the same
signal the template already uses to choose between rendering the image and
the placeholder. Because `imagePath` is only ever written on job success,
this one condition already excludes queued, running, **and** failed
candidates, with no new field required. The winner candidate is excluded
separately (its own branch already renders a pill instead of the action
row).

This is enforced twice:

- **Server**: the delete route no-ops (see below) if the candidate is not
  completed or is the current winner, rather than trusting the UI to have
  hidden the control.
- **Client**: the Delete control is only rendered/visible for completed,
  non-winner candidates.

### 1. Backend: `deleteCastingCandidate`

New method on `character-images.service.ts`, alongside `deleteWorkingFile`:

```
deleteCastingCandidate(slug, seed): { deleted: boolean }
```

- Resolves the candidate's file the same way `computeCastingCandidates`
  does (scans `casting_batch/` for the `seed-<seed>.<ext>` pattern),
  reusing the existing path-containment helpers.
- If no matching file exists, returns `{ deleted: false }` — idempotent,
  not an error (double-delete, or delete of a candidate that never
  produced a file, both land here safely).
- Otherwise `unlinkSync`s the file and returns `{ deleted: true }`.

### 2. Route

New route in `characters.views.ts`, next to the existing select route:

```
POST /:slug/casting/candidates/:seed/delete
```

- Loads the character, finds the matching entry in `castingCandidates`.
- No-ops (redirects without changes) if: no matching seed, the seed has no
  `imagePath` (not completed), or the seed equals
  `character.winnerCandidateSeed`.
- Otherwise calls `characterImages.deleteCastingCandidate(slug, seed)`,
  then `characters.update` with the candidate filtered out of
  `castingCandidates`.
- Redirects back to `/characters/:slug/casting/batch`.

### 3. Template

In `casting_batch.njk`, inside the existing non-winner branch, add a
Delete form next to "Select as winner":

```html
<span data-tile-delete class="{{ '' if candidate.imagePath else 'hidden' }}">
  <form method="post" action="/characters/{{ character.slug }}/casting/candidates/{{ candidate.seed }}/delete"
    onsubmit="return confirm('Delete this candidate? This cannot be undone.');">
    <button type="submit" class="text-[12px] font-semibold text-rose-700 dark:text-rose-300 hover:underline">Delete</button>
  </form>
</span>
```

Same rose-colored/`confirm()` pattern as the Images gallery's delete
control (`images.njk`). The wrapper is always rendered so the SSE client
(below) has something to unhide — it's just server-side `hidden` until the
candidate has an image.

### 4. Live-update: unhide Delete when a candidate completes mid-session

`patchBatchTiles` in `sse-client.js` already runs per sub-job on every SSE
message. Add one step: when `sub.status === 'done'`, find
`tile.querySelector('[data-tile-delete]')` and remove its `hidden` class.
No new HTML is constructed client-side — the form was already server-rendered,
just hidden, so this is a plain class toggle consistent with how the
existing code toggles the status text.

No change is needed for candidates that fail — their `data-tile-delete`
wrapper stays hidden, which is correct (a failed candidate has no
`imagePath` and is therefore not deletable through this flow, consistent
with the gate above).

## Error handling & edge cases

- **Delete of a non-existent seed**: route no-ops, redirects normally.
- **Delete of a queued/running/failed candidate hit directly** (URL typed
  or replayed, bypassing the hidden UI): route no-ops rather than erroring
  or partially deleting.
- **Delete of the current winner hit directly**: route no-ops; the winner
  can only be removed by first selecting a different winner.
- **File already missing on disk** (e.g. deleted out of band): treated as
  success, matching `deleteWorkingFile`'s existing idempotent behavior.
- **Path containment**: `deleteCastingCandidate` reuses the same
  containment helpers as the rest of `character-images.service.ts`, so a
  crafted seed segment can't escape the character's own directory.

## Testing

- **Unit tests** (`character-images.service.test.ts`, alongside the
  existing `deleteWorkingFile` tests): normal delete, idempotent
  re-delete of a missing file.
- **Route tests**: delete removes the candidate from
  `castingCandidates` and redirects; no-op when the seed is
  incomplete (no `imagePath`); no-op when the seed is the current winner;
  no-op when the seed doesn't exist.
- **Manual verification**: run a casting batch, delete a completed
  non-winner candidate and confirm it's gone from the grid and disk;
  confirm no Delete link appears on tiles still queued/running; start a
  fresh batch, watch a tile complete live via SSE, and confirm its Delete
  link appears without a page reload; confirm the winner tile never shows
  a Delete link.

## Explicitly out of scope

- Any change to the generic `deleteWorkingFile` route/flow — casting
  candidates keep their own delete path, as called out in the prior image
  management design.
- Bulk/multi-select delete. This is a single-candidate action, matching
  the granularity of "Select as winner".
- Deleting the current winner in one step (delete-and-clear-winner). The
  winner must be changed via the existing select flow first.
