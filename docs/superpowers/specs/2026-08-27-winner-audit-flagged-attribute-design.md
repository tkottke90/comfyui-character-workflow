# Winner Audit — Fix Missing Photo & Stuck Warning — Design

## Problem

The Winner Audit page (`src/templates/characters/winner_audit.njk`) is
meant to be the last checkpoint before locking a seed: compare the winning
candidate's photo against the character spec, adjust anything that's off,
then lock. Two things are broken:

1. **The winning candidate's photo never appears.** The photo slot is a
   static placeholder `<div>` — never wired to any image.
2. **The "resolve the flagged attribute" warning won't clear**, even after
   checking every "matches" box and saving.

## Current architecture (relevant parts)

- `character.auditRows` is an array of
  `{ attribute, specValue, imageValue, ok }` (`src/schemas/character.schema.ts`).
  `defaultAuditRows()` (`src/lib/character-logic.ts`) seeds one row per
  entry in `AUDIT_ATTRIBUTE_LABELS` — a `[key: keyof Attributes, label:
  string]` list — with `specValue` copied from `character.attributes[key]`,
  `imageValue` empty, and `ok: true`.
- The GET route (`characters.views.ts`, `/:slug/casting/winner-audit`)
  renders `character.auditRows` if non-empty, else the defaults. It never
  looks up `character.castingCandidates` at all, so the template has no
  image to render — hence the permanent placeholder.
- The page currently has **two independent `<form>` elements**:
  - Rows are editable `specValue`/`imageValue` text inputs plus a "matches"
    checkbox, wrapped in a form that POSTs to
    `/:slug/casting/winner-audit` behind a "Save Audit" button. The POST
    handler parses `req.body.rows`, rebuilds `auditRows`, and persists it.
  - "Lock This Seed" is a **separate** form POSTing to `/:slug/casting/lock`,
    containing no row data at all.

  Checking boxes only reaches the server if "Save Audit" is clicked first;
  going straight to "Lock This Seed" submits nothing about the rows. The
  lock route and the warning banner both read the *persisted*
  `character.auditRows` (`character.auditRows.some(row => !row.ok)`), so if
  "Save Audit" was never clicked (or was clicked before the last edit), the
  warning keeps showing whatever was last actually saved — which reads as
  "stuck" from the UI even though checking the boxes "worked."
- `design/mockups/winneraudit.html` (the original mockup this page was
  scaffolded from) shows a different, simpler interaction than what got
  built: a **read-only** row per attribute (spec text next to a check/✕),
  with two actions appearing only on a flagged row — "Amend spec to match
  image" and "Reject candidate" — and no separate save step. Nothing in the
  codebase currently produces the "image shows…" free text the mockup rows
  reference (no vision/analysis pipeline exists), and with the real photo
  now visible next to the rows, that field is redundant — the user can just
  look at the photo.
- Casting Batch already renders candidate photos via
  `/characters/{slug}/images/file/{imagePath}` (`casting_batch.njk:58`) —
  the same convention this page should reuse for the winner's photo.
- The existing candidate delete route
  (`POST /:slug/casting/candidates/:seed/delete`, added by
  `2026-08-26-casting-candidate-delete-design.md`) explicitly refuses to
  delete the current winner (`seed !== character.winnerCandidateSeed`), so
  it cannot be reused as-is for a "reject the winner" action.
- `checklist.casting.candidates_scored` (`src/checklist/definitions.ts`) is
  a manually-set (not derived) flag, currently only set `true` inside the
  "Save Audit" POST handler.

## Design

### 1. Show the winning candidate's photo

The GET route looks up the winner:

```
const winner = character.castingCandidates.find(c => c.seed === character.winnerCandidateSeed);
```

and passes it to the template. The template swaps the placeholder `<div>`
for the same `<img src="/characters/{slug}/images/file/{imagePath}">`
pattern used in `casting_batch.njk`, falling back to the placeholder only
when there's no winner yet or the winner has no `imagePath`.

### 2. Rows become read-only with immediate, per-row actions

Drop the editable `imageValue` field, the "matches" checkbox, and the bulk
"Save Audit" button/form entirely. Each row now just displays the
attribute label and `specValue`, with the same green-check/red-✕ indicator
as today, driven by `row.ok`.

- **Every row** gets a small **"Flag mismatch" / "Mark as OK"** toggle
  (label depends on current `row.ok`) — a tiny form that POSTs and redirects
  straight back to this page. This is how a row moves from ok to flagged
  and back, replacing the checkbox.
- **A flagged row** (`ok: false`) additionally shows:
  - **"Amend spec to match image"** — an inline text input pre-filled with
    the row's current `specValue`, plus a submit button. Submitting updates
    *both* `auditRows[i].specValue` **and** the canonical
    `character.attributes[key]` (looked up via `AUDIT_ATTRIBUTE_LABELS`,
    matching on `row.attribute`), and sets `ok: true`. This is the "final
    adjustment to the attributes based on the winning image" the page is
    meant to support.
  - **"Reject candidate"** — see below.

