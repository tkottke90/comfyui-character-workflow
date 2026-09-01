# Live Generation Tile Component — Design

## Problem

Casting Batch (`characters/casting_batch.njk`) already shows each candidate as a
placeholder tile that patches live to "Running 10/20" and then the final
image, via `public/sse-client.js`'s `patchBatchTiles` — but that capability is
hand-wired specifically to `character.castingCandidates`/`BatchJobRecord`.
The manual workspace Generation page's batch mode
(`2026-09-01-manual-workspace-field-mapping-execution-design.md`) copied the
same markup/attribute contract by hand for its own tile grid, and its
*single*-generation case has no tile at all — just a status line and
`<progress>` bar in the Actions card, and a full-page reload on completion
(the reload this spec removes is also what the `data-initial-status` fix
addressed for the infinite-loop bug — see "Current implementation").

This spec extracts the placeholder-tile-with-live-status-footer into one
shared component, generalizes the JS to patch either a single job or a
batch's sub-jobs, and uses it in both places — including, for the first
time, a manual session's single (non-batch) generation.

## Current implementation

- `public/sse-client.js:30-80`, `patchBatchTiles(root, job)` — patches
  `[data-casting-tile][data-seed="<value>"]` elements' `[data-tile-image]`/
  `[data-tile-placeholder]`/`[data-tile-status]`/`[data-tile-delete]`
  children from a `BatchJobRecord`'s `subJobs[]`. Only invoked when the
  root element has `data-sse-batch` (`sse-client.js:86`); a `kind: 'batch'`
  message without that attribute just sets a generic status string
  (`sse-client.js:121-124`) instead.
- Non-batch mode (`sse-client.js:140-161`) is text-status-only, and on a
  terminal `done`/`error` status calls `location.reload()` — guarded by
  `data-initial-status` (`sse-client.js:96`, set by
  `targeted_fix.njk:58`/`casting_preflight.njk:16`/`refinement.njk:85`, and,
  since the earlier infinite-loop fix, `manual/workspace/generation.njk:20`)
  so a page that already reflects a terminal status doesn't reload forever
  reconnecting to the same terminal message.
- `characters/casting_batch.njk:50-84` renders the `data-sse-events
  data-sse-batch data-images-base="..."` wrapper and, per candidate, a
  `data-casting-tile data-seed="{{ candidate.seed }}"` card — image/
  placeholder + status overlay (lines 56-63) plus casting-specific footer
  markup: the seed label, the winner pill, and "Select as winner"/"Delete"
  forms (lines 65-78).
- `manual/workspace/generation.njk:45-66` (added by the field-mapping-
  execution spec) duplicates that same `data-casting-tile`/`data-seed`/
  `data-tile-*` markup by hand for `pendingBatch.generations`, with no
  casting-specific footer beyond a mono-styled seed label (line 60). Only
  rendered when `pendingBatch` is non-null — i.e. only for batch runs; a
  single generation has no tile at all.
- `manual/workspace/generation.njk:18-43`'s Actions card holds the single-
  generation `Generate` form, the conditional batch form, and the
  `data-sse-status`/`data-sse-progress` elements — all inside the
  `data-sse-events` wrapper, which currently sits around the *Actions*
  card rather than around any tile grid.
- `src/views/manual.views.ts`'s `/:id/workspace/generation` handler
  computes `pendingBatch` (batch-only: null unless the latest generation
  has a `batchId` with an unsettled sibling) and `job` (the raw
  `manualJobStore` record, used only for `data-initial-status`).
- `ManualGenerationSchema`/`SingleJobRecord`/`BatchSubJob` already carry
  everything a tile needs — no schema change in this spec. In particular,
  `SingleJobRecord.generationId`/`BatchSubJob.generationId`
  (`job-store.service.ts`) were added by the execution-engine spec
  specifically for restart reconciliation, and this spec reuses the same
  fields as the single-generation tile's matching key.

## Design

### Shared component: `ui.jobTile()` macro

New macro in `macros.njk`, rendering only the universal part — image-or-
placeholder plus the live status overlay — not the whole card:

