# Manual Workspace — Field Mapping & Generation Execution — Design

## Problem

Two prior specs deliberately left a gap between them. The
[Configuration workflow form design](2026-08-30-manual-workspace-configuration-workflow-form-design.md)
lets a session attach a raw `workflow.json`, with mapping explicitly out of
scope. The [Generation page design](2026-08-30-manual-workspace-generation-page-design.md)
lets a session define arbitrary opt-in fields, but `Generate` stays
rendered-and-disabled because "the fields defined here are the domain
fields a future Configuration-page mapping screen ... will bind to actual
workflow node inputs" — a screen that didn't exist yet.

This spec builds that screen and wires it all the way through to a real
generation: the Configuration page gets a way to map Generation fields to
specific workflow node inputs, and an execution engine resolves those
mappings into the attached graph, submits it to ComfyUI, and reports
results back into the Generation page's Outputs grid.

Critically, this is **not** the character-integration workflow-mapping
convention inverted-and-reused. That screen (`integration/workflow-mapping-detail.njk`)
renders every parsed node input as a permanent, always-visible editable
row — reasonable when a workflow is imported once and mapped exhaustively
by a maintainer, but wrong for a manual session where "run it as-is" means
most inputs should never be looked at, let alone rendered. Here, mapping
is field-first: the small number of fields a user actually created are
what's listed; the (potentially dozens-deep) list of workflow node inputs
only appears inside a picker, opened per field, on demand.

## Current implementation

- `ManualFieldSchema` (`src/services/manual-workflow.service.ts:28-35`) —
  `{id, key, type, value, createdAt, updatedAt}`, no mapping concept yet.
  `type` is `z.enum(['text', 'number', 'boolean', 'image', 'multiline'])`;
  `value` is `z.union([z.string(), z.number(), z.boolean(), z.null()])` —
  already a real typed union, not a stringly-typed value like the
  character pipeline's `NodeMapping.sourceValue`.
- `ManualGenerationSchema` (`src/services/manual-workflow.service.ts:37-45`)
  — `{id, status, fieldValuesSnapshot, imageId?, error?, createdAt,
  completedAt?}` — exists and is rendered against by the Outputs card, but
  nothing ever writes to it (`generations` is dropped from
  `UploadSessionSchema`'s `.pick()` list at
  `manual-workflow.service.ts:64-72`).
- `ManualWorkflowSessionSchema` (`manual-workflow.service.ts:47-62`) has
  `workflowFile`/`workflowSource` for the attached graph, and `fields`/
  `generations` arrays — no `resultOutput` or batch-field concept.
- `POST /:id/fields`, `PATCH /:id/fields/:fieldId`, `POST
  /:id/fields/:fieldId/move`, `DELETE /:id/fields/:fieldId`
  (`src/controllers/v1/manual.ts:137-229`) are the full field CRUD surface
  today — `PATCH` already accepts a partial `{key?, type?, value?}` body
  and re-validates through `ManualFieldSchema.parse`.
- `ui.dynamicFieldForm()` / `_dynamicFieldRow` (`src/templates/macros.njk:147-184`)
  and `public/dynamic-fields.js` render/manage fields client-side, generic
  over any `data-fields-endpoint` — this spec doesn't touch either, it
  only adds a read-only "mapped" indicator to the row.
