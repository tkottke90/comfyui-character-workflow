# Reusable Nav Tabs + Manual Workspace Shell — Design

## Problem

`src/templates/partials/character-subnav.njk` implements a responsive
tab nav (desktop underline row + mobile dropdown) for the 9 character
phase pages, but it's hardcoded to a specific 9-tab list built from
`character.slug`. There's no way to reuse this pattern elsewhere without
copy-pasting the whole partial and its markup-embedded tab list.

Separately, the manual workflow area is meant to grow into a 3-tab
workspace — **Configuration** (select/upload a ComfyUI workflow JSON),
**Generation** (manage prompts/samplers/inputs and generate images), and
**Images** (a gallery that can feed an image back into Generation as
input, similar to the Character Refinement flow) — but today
`/manual/:id/workspace` is a single page with no navigation at all, still
showing a "create workflow" form left over from early scaffolding.

Building all three tabs' real functionality is a separate, much larger
effort (each has its own data model and backend work — note
`src/controllers/v1/manual.ts:70-72`'s already-stubbed, unimplemented
`POST /:id/set-workflow`). This spec scopes to two connected pieces:
generalizing the subnav into a reusable component, and standing up the
3-tab shell (routes + navigation + placeholder content) so the workspace
area exists and reads correctly. The Configuration/Generation/Images
functionality itself is out of scope, to be designed separately per tab.

## Current implementation

- `src/templates/partials/character-subnav.njk` — defines a 9-item
  `tabs` list inline (`{key, label, href}` built from `character.slug`),
  computes an `activeLabel` for the mobile trigger by matching
  `subsection`, then renders both the desktop row and mobile dropdown
  directly. Included via `{% include %}` in 13 character templates
  (`overview.njk`, `spec.njk`, `refinement.njk`, `kit.njk`, `dataset.njk`,
  `validation.njk`, `images.njk`, `casting_preflight.njk`,
  `casting_batch.njk`, `polish.njk`, `winner_audit.njk`, `face_crop.njk`,
  `view_generation.njk`, `targeted_fix.njk`), each setting
  `{% set subsection = "..." %}` before the include.
- `public/app.js:383-399` — wires the mobile dropdown via
  `document.getElementById('character-subnav-trigger')` /
  `('character-subnav-menu')`, a hardcoded singleton lookup tied to this
  one partial's IDs.
- `src/templates/manual/workspace.njk` — the only content at
  `/manual/:id/workspace` today: a form (`Name` field) posting to
  `/api/v1/manual?view=yes` to create a new session. This doesn't fit the
  3-tab model and per prior discussion was scaffold, not a real feature.
- `src/views/manual.views.ts:20-25` — the current `GET /:id/workspace`
  handler, fetching the session and rendering `manual/workspace.njk`.
- `src/services/manual-workflow.service.ts:26-36` — the session schema:
  `id`, `workflowName`, `description`, `workflowDir`, `workflowFile`,
  `images[]`, `sessionNotes[]`, timestamps. No workflow-JSON-selection
  field yet — that arrives with the Configuration tab's real
  implementation, later.
- `src/templates/macros.njk` — home to all existing macros (`card`,
  `button`, `pill`, `mono`, `copyable`, etc.); no other macro file exists
  in the templates tree.

## Design

### `navTabs()` macro

New macro in `macros.njk`, generalizing `character-subnav.njk`'s markup
to take the tab list and active key as parameters instead of hardcoding
them:

```njk
{% macro navTabs(tabs, active, id='subnav', fallbackLabel='Menu') %}
  {% set activeLabel = fallbackLabel %}
  {% for tab in tabs %}
    {% if tab.key == active %}{% set activeLabel = tab.label %}{% endif %}
  {% endfor %}
  <div class="mb-5 border-b border-steel-200 dark:border-steel-800" data-subnav>
    <div class="hidden md:flex gap-1">
      {% for tab in tabs %}
        <a href="{{ tab.href }}"
           class="px-3.5 py-2 text-[13px] font-bold -mb-px border-b-2 transition-colors
                  {{ 'text-apple-800 dark:text-apple-200 border-apple-600' if active == tab.key else 'text-steel-500 border-transparent hover:text-steel-700 dark:hover:text-steel-300' }}">
          {{ tab.label }}
        </a>
      {% endfor %}
    </div>
    <div class="relative md:hidden pb-2">
      <button type="button" data-subnav-trigger aria-haspopup="true" aria-expanded="false" aria-controls="{{ id }}-menu"
        class="flex items-center justify-between w-full gap-2 px-3.5 py-2 text-[13px] font-bold rounded-md border border-steel-200 dark:border-steel-800 text-apple-800 dark:text-apple-200">
        <span>{{ activeLabel }}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div id="{{ id }}-menu" data-subnav-menu
        class="hidden absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-steel-200 dark:border-steel-800 bg-white dark:bg-steel-900 shadow-lg overflow-hidden">
        {% for tab in tabs %}
          <a href="{{ tab.href }}"
             class="block px-3.5 py-2 text-[13px] font-bold transition-colors
                    {{ 'text-apple-800 dark:text-apple-200 bg-apple-50 dark:bg-apple-950' if active == tab.key else 'text-steel-500 hover:text-steel-700 dark:hover:text-steel-300 hover:bg-steel-50 dark:hover:bg-steel-800' }}">
            {{ tab.label }}
          </a>
        {% endfor %}
      </div>
    </div>
  </div>
{% endmacro %}
```

`tabs` is a list of `{key, label, href}` objects, matching the shape
`character-subnav.njk` already builds. `id` namespaces the
`aria-controls`/`id` pairing so multiple instances can coexist on a page
without colliding; `fallbackLabel` replaces the hardcoded `'Phases'` text
shown when no tab matches `active`.

Kept in `macros.njk` alongside the other macros rather than a new file —
there's no existing precedent for splitting macros across files, and
`copyable()` (added in the prior pass) is already the largest macro
there, so this isn't a new pattern.

### Generalized JS wiring

`public/app.js:383-399`'s hardcoded `getElementById` block is replaced
with a scoped, multi-instance version, matching the codebase's existing
`data-*` delegation convention (`[data-copy-target]` in `copy.js`,
`[data-preset-select]` elsewhere in `app.js`):

```js
// ---- Subnav dropdown (below md): trigger opens the tab menu, outside click /
// Escape / picking a link closes it. [data-subnav] scoping supports any number
// of independent instances on a page (character phases, manual workspace tabs). ----
document.querySelectorAll('[data-subnav]').forEach(function (root) {
  var trigger = root.querySelector('[data-subnav-trigger]');
  var menu = root.querySelector('[data-subnav-menu]');
  if (!trigger || !menu) return;

  var setOpen = function (open) {
    menu.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', String(open));
  };
  trigger.addEventListener('click', function (event) {
    event.stopPropagation();
    setOpen(menu.classList.contains('hidden'));
  });
  document.addEventListener('click', function (event) {
    if (!menu.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpen(false);
  });
});
```

### `character-subnav.njk` migration

Shrinks to a thin wrapper around the new macro — same 9-tab list, same
`character.slug`-based hrefs, unchanged behavior:

```njk
{% import "macros.njk" as ui %}
{% set tabs = [
  {key: 'spec', label: 'Spec', href: '/characters/' + character.slug + '/spec'},
  {key: 'casting-preflight', label: 'Casting Preflight', href: '/characters/' + character.slug + '/casting/preflight'},
  {key: 'casting-batch', label: 'Casting Batch', href: '/characters/' + character.slug + '/casting/batch'},
  {key: 'refinement', label: 'Refinement', href: '/characters/' + character.slug + '/refinement'},
  {key: 'targetedFix', label: 'Targeted Fix', href: '/characters/' + character.slug + '/targeted-fix'},
  {key: 'images', label: 'Images', href: '/characters/' + character.slug + '/images'},
  {key: 'kit', label: 'Anchor kit', href: '/characters/' + character.slug + '/kit'},
  {key: 'validation', label: 'Validation', href: '/characters/' + character.slug + '/validation'},
  {key: 'dataset', label: 'Dataset', href: '/characters/' + character.slug + '/dataset'}
] %}
{{ ui.navTabs(tabs, subsection, id='character-subnav', fallbackLabel='Phases') }}
```

None of the 13 character templates change — they still
`{% include "partials/character-subnav.njk" %}` and set `subsection`
exactly as before.

### Manual workspace 3-tab shell

