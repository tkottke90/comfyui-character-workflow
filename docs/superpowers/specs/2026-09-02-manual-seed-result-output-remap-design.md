# Manual Workspace — Seed & Result Output as Pinned Mappings — Design

## Problem

Today, three things gate a manual session before it can generate anything,
each with its own separate setup step: a **Result Output** card (pick a
node/output), a **Batch Field** card (designate an existing number `Field`
as the thing a batch run increments), and, implicitly, whatever field the
user happened to designate as "the seed." This is more ceremony than the
rest of the feature's philosophy calls for — everywhere else, mapping is
opt-in and unmapped things are just static passthrough — and "designate
an existing field as the batch driver" is an extra layer of indirection
that doesn't need to exist: a batch has always really been about
incrementing *a seed*, not about picking which user-created field happens
to serve that role.

This spec collapses that indirection: Seed becomes its own first-class,
always-present concept — mapped (or not) the exact same way a `Field` is,
via the same "Map…" picker — and Result Output moves into the same Field
Mapping card as a second pinned row, using a similar (but not identical —
it selects a *node*, not an *input*) picker. The Batch Field card is
deleted outright; a batch run always drives Seed, unconditionally.

## Current implementation

- `session.resultOutput: {nodeId, outputIndex} | null`
  (`manual-workflow.service.ts:60`) and `session.batchFieldId: string | null`
  (`manual-workflow.service.ts:61`) are both plain session-level fields,
  configured via their own cards in `configuration.njk` — Result Output
  (lines 57-83: a `<select>`/datalist of `outputNodeCandidates`/
  `uniqueNodeIds`, computed server-side in `manual.views.ts:62-69` and
  posted to the existing `POST /:id/result-output`) and Batch Field
  (lines 85-100: a `<select>` of the session's `number`-type fields,
  posted to `POST /:id/batch-field`, `manual.ts:345-362`).
- `ManualFieldSchema.mappings` / `ManualFieldMappingSchema`
  (`manual-workflow.service.ts:28-38`) is the `{nodeId, inputName,
  classType}[]` shape already used for regular field mappings, edited via
  `PATCH /:id/fields/:fieldId` (`manual.ts:182-237`) — including its
  cross-field conflict check (lines 207-214: no two fields may claim the
  same `(nodeId, inputName)`).
- `resolveManualGraph(session, comfyClient, overrides)`
  (`src/lib/manual-execution-resolver.ts:27-76`) iterates `session.fields`
  only; `overrides` (keyed by field id) exists solely so
  `submitBatch` can substitute the designated batch field's per-iteration
  value (`manual-execution.service.ts:418`, `{[batchFieldId]: value}`).
- `submitGeneration`/`submitBatch` (`manual-execution.service.ts:350-442`)
  both require `session.resultOutput`; `submitBatch` additionally requires
  `session.batchFieldId` (lines 392-394) and reads the field's own current
  value into `fieldValuesSnapshot` via `snapshotFields(session, {[batchFieldId]: start+i})`
  (line 405) — there's no dedicated `seed` on `ManualGenerationSchema`
  today; a batch generation's "seed" is recovered by looking up
  `fieldValuesSnapshot[batchField.key]` in `manual.views.ts:97-99,113`.
- `candidateOutputNodes(nodes)` (`src/lib/workflow-mapping-logic.ts`,
  generalized by the live-tile-component spec) already takes a plain
  `Array<{nodeId, nodeTitle, classType}>` — exactly what
  `parseWorkflowGraph`'s output already is — so it's already usable
  outside the character-integration pipeline.
- `public/field-mapping.js` drives the existing "Map…" picker
  (fetch `GET /:id/workflow-inputs` once, filter/checkbox UI, `PATCH
  /:id/fields/:fieldId` with `{mappings}`) — see the field-mapping-
  execution design spec for its exact structure.
- `generation.njk`'s batch form (lines 28-36 as currently on disk) is
  gated by `{% if session.batchFieldId %}` and already has a "Starting
  Seed" input (`id="batch-start-value"`, renamed from a prior "start
  value" placeholder) + Randomize button; the single-Generate form
  (lines 19-27) has no seed input of any kind today.
- `manual.views.ts:97-99,109-122`'s `liveGenerations` computation looks up
  `batchField` (`sessionJson.fields.find(f => f.id === sessionJson.batchFieldId)`)
  purely to resolve each live batch tile's `seed` label out of
  `fieldValuesSnapshot`.

## Design

### Data model (`src/services/manual-workflow.service.ts`)

```ts
const ManualWorkflowSessionSchema = z.object({
  // ...
  resultOutput: z.object({ nodeId: z.string(), outputIndex: z.number() }).nullable().default(null),
  seedMappings: z.array(ManualFieldMappingSchema).default([]),   // replaces batchFieldId
  // ...
});
```