- **Character-integration precedent this spec partially reuses:**
  - `parseWorkflowGraph(json)` (`src/lib/comfyui-workflow.ts:33-57`) walks
    a ComfyUI API-format export and returns every widget-style input
    (`{nodeId, nodeTitle, inputName, classType, rawValue}[]`), skipping
    graph-edge references. This is the one function both pipelines share
    to discover "what's mappable" — nothing here needs to change.
  - `candidateOutputNodes(version)` (`src/lib/workflow-mapping-logic.ts:129-141`)
    dedupes by `nodeId` and keyword-matches `classType`/`nodeTitle` against
    `OUTPUT_NODE_KEYWORDS` to suggest which nodes are plausibly
    SaveImage/PreviewImage-style outputs. It currently only reads
    `.nodeId`/`.nodeTitle`/`.classType` off `WorkflowVersion.nodes`
    (`NodeMapping[]`), so it generalizes to `parseWorkflowGraph`'s
    `ParsedNodeInput[]` with no behavior change (see below).
  - `integration/workflow-mapping-detail.njk:197-213` is the exact UI this
    spec's Result Output control copies: a `<select>` of candidate nodes,
    falling back to a free-text `<input list=...>` datalist of every node
    id when nothing matches the keyword heuristic.
  - `ExecutionService` (`src/services/execution.service.ts`) and
    `mapping-resolver.ts` are the character pipeline's submit → track →
    complete pipeline. Manual sessions get their own much smaller version
    (below) rather than reusing this directly — it's built around
    characters/phases/casting-batches/prompt-adapters that don't apply
    here — but it reuses the same **instances** of `comfyClient`,
    `comfySocket`, and `jobStore` created once in `src/views/index.ts:47-58`,
    plus the same `resultOutput`-driven "fetch the history entry, pull the
    image out of `outputs[nodeId].images[outputIndex]`" logic
    (`execution.service.ts:271-287`).
  - `job-store.service.ts`'s `JobStore` (LMDB-backed, `get`/`set`/
    `onChange`/`listAll`, keyed by two arbitrary strings it calls
    `characterSlug`/`phaseBindingKey`) is generic in behavior despite its
    parameter names — nothing in its implementation actually requires the
    first key to be a character. This spec reuses the **same instance**
    for manual sessions rather than standing up a second LMDB store.
  - `GET /:slug/events/:phaseBindingKey` (`src/views/characters.views.ts:374-395`)
    is the SSE endpoint this spec's manual equivalent copies almost
    verbatim. `public/sse-client.js` (its `[data-sse-events]`/
    `[data-sse-batch]` block) is entirely generic already and needs no
    changes.
  - `characters/casting_batch.njk:47-76` is the tile-grid + per-tile SSE
    pattern (`data-sse-batch`, one tile per candidate keyed by a
    distinguishing numeric value) this spec's batch Outputs UI mirrors.
  - `ComfyUIClient` (`src/services/comfyui-client.service.ts`) exposes
    `uploadImage`, `submitPrompt`, `getHistoryEntry`, `viewImage` — reused
    as-is.
  - `comfySocket.onMessage(handler)` (`src/services/comfyui-socket.service.ts:180`)
    is a plain `EventEmitter.on('message', ...)` — registering a second,
    independent handler for manual jobs alongside the character pipeline's
    existing one is safe; each filters by its own ownership map.

## Design

### Data model

`ManualFieldSchema` gains one field:

```ts
export const ManualFieldMappingSchema = z.object({
  nodeId: z.string(),
  inputName: z.string(),
  classType: z.string(),
});

export const ManualFieldSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  key: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Key must be alphanumeric/underscore only'),
  type: z.enum(['text', 'number', 'boolean', 'image', 'multiline']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  mappings: z.array(ManualFieldMappingSchema).default([]),
  createdAt: DefaultDateSchema,
  updatedAt: DefaultDateSchema,
});
```

An empty `mappings` array is today's behavior exactly — the field is
purely cosmetic/for-later, and every workflow input keeps its original
literal value. A field can be in zero, one, or many mappings (one field
→ many inputs). The server enforces that no two fields ever claim the
same `(nodeId, inputName)` pair — checked on save, across all of
`session.fields`, not just within one field's own list.

`ManualWorkflowSessionSchema` gains two nullable fields, alongside
`workflowFile`:

```ts
resultOutput: z.object({ nodeId: z.string(), outputIndex: z.number() }).nullable().default(null),
batchFieldId: z.string().nullable().default(null),
```

Both are added to `UploadSessionSchema`'s `.pick()` list so they persist
through the existing `updateSession` path. `batchFieldId`, when set, must
reference a field of `type: 'number'` in `session.fields` — enforced when
it's set, not re-validated on every read (if the referenced field is later
deleted, `batchFieldId` is cleared as part of that field's delete
handler).