**Routes** in `src/views/manual.views.ts`, replacing the current
`GET /:id/workspace` handler (lines 20-25):

```
GET /manual/:id/workspace                → redirect to /manual/:id/workspace/configuration
GET /manual/:id/workspace/configuration  → renders manual/workspace/configuration.njk
GET /manual/:id/workspace/generation     → renders manual/workspace/generation.njk
GET /manual/:id/workspace/images         → renders manual/workspace/images.njk
```

All three fetch and render with the same `{ session: session.toJSON() }`
shape the current handler already uses — no service-layer changes.

**New shared partial** `partials/manual-workspace-subnav.njk`, playing
the same role as `character-subnav.njk`:

```njk
{% import "macros.njk" as ui %}
{% set tabs = [
  {key: 'configuration', label: 'Configuration', href: '/manual/' + session.id + '/workspace/configuration'},
  {key: 'generation', label: 'Generation', href: '/manual/' + session.id + '/workspace/generation'},
  {key: 'images', label: 'Images', href: '/manual/' + session.id + '/workspace/images'}
] %}
{{ ui.navTabs(tabs, workspaceTab, id='manual-workspace-subnav', fallbackLabel='Workspace') }}
```

**Three new templates** under `src/templates/manual/workspace/`
(`configuration.njk`, `generation.njk`, `images.njk`), identical in
structure apart from `workspaceTab` and the placeholder text:

```njk
{% extends "layout.njk" %}
{% set section = "manual" %}
{% import "macros.njk" as ui %}
{% set workspaceTab = "configuration" %}
{% block content %}
  {{ ui.crumbs([{label: 'Manual', href: '/manual'}, {label: session.workflowName, href: '/manual/' + session.id}, {label: 'Workspace'}]) }}
  <h1 class="text-xl font-black tracking-tight mb-1">{{ session.workflowName }}</h1>
  {% include "partials/manual-workspace-subnav.njk" %}
  <div class="rounded-lg border border-dashed border-steel-300 dark:border-steel-700 p-6 text-center text-steel-500 text-[13px]">
    Configuration coming soon.
  </div>
{% endblock %}
```

The old `src/templates/manual/workspace.njk` (the "create workflow" form)
is deleted. `/manual/:id` (`detail.njk`) and the "create a new session"
flow (`/manual/new` → `POST /api/v1/manual`, whose `view` link points to
`/manual/:id` per `manual-workflow.service.ts:220`) are untouched.

### Explicitly out of scope

- Real Configuration/Generation/Images functionality — workflow JSON
  upload, prompt/sampler forms, image generation triggering, and the
  image-cycle-to-input behavior. Each gets its own design pass; this
  spec only stands up the shell they'll be built into.
- Any change to the character pages' content or behavior beyond the
  `character-subnav.njk` internals — the 13 templates including it are
  untouched.
- Any change to the manual session data model
  (`manual-workflow.service.ts`) — the placeholder pages use only fields
  that already exist.

## Testing

Both the `src/controllers/index.ts` route registration path and
`src/views/manual.views.ts` are TypeScript, so this pass runs the
project's existing checks:

- `npm run typecheck`
- `npm run lint`
- `npm test` (mocha) — check whether any existing test covers
  `/manual/:id/workspace`; update it for the new redirect + sub-routes if
  so.

No automated test harness exists for `.njk` templates or `public/*.js`
(consistent with the toast and copy-to-clipboard specs), so manual
verification via the `run` skill:

- Visit an existing character page (e.g. `/characters/:slug/spec`) and
  confirm the subnav renders and behaves identically to before: desktop
  tab row, mobile dropdown open/close (click, outside-click, Escape),
  active-tab highlighting. This is the regression check for the
  `character-subnav.njk` migration.
- Visit `/manual/:id/workspace` and confirm it redirects to
  `/manual/:id/workspace/configuration`.
- Click between Configuration/Generation/Images (desktop row and mobile
  dropdown) and confirm the active tab highlights correctly and the
  placeholder text matches the page.
- Confirm `/manual/:id` (the overview/detail page) and `/manual/new` are
  unaffected.
- At mobile width, confirm the character-page subnav and the manual
  workspace subnav each open/close independently without interfering —
  verifying `[data-subnav]` scoping actually supports multiple instance
  types, even though only one renders per page today.
