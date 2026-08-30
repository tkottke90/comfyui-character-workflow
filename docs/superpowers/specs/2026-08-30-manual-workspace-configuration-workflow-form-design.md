# Manual Workspace — Configuration Workflow Form — Design

## Problem

`/manual/:id/workspace/configuration` (added in the [nav-tabs and manual
workspace shell design](2026-08-30-nav-tabs-and-manual-workspace-shell-design.md))
is currently a static "Configuration coming soon." placeholder. A manual
session needs a way to attach a ComfyUI workflow JSON to itself before the
later Generation/Images tabs have anything to run — either by uploading a
new `.json` export, or by reusing a workflow that's already on disk
somewhere: one imported via the character-integration workflow-mapping
screen, or one already attached to a different manual session.

## Current implementation

- `ManualWorkflowSessionSchema` (`src/services/manual-workflow.service.ts:27-39`)
  already has `workflowDir` (per-session directory) and `workflowFile`
  (optional filename) fields — unused today, called out in the prior
  design as "arrives with the Configuration tab's real implementation,
  later."
- `POST /api/v1/manual/:id/set-workflow` (`src/controllers/v1/manual.ts:70-72`)
  is registered but empty — an already-stubbed placeholder for exactly
  this.
- The character-integration workflow importer
  (`src/views/integration.views.ts`'s `POST /integration/workflow-mapping/import`)
  establishes the upload convention this reuses: a hidden
  `workflowJsonDataUrl` field populated client-side from a `FileReader`
  reading the chosen file as a base64 data URL (`public/app.js`'s
  `[data-file-upload]` block, `src/lib/data-url.ts`'s `parseJsonDataUrl`)
  — there's no server-side multipart parser in this app.
- Imported workflow JSON lives at
  `config/workflows/raw/<slug>/v<N>.json`, readable via
  `WorkflowMappingService.getRawGraph(slotId, version)`
  (`src/services/workflow-mapping.service.ts:210-219`). This service is
  stateless — every method reads/writes the filesystem directly, no
  in-memory cache — so a second instance pointed at the same directory is
  safe to create. `views/index.ts` currently creates the only instance and
  passes it solely to `createIntegrationRouter`.
- `src/lib/files.ts` already has `readJsonFile(path)` and
  `writeJsonFile(path, content)` helpers.
- `ManualWorkflowRegistry.sessions` (`src/services/manual-workflow.service.ts:59`)
  is a `Map<id, metadataPath>` of every session; `getSession(id)` loads one
  session's full record from disk.

## Design

### Backend: `POST /api/v1/manual/:id/set-workflow`

Fills in the existing stub. Request body:

- `mode`: `'upload'` | `'select'`
- upload mode: `workflowJsonDataUrl` (base64 data URL), `filename` — same
  two fields the integration importer's form already produces
- select mode: `source`, formatted as `integration|<slotId>|<version>` or
  `session|<otherSessionId>`

Handler logic:

```ts
manualRouter.post('/:id/set-workflow', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const mode = String(req.body.mode ?? '');

  let rawGraphJson: unknown;

  if (mode === 'upload') {
    const dataUrl = String(req.body.workflowJsonDataUrl ?? '');
    if (!dataUrl) throw new BadRequestError('A workflow JSON file is required');
    try {
      rawGraphJson = parseJsonDataUrl(dataUrl);
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Invalid JSON file');
    }
  } else if (mode === 'select') {
    const [kind, ...rest] = String(req.body.source ?? '').split('|');

    if (kind === 'integration') {
      const [slotId, versionStr] = rest;
      const raw = workflowMapping.getRawGraph(slotId, Number(versionStr));
      if (!raw) throw new BadRequestError('Selected workflow could not be found');
      rawGraphJson = raw;
    } else if (kind === 'session') {
      const [sourceId] = rest;
      const source = await app.manualWorkflows.getSession(sourceId);
      if (!source.workflowFile) throw new BadRequestError('Selected session has no workflow file');
      rawGraphJson = await readJsonFile(path.join(source.workflowDir, source.workflowFile));
    } else {
      throw new BadRequestError('A workflow source must be selected');
    }
  } else {
    throw new BadRequestError('A workflow file or selection is required');
  }

  await writeJsonFile(path.join(session.workflowDir, 'workflow.json'), rawGraphJson);
  await app.manualWorkflows.updateSession(session.id, { workflowFile: 'workflow.json' });

  if (req.query.view) {
    res.redirect(`/manual/${session.id}/workspace/configuration`);
  } else {
    res.status(200).json({ ...session.toJSON(), workflowFile: 'workflow.json' });
  }
});
```

`workflowMapping` is a module-level `createWorkflowMappingService(app.config.getConfigDir('workflows'))`
instantiated inside `createManualWorkflowAPI(app)` — a second, independent
instance from the one `views/index.ts` uses for the integration screens,
justified by the service's statelessness (see above). No changes to
`views/index.ts` or `createIntegrationRouter` are needed.

The uploaded/selected JSON always lands at the fixed path
`<workflowDir>/workflow.json`, overwriting whatever was there before —
matching "one active workflow per session" rather than accumulating
files. `workflowFile` is therefore always exactly `'workflow.json'` once
set; no new schema field is needed. The Configuration page only shows
*that* a workflow is attached, not where it came from.

Validation is intentionally shallow: `parseJsonDataUrl` already requires
valid JSON (throws `BadRequestError` otherwise via the catch above).
There's no ComfyUI-graph-shape validation (`parseWorkflowGraph`,
per-slot field mapping) — manual workflows are run as-is, not through the
character-integration mapping pipeline, so that validation doesn't apply
here.

### Backend: option lists for `GET /:id/workspace/configuration`

Extends the existing handler in `src/views/manual.views.ts`:

```ts
router.get('/:id/workspace/configuration', async (req: Request, res: Response) => {
  const session = await req.app.manualWorkflows.getSession(req.params.id.toString());

  const integrationOptions = workflowMapping
    .list()
    .filter((record) => record.versions.length > 0)
    .map((record) => {
      const version = record.versions.at(-1)!; // latest only, not full history
      const slot = getWorkflowSlot(record.slotId);
      return {
        value: `integration|${record.slotId}|${version.version}`,
        label: `${slot?.label ?? record.slotId} — v${version.version} (${version.filename})`,
      };
    });

  const otherSessionIds = Array.from(req.app.manualWorkflows.sessions.keys())
    .filter((id) => id !== session.id);
  const otherSessions = await Promise.all(
    otherSessionIds.map((id) => req.app.manualWorkflows.getSession(id))
  );
  const sessionOptions = otherSessions
    .filter((other) => other.workflowFile)
    .map((other) => ({
      value: `session|${other.id}`,
      label: `${other.workflowName} (${other.workflowFile})`,
    }));

  res.render('manual/workspace/configuration.njk', {
    session: session.toJSON(),
    integrationOptions,
    sessionOptions,
  });
});
```

Same `workflowMapping` instance pattern as the POST handler (created once
per router-factory call, not per-request).

### Frontend: `configuration.njk`

Replaces the placeholder `<div>` with:

```njk
{% if session.workflowFile %}
  <p class="text-[13px] text-steel-500 mb-4">Workflow attached (<code>{{ session.workflowFile }}</code>).</p>
{% else %}
  <p class="text-[13px] text-steel-500 mb-4">No workflow configured yet.</p>
{% endif %}

{% call ui.card('Set workflow') %}
  <form method="post" action="/api/v1/manual/{{ session.id }}/set-workflow?view=yes" data-workflow-source>
    <div class="flex gap-4 mb-4 text-[13px] font-semibold">
      <label class="flex items-center gap-1.5">
        <input type="radio" name="mode" value="upload" checked /> Upload a file
      </label>
      <label class="flex items-center gap-1.5">
        <input type="radio" name="mode" value="select" /> Select existing
      </label>
    </div>

    <div data-workflow-panel="upload" class="mb-4" data-file-upload>
      <input type="hidden" name="workflowJsonDataUrl" value="" />
      <input type="hidden" name="filename" data-file-name value="" />
      <div class="rounded-lg border-2 border-dashed border-steel-300 dark:border-steel-700 px-10 py-6 flex flex-col items-center gap-2 cursor-pointer"
           onclick="this.querySelector('input[type=file]').click()">
        <div class="text-[13px] font-semibold" data-file-label>Drag a workflow .json here, or click to browse</div>
        <input type="file" accept="application/json" class="hidden" />
      </div>
    </div>

    <div data-workflow-panel="select" class="mb-4 hidden">
      {% if integrationOptions.length or sessionOptions.length %}
        <select name="source" class="w-full rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[12.5px] font-mono">
          {% if integrationOptions.length %}
            <optgroup label="Character Integration">
              {% for opt in integrationOptions %}
                <option value="{{ opt.value }}">{{ opt.label }}</option>
              {% endfor %}
            </optgroup>
          {% endif %}
          {% if sessionOptions.length %}
            <optgroup label="Other Manual Sessions">
              {% for opt in sessionOptions %}
                <option value="{{ opt.value }}">{{ opt.label }}</option>
              {% endfor %}
            </optgroup>
          {% endif %}
        </select>
      {% else %}
        <p class="text-[13px] text-steel-400">Nothing available yet — import a workflow via Character Integration, or set one on another manual session.</p>
      {% endif %}
    </div>

    {{ ui.button('Save workflow') }}
  </form>
{% endcall %}
```

No `data-require-file` on this form (unlike the integration importer) —
that gating disables the submit button until a file is chosen, which
would incorrectly block submission in "select" mode. Invalid/empty
submissions are instead caught server-side and rendered via the app's
existing `error.njk` page (`errorHandler` in
`src/middleware/error.middleware.ts` already renders HTML for
`BadRequestError` on form posts, same as the integration importer's own
validation errors today).

### Frontend: `app.js` panel toggle

New delegated block, same style as the existing `[data-subnav]` /
`[data-file-upload]` blocks:

```js
// ---- Workflow source form (manual workspace Configuration tab): radio choice
// toggles which panel (upload vs select) is visible ----
document.querySelectorAll('[data-workflow-source]').forEach(function (root) {
  var radios = root.querySelectorAll('input[name="mode"]');
  var panels = root.querySelectorAll('[data-workflow-panel]');

  var sync = function () {
    var checked = root.querySelector('input[name="mode"]:checked');
    var mode = checked ? checked.value : 'upload';
    panels.forEach(function (panel) {
      panel.classList.toggle('hidden', panel.dataset.workflowPanel !== mode);
    });
  };

  radios.forEach(function (radio) {
    radio.addEventListener('change', sync);
  });
  sync();
});
```

### Explicitly out of scope

- ComfyUI-graph-shape validation of uploaded/selected JSON.
- Tracking or displaying where the current `workflow.json` came from
  (upload vs. which integration slot/version vs. which other session).
- Exposing every historical version of an integration-imported workflow —
  only the latest per slot is selectable.
- Any change to `views/index.ts` / `createIntegrationRouter` — the manual
  controller's `workflowMapping` instance is separate and read-only from
  its perspective.
- Using the attached `workflow.json` for anything (that's the Generation
  tab's job, designed separately).

## Testing

- `npm run typecheck`, `npm run lint`, `npm test` (mocha) — no existing
  test covers `set-workflow` or the configuration GET handler; add
  coverage if a natural spot exists alongside other `manual-workflow.service`
  tests, otherwise this stays manual-verification only, consistent with
  the rest of the manual/view-layer code.
- Manual verification via the `run` skill:
  - Visit a session's Configuration tab with no workflow set — confirm
    "No workflow configured yet.", Upload panel shown by default.
  - Upload a `.json` file — confirm redirect back to Configuration, and
    "Workflow attached (workflow.json)" now shows.
  - Switch to "Select existing" — confirm the Character Integration
    optgroup lists real imported slots (e.g. `001-Seed`), and the Other
    Manual Sessions optgroup lists any other session that already has a
    workflow attached (and excludes the current session).
  - Select an integration entry, save, confirm the file at
    `<workflowDir>/workflow.json` matches
    `config/workflows/raw/<slug>/v<N>.json`'s content.
  - Select a session entry, save, confirm the file matches that other
    session's `workflow.json`.
  - Submit with neither a file chosen nor a source selected — confirm a
    clear error page rather than a crash.