`ManualGenerationSchema` gains one optional field:

```ts
batchId: z.string().optional(),
```

Absent for a single generation; shared across every sub-generation
produced by one batch run, so the Outputs grid can visually cluster them.

### Backend: field mapping (extends existing field routes)

`PATCH /api/v1/manual/:id/fields/:fieldId` (`src/controllers/v1/manual.ts:161-192`)
already accepts a partial `{key?, type?, value?}` body. It gains one more
optional key, `mappings?: {nodeId, inputName, classType}[]`, validated and
persisted the same way as everything else on that route:

```ts
if (req.body.mappings !== undefined) {
  const nextMappings = z.array(ManualFieldMappingSchema).parse(req.body.mappings);
  const claimed = new Set(nextMappings.map((m) => `${m.nodeId}:${m.inputName}`));
  const conflict = session.fields.find((f) => {
    if (f.id === existing.id) return false;
    return f.mappings.some((m) => claimed.has(`${m.nodeId}:${m.inputName}`));
  });
  if (conflict) {
    throw new BadRequestError(
      `Input already mapped to field "${conflict.key}"`,
    );
  }
  updated.mappings = nextMappings;
}
```

No new route — the picker (below) always submits a full replacement
`mappings` array for the one field it's editing.

`DELETE /:id/fields/:fieldId` (`manual.ts:219-229`) gains one extra line:
if the deleted field's `id` matches `session.batchFieldId`, the update
also clears it to `null` in the same `updateSession` call — otherwise a
deleted field would leave a dangling reference the Batch Field select
can't resolve.

New route to discover what's mappable, backing the picker:

```ts
manualRouter.get('/:id/workflow-inputs', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  if (!session.workflowFile) {
    res.json({ inputs: [] });
    return;
  }
  const rawGraph = await readJsonFile(path.join(session.workflowDir, session.workflowFile));
  res.json({ inputs: parseWorkflowGraph(rawGraph) });
});
```

Fetched once by the Configuration page's client JS on load and cached in
memory for the page's lifetime (the raw workflow doesn't change without a
full re-upload, which already reloads the page via `set-workflow`'s
redirect) — no need to re-fetch per picker-open.

### Backend: result output & batch field

Two small new routes, same shape as `set-workflow`:

```ts
manualRouter.post('/:id/result-output', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const nodeId = String(req.body.nodeId ?? '').trim();
  if (!nodeId) throw new BadRequestError('A result node is required');
  const outputIndex = Number(req.body.outputIndex ?? 0);

  await app.manualWorkflows.updateSession(session.id, {
    resultOutput: { nodeId, outputIndex },
  });
  res.status(200).json({ nodeId, outputIndex });
});

manualRouter.post('/:id/batch-field', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const fieldId = String(req.body.fieldId ?? '') || null;

  if (fieldId) {
    const field = session.fields.find((f) => f.id === fieldId);
    if (!field) throw new BadRequestError('Field not found');
    if (field.type !== 'number') throw new BadRequestError('Batch field must be a number field');
  }

  await app.manualWorkflows.updateSession(session.id, { batchFieldId: fieldId });
  res.status(200).json({ batchFieldId: fieldId });
});
```

### Frontend: Configuration page — Field Mapping card

```njk
{% call ui.card('Field Mapping') %}
  {% if session.fields.length == 0 %}
    <p class="text-[13px] text-steel-500">No fields yet — add fields on the Generation tab first.</p>
  {% else %}
    <div data-field-mapping-list data-workflow-inputs-endpoint="/api/v1/manual/{{ session.id }}/workflow-inputs">
      {% for field in session.fields %}
        <div class="flex items-center justify-between py-2 border-b border-steel-100 dark:border-steel-800" data-mapping-row data-field-id="{{ field.id }}" data-field-mappings="{{ field.mappings | dump }}">
          <div>
            <span class="text-[13px] font-semibold">{{ field.key }}</span>
            <span class="text-[11px] text-steel-400 ml-1">{{ field.type }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11.5px] text-steel-500" data-mapping-summary>
              {{ field.mappings.length }} input{{ 's' if field.mappings.length != 1 }} mapped
            </span>
            <button type="button" class="text-[12.5px] font-semibold text-apple-700 dark:text-apple-300" data-mapping-edit>Map…</button>
          </div>
        </div>
      {% endfor %}
    </div>
  {% endif %}
{% endcall %}
```