`batchFieldId` is deleted from the schema entirely (an old session's
persisted `batchFieldId` key is silently dropped on next parse/write —
`ManualWorkflowSessionSchema` isn't `.strict()`, so this needs no
migration). `seedMappings` is added to `UploadSessionSchema`'s `.pick()`
list (`batchFieldId` removed from it) so `updateSession` can persist it.

`ManualGenerationSchema` gains a required `seed: z.number()` —
recorded on every generation, single or batch, alongside the unchanged
`fieldValuesSnapshot` (which stays fields-only; keeping `seed` as its own
top-level property sidesteps the edge case where a user names a regular
field literally `"seed"`, which would otherwise collide with a
snapshot-object key of the same name).

### Backend: seed mapping + output-node discovery (`src/controllers/v1/manual.ts`)

The field-mapping conflict check (`manual.ts:207-214`) is extracted into
one small shared helper so both the fields route and the new seed route
use it:

```ts
function findMappingConflict(
  session: ManualWorkflowSession,
  ownerKey: string,           // a field id, or the literal 'seed'
  candidateMappings: ManualFieldMapping[],
): { key: string } | undefined {
  const claimed = new Set(candidateMappings.map((m) => `${m.nodeId}:${m.inputName}`));

  if (ownerKey !== 'seed' && session.seedMappings.some((m) => claimed.has(`${m.nodeId}:${m.inputName}`))) {
    return { key: 'seed' };
  }
  for (const field of session.fields) {
    if (field.id === ownerKey) continue;
    if (field.mappings.some((m) => claimed.has(`${m.nodeId}:${m.inputName}`))) {
      return { key: field.key };
    }
  }
  return undefined;
}
```

`PATCH /:id/fields/:fieldId`'s existing mapping-save branch
(`manual.ts:198-217`) calls `findMappingConflict(session, existing.id, nextMappings)`
in place of its current inline check.

New route, same validation/response shape as the fields PATCH's mapping
branch:

```ts
manualRouter.patch('/:id/seed-mapping', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());

  let nextMappings;
  try {
    nextMappings = z.array(ManualFieldMappingSchema).parse(req.body.mappings ?? []);
  } catch (err) {
    throw new BadRequestError(err instanceof Error ? err.message : 'Invalid mappings');
  }

  const conflict = findMappingConflict(session, 'seed', nextMappings);
  if (conflict) throw new BadRequestError(`Input already mapped to "${conflict.key}"`);

  await app.manualWorkflows.updateSession(session.id, { seedMappings: nextMappings });
  res.status(200).json({ mappings: nextMappings });
});
```

`POST /:id/batch-field` (`manual.ts:345-362`) is deleted. `DELETE
/:id/fields/:fieldId`'s `clearBatchField` branch (`manual.ts:273-277`) is
deleted too — Seed no longer references a field id, so a field's deletion
can't orphan it.

New route backing the Result Output picker (moves the computation
currently inline in `manual.views.ts:62-69` into an endpoint the picker
fetches on demand, the same lazy-fetch-once-cached pattern the field
picker already uses for `workflow-inputs`):

```ts
manualRouter.get('/:id/output-nodes', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  if (!session.workflowFile) {
    res.json({ candidates: [], allNodeIds: [] });
    return;
  }
  const rawGraph = await readJsonFile(path.join(session.workflowDir, session.workflowFile));
  const parsedInputs = parseWorkflowGraph(rawGraph);
  res.json({
    candidates: candidateOutputNodes(parsedInputs),
    allNodeIds: Array.from(new Set(parsedInputs.map((i) => i.nodeId))),
  });
});
```

`POST /:id/result-output` (`manual.ts:327-340`) is unchanged.

### Backend: execution (`manual-execution-resolver.ts`, `manual-execution.service.ts`)

`resolveManualGraph`'s signature simplifies — the old `overrides` param
(only ever used for the batch-designated-field increment) is replaced by
a required `seed: number`:

```ts
export async function resolveManualGraph(
  session: ManualWorkflowSession,
  comfyClient: ComfyUIClient,
  seed: number,
): Promise<RawComfyGraph> {
  // ... existing per-field loop (lines 41-73), unchanged, now always
  // reading field.value directly with no override lookup ...

  for (const mapping of session.seedMappings) {
    const node = graph[mapping.nodeId];
    if (!node) continue;
    node.inputs = node.inputs ?? {};
    node.inputs[mapping.inputName] = seed;
  }

  return graph;
}
```

`snapshotFields(session)` (`manual-execution.service.ts:37-46`) drops its
`overrides` parameter — every call site now just reads `field.value`
directly, since there's no more field-shaped seed override to thread
through.

