# Manual Generation — Randomize Seed Button — Design

## Problem

Casting Batch's "Starting seed" input has a "Randomize" button
(`characters/casting_batch.njk:24-26`) backed by a fully generic
mechanism already wired into every page: `[data-randomize-seed="<id>"]`
(`public/app.js:340-360`) fetches `/api/v1/random-seed`
(`src/controllers/index.ts`) and writes the result into the input whose
`id` matches. The manual workspace Generation page's batch form has the
same kind of input — "start value" (`name="start"`) — with no such
button.

## Design

Give the batch form's start-value input an `id`, and add the same
trigger markup Casting Batch uses, in
`src/templates/manual/workspace/generation.njk`:

```njk
<input type="number" name="start" id="batch-start-value" placeholder="start value" required
  class="w-28 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[13px]" />
<span data-randomize-seed="batch-start-value">
  {{ ui.button('Randomize', 'secondary', 'button') }}
</span>
```

No JS, backend, or other template changes — `[data-randomize-seed]`'s
click handler (`public/app.js:340-360`) is already generic and already
loaded on every page via `layout.njk`.

### Explicitly out of scope

- The single-generation Actions form: it has no seed-like input (a single
  generation just uses whatever's currently in the mapped fields).

## Testing

Manual verification via the `run` skill: open the manual Generation page
for a session with a batch field designated, click "Randomize", confirm
the start-value input fills with a number and "Run Batch" still submits
using that value.