`public/field-mapping.js` (new, manual-specific — this isn't a second
consumer of the generic `dynamic-fields.js` module, it's a distinct
concern layered on top of the same field records): fetches
`workflow-inputs-endpoint` once, and on `data-mapping-edit` click opens an
inline panel under that row — a text `<input>` that filters the cached
input list by `nodeTitle`/`inputName`/`classType` substring match, each
match rendered as a checkbox row pre-checked if it's already in that
field's `mappings`, plus a "Save" button that `PATCH`es
`/api/v1/manual/:id/fields/:fieldId` with the full selected set and
re-renders the row's summary/collapses the panel. This is the "pick a
field, then search for what to bind it to" flow — the full input list
exists only inside this on-demand panel, never as page-load markup.

### Frontend: Configuration page — Result Output & Batch Field

```njk
{% call ui.card('Result Output') %}
  {% if session.resultOutput %}
    <p class="text-[13px] text-steel-500 mb-2">{{ ui.mono(session.resultOutput.nodeId + ' → output ' + session.resultOutput.outputIndex) }}</p>
  {% endif %}
  <form method="post" action="/api/v1/manual/{{ session.id }}/result-output?view=yes" class="flex items-center gap-2">
    {% if outputNodeCandidates.length %}
      <select name="nodeId" class="rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2 py-1 text-[12px] font-mono">
        <option value="">— choose —</option>
        {% for candidate in outputNodeCandidates %}
          <option value="{{ candidate.nodeId }}" {{ 'selected' if session.resultOutput and session.resultOutput.nodeId == candidate.nodeId }}>
            {{ candidate.nodeTitle }} ·{{ candidate.nodeId }}
          </option>
        {% endfor %}
      </select>
    {% else %}
      <input list="node-ids" name="nodeId" placeholder="node id" value="{{ session.resultOutput.nodeId if session.resultOutput else '' }}" class="rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2 py-1 text-[12px] font-mono" />
      <datalist id="node-ids">
        {% for nodeId in uniqueNodeIds %}<option value="{{ nodeId }}"></option>{% endfor %}
      </datalist>
    {% endif %}
    <input type="number" name="outputIndex" value="{{ session.resultOutput.outputIndex if session.resultOutput else 0 }}" class="w-16 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2 py-1 text-[12px] font-mono" />
    {{ ui.button('Save', 'secondary') }}
  </form>
{% endcall %}

{% call ui.card('Batch Field') %}
  <form method="post" action="/api/v1/manual/{{ session.id }}/batch-field?view=yes">
    <select name="fieldId" class="rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[13px]">
      <option value="">— none —</option>
      {% for field in session.fields %}
        {% if field.type == 'number' %}
          <option value="{{ field.id }}" {{ 'selected' if session.batchFieldId == field.id }}>{{ field.key }}</option>
        {% endif %}
      {% endfor %}
    </select>
    {{ ui.button('Save', 'secondary') }}
  </form>
{% endcall %}
```

The GET handler for `.../workspace/configuration` computes
`outputNodeCandidates`/`uniqueNodeIds` the same way
`integration.views.ts:272-273` does, against `parseWorkflowGraph(rawGraph)`
instead of a `WorkflowVersion`'s `nodes` — which is exactly why
`candidateOutputNodes` generalizes to:

```ts
export function candidateOutputNodes(
  nodes: Array<{ nodeId: string; nodeTitle: string; classType: string }>,
): OutputNodeCandidate[] { /* body unchanged */ }
```

`integration.views.ts:273`'s call site (`candidateOutputNodes(version)`)
still type-checks unchanged, since `WorkflowVersion.nodes` (`NodeMapping[]`)
is a structural superset of the new parameter type.