```njk
{% macro jobTile(key, imagePath, imagesBase, viewerGroup) %}
  <div class="aspect-[3/4] relative overflow-hidden" data-live-tile data-tile-key="{{ key }}">
    {% if imagePath %}
      <img src="{{ imagesBase }}/{{ imagePath }}" data-tile-image
        data-viewer-trigger data-viewer-group="{{ viewerGroup }}"
        class="absolute inset-0 w-full h-full object-cover" alt="" />
    {% else %}
      <div class="placeholder-photo absolute inset-0" data-tile-placeholder></div>
    {% endif %}
    <div class="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[11px] px-2 py-1" data-tile-status></div>
  </div>
{% endmacro %}
```

`data-tile-key` replaces the two-attribute `data-casting-tile`/`data-seed`
pair with one. Anything domain-specific — Casting Batch's seed label,
winner pill, select/delete forms; a manual batch's seed-equivalent label —
stays in the calling template, wrapping the macro's output, the same
boundary `dynamicFieldForm()`'s `imageValuePartial` hook already draws
between generic and domain-specific markup.

### `public/sse-client.js`: generalizing the patcher

`patchBatchTiles(root, job)` becomes `patchTiles(root, items)`, where
`items` is `Array<{key, status, progress, resultPath, error}>` derived
from whatever `JobRecord` the message carries:

```js
function jobToTiles(job) {
  if (job.kind === 'batch') {
    return job.subJobs.map(function (s) {
      return { key: s.seed, status: s.status, progress: s.progress, resultPath: s.resultPath, error: s.error };
    });
  }
  return [{ key: job.generationId, status: job.status, progress: job.progress, resultPath: job.resultPath, error: job.error }];
}
```

`patchTiles`'s body is `patchBatchTiles`'s existing per-item loop
unchanged, except it matches `root.querySelector('[data-live-tile][data-tile-key="' + item.key + '"]')`
instead of the old two-attribute selector.

The opt-in attribute `data-sse-batch` renames to **`data-sse-tiles`** — it
now means "patch live tiles for whatever job kind arrives," not
specifically batch:

```js
var wantsTiles = root.hasAttribute('data-sse-tiles');
...
if (job.kind === 'batch') {
  if (!wantsTiles) { setStatus('...in progress — refresh to see results.'); return; }
  var summary = patchTiles(root, jobToTiles(job));
  ...
  return;
}
if (wantsTiles) {
  var summary = patchTiles(root, jobToTiles(job)); // single job, one-item array
  if (summary.done + summary.failed >= summary.total) source.close();
  return;
}
// existing non-tile single-job branch (status text + progress bar + reload-on-done),
// entirely unchanged — still what targeted_fix.njk/casting_preflight.njk/refinement.njk get.
```

Pages that never set `data-sse-tiles` (the three character single-result
pages above) are byte-for-byte unaffected — same reload-on-done behavior,
same `data-initial-status` guard, same code path.

### Casting Batch: mechanical refactor

`casting_batch.njk:55-81`'s tile becomes:

```njk
<div class="rounded-lg border border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 overflow-hidden">
  {{ ui.jobTile(candidate.seed, candidate.imagePath, '/characters/' + character.slug + '/images/file', 'casting-batch') }}
  <div class="p-2.5">
    {{ ui.mono('seed ' + candidate.seed) }}
    {% if character.winnerCandidateSeed == candidate.seed %}
      <div class="mt-1">{{ ui.pill('winner', 'green') }}</div>
    {% else %}
      {# ...existing "Select as winner" / "Delete" forms, unchanged... #}
    {% endif %}
  </div>
</div>
```

and `data-sse-batch` at line 50 becomes `data-sse-tiles`. Same DOM shape,
same classes, same visual result — this is the one piece with real
regression risk (a working, real feature), verified manually before
anything else in this spec.

### Manual Generation: unifying single and batch, no more reload