`submitGeneration(sessionId, seed: number)` (`manual-execution.service.ts:350-382`):
signature gains `seed`; requires `session.workflowFile` and
`session.resultOutput` as today (no `seedMappings` requirement — an
unmapped Seed is exactly as valid as an unmapped Field, per the existing
static-passthrough philosophy); the created `ManualGenerationSchema` gets
`seed` set directly; `resolveManualGraph(session, comfyClient, seed)`
replaces the no-arg call at line 364.

`submitBatch(sessionId, start: number, count: number)`
(`manual-execution.service.ts:384-442`): drops the `session.batchFieldId`
requirement (lines 392-394) entirely — only workflow + Result Output are
required, matching `submitGeneration`. Each generation's `fieldValuesSnapshot`
reverts to plain `snapshotFields(session)` (no more per-field override);
each generation's `seed` is set to `start + i` directly. The per-iteration
`resolveManualGraph(session, comfyClient, { [batchFieldId]: value })` call
(line 418) becomes `resolveManualGraph(session, comfyClient, value)`.

`checkAlreadyCompletedSingle`/`checkAlreadyCompletedBatchSubJob`,
`completeSingle`/`completeBatchSubJob`, `reconcile*` — all unchanged; none
of them touch field/seed resolution, only job-record and generation
status bookkeeping.

### Backend routes: generate / generate-batch (`src/controllers/v1/manual.ts`)

```ts
manualRouter.post('/:id/generate', async (req: Request, res: Response) => {
  const seed = Number(req.body.seed);
  if (!Number.isFinite(seed)) throw new BadRequestError('A seed is required');

  const { generationId } = await app.manualExecutionService.submitGeneration(
    req.params.id.toString(),
    seed,
  );
  // ...unchanged redirect/json branch...
});
```

`POST /:id/generate-batch` (`manual.ts:383-399`) is otherwise unchanged
(still `start`/`count`, clamped 1–16) — it no longer has a batch-field
concept to validate.

### Frontend: Configuration page (`configuration.njk`)

The **Batch Field card** (lines 85-100) is deleted outright. The
**Result Output card** (lines 57-83) is deleted as a standalone card —
its content moves into **Field Mapping** as a pinned row. Field Mapping
(lines 33-55) becomes:

```njk
{% call ui.card('Field Mapping') %}
  <div data-field-mapping-list
       data-workflow-inputs-endpoint="/api/v1/manual/{{ session.id }}/workflow-inputs"
       data-output-nodes-endpoint="/api/v1/manual/{{ session.id }}/output-nodes"
       data-fields-endpoint="/api/v1/manual/{{ session.id }}/fields">

    {# Pinned: Seed — same picker as a regular field, fixed label, no key/type/value #}
    <div class="flex items-center justify-between py-2 border-b border-steel-100 dark:border-steel-800"
         data-mapping-row data-mapping-kind="seed"
         data-mapping-endpoint="/api/v1/manual/{{ session.id }}/seed-mapping"
         data-field-mappings="{{ session.seedMappings | dump }}">
      <span class="text-[13px] font-semibold">Seed</span>
      <div class="flex items-center gap-2">
        <span class="text-[11.5px] text-steel-500" data-mapping-summary>
          {{ session.seedMappings.length }} input{{ 's' if session.seedMappings.length != 1 }} mapped
        </span>
        <button type="button" class="text-[12.5px] font-semibold text-apple-700 dark:text-apple-300" data-mapping-edit>Map…</button>
      </div>
    </div>

    {# Pinned: Result Output — a different picker (single node + explicit index) #}
    <div class="flex items-center justify-between py-2 border-b border-steel-100 dark:border-steel-800"
         data-output-row>
      <span class="text-[13px] font-semibold">Result Output</span>
      <div class="flex items-center gap-2">
        <span class="text-[11.5px] text-steel-500" data-output-summary>
          {{ ui.mono(session.resultOutput.nodeId + ' → ' + session.resultOutput.outputIndex) if session.resultOutput else 'Not set' }}
        </span>
        <button type="button" class="text-[12.5px] font-semibold text-apple-700 dark:text-apple-300" data-output-edit>Map…</button>
      </div>
    </div>

    {# Regular fields, unchanged from today #}
    {% if session.fields.length == 0 %}
      <p class="text-[13px] text-steel-500 mt-2">No fields yet — add fields on the Generation tab first.</p>
    {% else %}
      {% for field in session.fields %}
        <div class="flex items-center justify-between py-2 border-b border-steel-100 dark:border-steel-800 last:border-b-0"
             data-mapping-row data-field-id="{{ field.id }}" data-field-mappings="{{ field.mappings | dump }}">
          {# ...unchanged... #}
        </div>
      {% endfor %}
    {% endif %}
  </div>
{% endcall %}
```