### Execution: resolving fields into the graph

`resolveManualGraph(session)` (new, `src/lib/manual-execution-resolver.ts`),
the manual analogue of `buildGraph`/`resolveMapping` — smaller, since
there's no character/phase/prompt-adapter concept to thread through:

```ts
export async function resolveManualGraph(
  session: ManualWorkflowSession,
  comfyClient: ComfyUIClient,
  overrides: Record<string, string | number | boolean> = {}, // fieldId -> override value, for batch
): Promise<RawComfyGraph> {
  const rawGraph = await readJsonFile(path.join(session.workflowDir, session.workflowFile!));
  const graph: RawComfyGraph = JSON.parse(JSON.stringify(rawGraph));

  for (const field of session.fields) {
    if (field.mappings.length === 0) continue;
    const value = overrides[field.id] ?? field.value;

    let spliced: string | number | boolean;
    if (field.type === 'image') {
      if (value === null) {
        throw new BadRequestError(`Field "${field.key}" is mapped but has no image selected`);
      }
      const image = session.images.find((i) => i.id === value);
      if (!image) throw new BadRequestError(`Field "${field.key}"'s selected image no longer exists`);
      const buffer = await readFile(path.join(session.workflowDir, 'assets', image.filename));
      const uploaded = await comfyClient.uploadImage(buffer, image.filename, 'input', { overwrite: true });
      spliced = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
    } else {
      spliced = value as string | number | boolean;
    }

    for (const mapping of field.mappings) {
      const node = graph[mapping.nodeId];
      if (!node) continue;
      node.inputs = node.inputs ?? {};
      node.inputs[mapping.inputName] = spliced;
    }
  }

  return graph;
}
```

Unlike the character pipeline (whose `NodeMapping.sourceValue` is always a
plain string by schema, spliced in as one even for numeric/boolean widget
inputs — see `execution.service.ts:455-459`'s comment), `ManualFieldSchema.value`
already carries its real type, so this splices the actual
string/number/boolean — a small correctness improvement that falls out of
the existing schema, not new scope.

### `ManualExecutionService`

New, `src/services/manual-execution.service.ts` — a much smaller sibling
of `ExecutionService`, constructed once in `views/index.ts` from the
**same** `comfyClient`/`comfySocket`/`jobStore` instances already built
there:

```ts
export interface ManualExecutionService {
  submitGeneration(sessionId: string): Promise<{ generationId: string }>;
  submitBatch(sessionId: string, start: number, count: number): Promise<{ batchId: string }>;
  reconcile(): Promise<void>;
}
```

- **`submitGeneration`**: loads the session; requires `workflowFile` and
  `resultOutput` set (`BadRequestError` otherwise); requires no job
  currently active for this session — `jobStore.get(sessionId, 'run')`'s
  status isn't `queued`/`running`. Resolves the graph (no overrides),
  submits via `comfyClient.submitPrompt(graph, clientId)`, records
  ownership in an in-memory `Map<promptId, {sessionId, generationId}>`
  (this service's own, independent from `ExecutionService`'s), and calls
  `jobStore.set(sessionId, 'run', {kind: 'single', promptId, status: 'queued', ...})`.
- **`submitBatch`**: additionally requires `batchFieldId` set. Submits
  `count` (clamped 1–16, same bound as Casting Batch) sequential
  `/prompt` calls, each resolving the graph with
  `overrides: {[batchFieldId]: start + i}`. Every sub-run gets its own
  `ManualGenerationSchema.id` and shares one `batchId`; tracked as a
  `BatchJobRecord` with one `BatchSubJob` per sub-run — `BatchSubJob.seed`
  holds `start + i` (the resolved batch-field value for that sub-run, not
  literally a random seed — an honest reuse of the existing shape rather
  than widening `job-store.service.ts`).
- **On completion** (socket `executing`-with-`node: null` message, same
  detection `execution.service.ts:210` uses): fetches the history entry,
  pulls the image out via `session.resultOutput` exactly like
  `fetchResultImage` (`execution.service.ts:271-287`) does, downloads it
  via `comfyClient.viewImage`, and writes it to disk via
  `storeManualImage(session, buffer, extension)` — a small helper
  extracted from the body of `POST /:id/images`
  (`src/controllers/v1/manual.ts:231-253`) so both the user-upload route
  and generation-completion path share one write-and-register procedure.
  Then, in a single `updateSession` call: appends the new
  `ManualGenerationSchema` record (`status: 'done'`, `imageId`,
  `fieldValuesSnapshot: session.fields` reduced to `{key: value}`, plus
  `batchId` if this was a batch sub-run) and the new `ImageSchema` entry.
  Progress/queued/running transitions before that update **only** touch
  `jobStore` (LMDB) — not the session JSON file — matching the existing
  character pipeline's write frequency, not one write per progress tick.
- **On error**: same, but `jobStore.set(..., {status: 'error', error})`
  and a `generations` entry with `status: 'error'`, `error: message`.
- **`reconcile()`**: same restart-recovery role as
  `ExecutionService.reconcile` (`execution.service.ts:634-657`) — for any
  manual job left `queued`/`running` in the store, re-check
  `/history` and either complete it or re-register ownership.

`socket.onMessage(...)` is called once more here, alongside the character
pipeline's own registration — Node's `EventEmitter` supports both, and
each handler only acts on prompt ids in its own ownership map.

### Backend: generation routes & SSE

```ts
manualRouter.post('/:id/generate', async (req: Request, res: Response) => {
  const { generationId } = await manualExecution.submitGeneration(req.params.id.toString());
  res.status(202).json({ generationId });
});