**Backend** (`manual.views.ts`'s `/:id/workspace/generation` handler):
`pendingBatch` is replaced by a general `liveGenerations`:

```ts
const latestGeneration = sessionJson.generations.at(-1);
const latestBatchId = latestGeneration?.batchId;
const batchSiblings = latestBatchId
  ? sessionJson.generations.filter((g) => g.batchId === latestBatchId)
  : [];
const batchUnsettled = batchSiblings.some((g) => g.status === 'queued' || g.status === 'running');

let liveGenerations: Array<ManualGeneration & { seed?: unknown; image?: ManualImage }> = [];
if (batchUnsettled) {
  liveGenerations = batchSiblings.map((g) => ({
    ...g,
    seed: batchField ? g.fieldValuesSnapshot[batchField.key] : undefined,
    image: g.imageId ? imagesById[g.imageId] : undefined,
  }));
} else if (latestGeneration && !latestBatchId && (latestGeneration.status === 'queued' || latestGeneration.status === 'running')) {
  liveGenerations = [{ ...latestGeneration, image: undefined }];
}
```

(`batchField` computation is unchanged from today's `pendingBatch` logic.)
The `job` variable (only ever used for `data-initial-status`) is dropped —
see below.

**Template**: the Actions card shrinks to just the two forms — no
`data-sse-status`, no `<progress>`, no `data-sse-events` wrapper. A new
"Generating…" card, shown whenever `liveGenerations.length > 0`, carries
the SSE wiring and renders one tile per entry:

```njk
{% if liveGenerations.length > 0 %}
  {% call ui.card('Generating…') %}
    <div data-sse-events="/manual/{{ session.id }}/events" data-sse-tiles data-images-base="/manual/{{ session.id }}/assets">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {% for generation in liveGenerations %}
          <div class="rounded-lg border border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 overflow-hidden">
            {{ ui.jobTile(generation.seed if generation.seed != undefined else generation.id, generation.image.filename if generation.image else none, '/manual/' + session.id + '/assets', 'manual-generations') }}
            {% if generation.seed != undefined %}
              <div class="p-2 text-[11.5px]">{{ ui.mono(generation.seed) }}</div>
            {% endif %}
          </div>
        {% endfor %}
      </div>
    </div>
  {% endcall %}
{% endif %}
```

A lone single-generation tile's `key` is `generation.id` (matching the
JS's `job.generationId` derivation above) and renders no label underneath
(nothing meaningful to show for a single run); a batch tile keeps its
mono-styled seed-equivalent label exactly as today.

Because `data-sse-tiles` never calls `location.reload()`, a single
generation now patches its own tile with the final image in place, the
same as a batch tile — no reload, ever, for this page. `data-initial-
status` becomes dead weight here and is removed; it's untouched (and
still load-bearing) on the three character single-result pages.

Once every entry in `liveGenerations` is terminal, the *next* full page
load naturally omits it (the `else if` above requires `queued`/`running`)
and shows the settled result via the existing `doneGenerations` hero+grid
— no explicit hand-off logic needed, same as `pendingBatch` already
worked.

### Explicitly out of scope

- Any change to `targeted_fix.njk`/`casting_preflight.njk`/
  `refinement.njk` — they don't set `data-sse-tiles`, so nothing here
  touches their reload-based flow.
- A visual `<progress>` element inside a tile — the footer stays text-
  only ("Running 10/20"), matching Casting Batch's existing convention
  rather than upgrading it everywhere.
- Renaming `BatchSubJob.seed` in `job-store.service.ts` — it stays as an
  existing, already-accepted "honest reuse of the shape" for manual
  batches; only the DOM attribute and the JS function generalize.
- Canceling or deleting an in-flight generation from its live tile.
- Any schema or backend route change — `ManualGenerationSchema`,
  `SingleJobRecord`, and `BatchSubJob` already carry everything
  `patchTiles`/`jobToTiles` need.

## Testing

- Manual verification via the `run` skill, Casting Batch first (the
  regression-risk surface): queue a batch, confirm placeholder → "Running
  N/M" → final image behaves identically to before the refactor; confirm
  winner-select/delete still work.
- Manual generation, single: click Generate, confirm one placeholder tile
  appears immediately under "Generating…", patches to "Running N/M", then
  shows the final image in place with **no page reload**; confirm a
  subsequent manual page reload shows it correctly folded into the
  settled Outputs hero+grid.
- Manual generation, batch: confirm the existing multi-tile live behavior
  is unchanged under the renamed attribute/function.
- No existing automated test references `data-sse-batch`/
  `data-casting-tile`/`patchBatchTiles` (confirmed via repo search), so no
  test updates are required by the rename itself; add/update view-layer
  test coverage only if `manual.views.ts`'s `liveGenerations` computation
  doesn't already have an equivalent case for `pendingBatch`.