Because every action persists immediately (no separate save step), the
warning under "Lock This Seed" always reflects the true, current state —
there is no longer any window where checked boxes and the warning
disagree.

### 3. Routes (`characters.views.ts`)

- `GET /:slug/casting/winner-audit` — add the winner lookup (§1); otherwise
  unchanged.
- Replace `POST /:slug/casting/winner-audit` (bulk save) with two per-row
  routes:
  - `POST /:slug/casting/audit-rows/:index/toggle` — flips
    `auditRows[index].ok`; sets `checklist['casting.candidates_scored'] =
    true`; redirects to the audit page.
  - `POST /:slug/casting/audit-rows/:index/amend` — sets
    `auditRows[index].specValue` to the posted value, sets
    `character.attributes[key]` to the same value (key resolved from
    `AUDIT_ATTRIBUTE_LABELS` by matching `row.attribute`), sets
    `auditRows[index].ok = true`; sets
    `checklist['casting.candidates_scored'] = true`; redirects to the audit
    page.
  - Both no-op (redirect without changes) if `:index` is out of range.
- New `POST /:slug/casting/candidates/:seed/reject`:
  - No-ops unless `seed === character.winnerCandidateSeed` (this action is
    specifically for rejecting the current winner from the audit page —
    rejecting a non-winner candidate is already covered by the existing
    delete route on Casting Batch).
  - Calls `characterImages.deleteCastingCandidate(slug, seed)`, removes the
    candidate from `castingCandidates`, clears `winnerCandidateSeed` to
    `null`, and clears `auditRows` to `[]` (a new winner starts its audit
    fresh via `defaultAuditRows`).
  - Redirects to `/:slug/casting/batch` so the user can pick a new winner.
- `POST /:slug/casting/lock` is unchanged — it already checks
  `character.auditRows.some(row => !row.ok)`, which now always matches the
  page's displayed state.

### 4. Template (`winner_audit.njk`)

- Single form removed in favor of one tiny form per row action (toggle,
  amend) plus the existing standalone "Lock This Seed" form — consistent
  with the per-tile action forms already used in `casting_batch.njk`
  ("Select as winner", "Delete").
- No client-side JS required; every action is a normal POST + redirect,
  matching this page's existing (and the rest of the app's) progressive
  server-rendered pattern.

## Error handling & edge cases

- **No winner selected yet**: photo area falls back to the placeholder;
  existing "Select a winning candidate from the Casting Batch first."
  message under "Lock This Seed" is unchanged.
- **Toggle/amend on an out-of-range row index**: route no-ops and redirects
  rather than erroring (handles a stale page open in another tab after rows
  were reset by a reject).
- **Amend with an empty value**: allowed — an empty spec value is not this
  route's concern to validate; the existing "every universal attribute must
  be filled" gate on `/casting/lock` (`characters.views.ts:625-632`) already
  blocks locking if that leaves an attribute blank.
- **Reject when the candidate's file is already missing on disk**:
  `deleteCastingCandidate` is already idempotent (per the prior delete
  design) — treated as success.
- **Reject hit on a non-winner seed**: no-op, redirect; use the existing
  Casting Batch delete action instead.

## Testing

- **Unit tests** (`test/character-logic.test.ts` or a new
  `characters.views.test.ts`, matching existing coverage style):
  - Toggle flips `ok` and leaves `specValue`/`imageValue` untouched.
  - Amend updates both `auditRows[i].specValue` and
    `character.attributes[key]`, and sets `ok: true`.
  - Reject on the winner seed clears `winnerCandidateSeed`, empties
    `auditRows`, removes the candidate, and redirects to Casting Batch.
  - Reject on a non-winner seed no-ops.
  - `POST /casting/lock` still refuses when any row is flagged, matching
    the current behavior.
- **Manual verification**: select a winner on Casting Batch → confirm the
  photo renders on Winner Audit → flag a row → confirm "Lock This Seed"
  shows the warning → use "Amend spec to match image" → confirm the warning
  clears immediately and the character's spec attribute changed → flag a
  row and "Reject candidate" instead → confirm it lands back on Casting
  Batch with the candidate gone and no winner selected.

## Explicitly out of scope

- Any automated "what does the image show" analysis (vision/description
  pipeline) — flagged rows are still a human judgment call, just made by
  looking at the now-visible photo instead of typing a description.
- Bulk row actions — matches the existing one-action-per-candidate
  granularity used throughout Casting Batch.
- Rejecting a non-winner candidate from this page — already covered by the
  existing Casting Batch delete action.