manualRouter.post('/:id/generate-batch', async (req: Request, res: Response) => {
  const start = Number(req.body.start);
  const count = Math.min(Math.max(Number(req.body.count) || 1, 1), 16);
  if (!Number.isFinite(start)) throw new BadRequestError('A start value is required');
  const { batchId } = await manualExecution.submitBatch(req.params.id.toString(), start, count);
  res.status(202).json({ batchId });
});
```

`GET /manual/:id/events` (`src/views/manual.views.ts`), copied from
`characters.views.ts:374-395` with `character.slug`/`phaseBindingKey`
replaced by `session.id`/`'run'`:

```ts
router.get('/:id/events', async (req: Request, res: Response) => {
  const session = await req.app.manualWorkflows.getSession(req.params.id.toString());
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (record: JobRecord | undefined) => res.write(`data: ${JSON.stringify(record ?? null)}\n\n`);
  send(app.jobStore.get(session.id, 'run'));
  const unsubscribe = app.jobStore.onChange(session.id, 'run', send);
  req.on('close', () => unsubscribe());
});
```

### Frontend: Generation page

**Actions card**:

```njk
{% call ui.card('Actions') %}
  <div data-sse-events="/manual/{{ session.id }}/events" {{ 'data-sse-batch' if session.batchFieldId }}>
    <form method="post" action="/api/v1/manual/{{ session.id }}/generate" data-generate-form>
      {{ ui.button('Generate', 'primary', 'submit', not (session.workflowFile and session.resultOutput)) }}
    </form>
    {% if session.batchFieldId %}
      <form method="post" action="/api/v1/manual/{{ session.id }}/generate-batch" class="flex items-center gap-2 mt-2">
        <input type="number" name="start" placeholder="start value" class="w-24 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2 py-1 text-[12.5px]" />
        <input type="number" name="count" value="4" min="1" max="16" class="w-16 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2 py-1 text-[12.5px]" />
        {{ ui.button('Run Batch', 'secondary', 'submit') }}
      </form>
    {% endif %}
    <div data-sse-status class="text-[12.5px] text-steel-500 mt-2"></div>
    <progress data-sse-progress class="w-full mt-1"></progress>
  </div>
{% endcall %}
```

Both forms are intercepted client-side (new small block in
`manual-generation.js`) to `fetch()` instead of navigate, so the SSE
status area updates in place rather than the page reloading — consistent
with how `dynamic-fields.js` already avoids full-page submits elsewhere on
this page. `Generate`/`Run Batch` are disabled while
`data-sse-status`'s underlying record is `queued`/`running` (one job at a
time per session, regardless of single vs. batch, per the existing
`jobStore` key).

**Outputs card**: now genuinely populates from `session.generations` — the
latest `status: 'done'` generation as the hero, the rest in the existing
tile grid. Generations sharing a `batchId` render under one small
subheading (`"Batch · N results"`), mirroring `casting_batch.njk`'s
grouped-tile convention; a batch still in flight shows placeholder tiles
driven by `data-sse-batch` the same way `casting_batch.njk:47` does.

**Inputs card**: `_dynamicFieldRow` gains one read-only badge —
`{{ 'Mapped' if field.mappings.length else 'Not mapped' }}` — next to the
key label. Purely informational; editing mapping still only happens on
the Configuration page.

### Explicitly out of scope

- Canceling an in-flight generation or batch once submitted.
- Locking a field's mapping while a generation is in flight — no guard
  against editing mid-run, matching this app's existing no-lock
  conventions elsewhere.
- Validating that `outputIndex` actually exists on the chosen node's
  outputs — mirrors the character pipeline's equally shallow trust here.
- Capturing more than one output image per generation, or letting
  `resultOutput` vary per generation rather than being one fixed session
  setting.
- A generic "any field can drive a batch" model — exactly one
  number-type field may be designated `batchFieldId` at a time.
- Re-validating `type: 'image'` fields' selected image still exists
  beyond the existence check `resolveManualGraph` already does at
  resolve-time.
- Any UI for browsing/deleting past generations beyond what the existing
  Outputs grid + `/manual/{id}/images` gallery tab already provide.

## Testing

- Schema tests: `ManualFieldSchema` accepts/validates `mappings`;
  `ManualWorkflowSessionSchema` accepts `resultOutput`/`batchFieldId`;
  `ManualGenerationSchema` accepts `batchId`.
- Controller tests: mapping conflict rejection (two fields, same
  `(nodeId, inputName)`); `result-output`/`batch-field` routes persist and
  validate (non-number field rejected for `batch-field`); `workflow-inputs`
  returns `parseWorkflowGraph`'s output for the session's attached graph.
- `candidateOutputNodes` unit test: unchanged behavior against both a
  `WorkflowVersion.nodes` input (existing character-integration test, if
  any) and a plain `ParsedNodeInput[]`.
- `resolveManualGraph` unit tests: unmapped inputs retain their original
  raw value; a mapped `number`/`boolean` field splices its real type, not
  a string; a mapped `image` field with no selection throws; batch
  `overrides` supersede the field's stored value for that resolve only.
- `ManualExecutionService` tests (mocking `comfyClient`/`comfySocket`
  the same way `execution.service.test.ts` does for the character path,
  if that pattern exists): single submit → completion writes one
  `generations` entry + one `images` entry; batch submit of N → N entries
  sharing a `batchId`; a job already `queued`/`running` rejects a second
  `submitGeneration`/`submitBatch` call.
- Manual verification via the `run` skill:
  - Create a few fields on Generation, attach a workflow on Configuration,
    map one field to one input and another field to two inputs; confirm
    the mapping summary badges update and the Generation page's "Mapped"/
    "Not mapped" badges reflect it.
  - Attempt to map a second field to an already-claimed input — confirm a
    clear inline rejection.
  - Set a Result Output, click `Generate` with zero fields mapped —
    confirm it runs and produces an image identical to running the
    original `workflow.json` unmodified in ComfyUI (pure static
    passthrough).
  - Map a `number` field, designate it as the Batch Field, run a batch of
    4 from a start value — confirm 4 distinct generations appear grouped
    together, each using `start`, `start+1`, `start+2`, `start+3`.
  - Restart the process mid-generation — confirm `reconcile()` resolves it
    against ComfyUI's `/history` rather than leaving it stuck "running".