### Frontend: `public/field-mapping.js`

The existing per-field "Map…" click handler generalizes: today it always
computes its PATCH target as `fieldsEndpoint + '/' + fieldId`; it now
reads a per-row `data-mapping-endpoint` override when present (the Seed
row sets one; a regular field row doesn't, so it falls back to today's
computed path) — everything else about the picker (fetch-once-cached
`workflow-inputs`, filter, checkboxes, save) is identical and untouched.

A second, new handler drives the Result Output row (`[data-output-edit]`):
fetches `data-output-nodes-endpoint` once (cached the same way), opens an
inline panel with a `<select>` of `candidates` (falling back to a
`allNodeIds` datalist input, mirroring the old card's exact fallback
logic) plus an output-index number input, and on Save calls the existing
`POST /:id/result-output`, then updates `[data-output-summary]` and
collapses the panel. This is a distinct function from the field/seed
picker (single-select + index, not a multi-select checklist) but reuses
the same open/filter-if-applicable/save/collapse shape.

### Frontend: Generation page (`generation.njk`)

- Single Generate form gains a Seed input + Randomize button, mirroring
  the batch form's existing one:
  ```njk
  <form method="post" action="/api/v1/manual/{{ session.id }}/generate?view=yes" class="flex items-center gap-2">
    <input type="number" name="seed" id="single-seed-value" placeholder="Seed" required
      class="w-28 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[13px]" />
    <span data-randomize-seed="single-seed-value">{{ ui.button('Randomize', 'secondary', 'button') }}</span>
    {# ...existing disabled-state span/button unchanged... #}
  </form>
  ```
- The batch form's `{% if session.batchFieldId %}` gate (line 28) is
  removed — it's now shown unconditionally alongside single Generate
  (same enablement condition: workflow + Result Output set).

### Frontend: `manual.views.ts`'s `liveGenerations`

The `batchField` lookup (lines 97-99) is deleted; each live tile's `seed`
comes directly from `generation.seed` (now a real top-level property, no
`fieldValuesSnapshot` lookup needed):

```ts
liveGenerations = batchSiblings.map((g) => ({
  ...g,
  image: g.imageId ? imagesById[g.imageId] : undefined,
}));
// ...
liveGenerations = [{ ...latestGeneration, image: undefined }];
```

(`generation.seed` is already on the spread object since it's a top-level
`ManualGenerationSchema` property now — `generation.njk`'s tile label
condition changes from `generation.seed != undefined` to `true` for batch
tiles specifically, or stays as a general guard; either reads correctly
since `seed` is now always present.)

`manual.views.ts`'s Configuration GET handler drops its
`outputNodeCandidates`/`uniqueNodeIds` computation (lines 62-69) and the
now-unneeded `parseWorkflowGraph`/`candidateOutputNodes`/`readJsonFile`
imports that existed solely for it — that computation moved into
`GET /:id/output-nodes`.

### Explicitly out of scope

- Any change to Casting Batch or the character pipeline.
- Migrating old persisted `session.batchFieldId` values — dropped
  silently on next parse (schema isn't `.strict()`); no session in real
  use depends on it surviving.
- Any richer seed semantics (alternate increment strategies, negative/
  wraparound handling) beyond today's `start + i`.
- Any UI difference between the single-Generate Seed input and the
  batch form's "Starting Seed" input beyond their names/ids — both are
  plain number inputs with the same Randomize mechanism.

## Testing

- Schema tests: `seedMappings` accepted on the session schema;
  `batchFieldId` no longer part of it; `ManualGenerationSchema` requires
  `seed`.
- Controller tests: `PATCH /seed-mapping` conflict-checks against fields'
  mappings and vice versa (a field claiming an input already in
  `seedMappings` is rejected, and saving `seedMappings` over an input a
  field already claims is rejected); `GET /output-nodes` shape; `POST
  /generate` requires and records `seed`, rejects a missing/non-numeric
  one; `POST /generate-batch` no longer requires anything batch-field
  related; `POST /batch-field` route no longer exists (404).
- Resolver tests: `resolveManualGraph` splices `seed` into every
  `seedMappings` target independent of regular field resolution; a
  session with empty `seedMappings` ignores the seed value entirely
  (static passthrough, matching an unmapped field's behavior).
- Manual verification: map Seed to an input via the new pinned row, map
  Result Output via its new node/index picker, confirm a single Generate
  with a manually-entered or randomized seed produces the expected value
  in the graph; confirm Batch is available immediately with no separate
  designation step and produces distinct results per the incrementing
  seed; confirm deleting a field that happens to be named `"seed"` (or
  anything else) never affects `seedMappings`, since they're no longer
  linked by field id at all.
