# Manual Images — Copy Image URL Action — Design

## Problem

When building a character manually with an LLM's help, the workflow is: generate
an image in the workspace, then have the LLM download it into the project so it
can be referenced/processed further. Today the only way to get an image's URL
is to inspect the page (view source, or right-click → copy image address),
which is slower than it needs to be. We want a one-click "Copy URL" action on
each image card that puts the image's fully-qualified URL on the clipboard,
ready to hand to the LLM for a direct `curl`/`fetch` download.

## Current implementation

- `manual/workspace/images.njk` (`src/templates/manual/workspace/images.njk:19-48`)
  renders each image card's `<img>` from a relative path,
  `/manual/{{ session.id }}/assets/{{ image.filename }}`, and has an action
  row (`:35-44`) with `Set NSFW`/`Lock` plain-text toggle buttons.
- `macros.njk`'s `copyable(value='', inline=false)` macro
  (`src/templates/macros.njk:52-69`) renders a button with
  `data-copy-target="<value>"`, a clipboard icon that swaps to a checkmark on
  success, and an `inline=true` mode for compact use inside text (already used
  on the workflow detail page to copy the workflow ID and workflow directory
  path).
- `public/copy.js` is a single delegated click handler on
  `[data-copy-target]`: it reads the attribute's literal string value,
  writes it to the clipboard via `navigator.clipboard.writeText`, and toggles
  a `copy-success` class on the button for ~1.5s (CSS in `app.css:86-109`
  swaps the icon). On failure it shows a `window.toast` error.
- There is no concept of the app's public origin/base URL anywhere in the
  codebase (`src/config.ts` has no such field) — `data-copy-target` values
  today are always plain strings (IDs, paths), never resolved against a host.

## Design

### `copyable()` macro gains an `absolute` option

`src/templates/macros.njk:52`, add a third parameter:

```njk
{% macro copyable(value='', inline=false, absolute=false) %}
  {% set content = caller() %}
  <button type="button"
    data-copy-target="{{ value if value else (content | striptags | trim) }}"
    {% if absolute %}data-copy-absolute{% endif %}
    aria-label="Copy to clipboard"
    class="...">
    ...
  </button>
{% endmacro %}
```

`data-copy-target` keeps holding whatever value is passed in (for this feature,
the image's relative asset path) — `data-copy-absolute` is just a marker the
JS uses to decide whether to resolve that value against the current origin
before copying. Existing call sites (workflow ID, workflow directory path)
don't pass `absolute`, so they're unaffected.

### `copy.js` resolves the origin at copy time

`public/copy.js:14-15`, insert a resolution step between reading the
attribute and writing to the clipboard:

```js
var text = elem.getAttribute('data-copy-target') || '';
if (!text) return;

if (elem.hasAttribute('data-copy-absolute')) {
  text = new URL(text, window.location.origin).href;
}

navigator.clipboard.writeText(text).then(/* unchanged */);
```

Using `window.location.origin` (the browser's own view of how it reached the
page) rather than anything server-computed means the copied URL is correct
whether the app is accessed via `localhost`, a LAN IP, or a tunnel — no new
config or request-context plumbing needed.

### Template: `manual/workspace/images.njk`

Compute the same relative path already used for the `<img src>`, and add a
new action to the row (`:35-44`), placed first since it'll likely be the
most-used action during active LLM-driven building:

```njk
{% set imageUrl = '/manual/' + session.id + '/assets/' + image.filename %}
...
<div class="flex items-center gap-3">
  {% call ui.copyable(imageUrl, inline=true, absolute=true) %}Copy URL{% endcall %}
  <button type="button" data-nsfw-toggle ...>...</button>
  <button type="button" data-lock-toggle ...>...</button>
</div>
```

This renders as a small text label ("Copy URL") with a clipboard icon that
appears on hover/focus and swaps to a checkmark for ~1.5s after a successful
copy — the same interaction already established by `copyable()` elsewhere,
visually distinct from the plain-text NSFW/Lock toggles next to it.

## Error handling & edge cases

- **Clipboard write fails or `navigator.clipboard` is unavailable**: unchanged
  existing `copy.js` behavior — a `window.toast` error is shown, button stays
  in its idle state.
- **Image filename contains characters needing encoding**: not a new concern
  — the same unencoded path is already used successfully as the `<img src>`
  today.

## Explicitly out of scope

- The detail page's `recentImages` grid (`manual/detail.njk`) — stays
  read-only, consistent with how NSFW/Lock were scoped.
- Any server-side computation of the app's base URL/origin.
- A bulk "copy all image URLs" action.
- Any change to how images are stored, named, or served.

## Testing

- **Manual verification** via the `run` skill: click "Copy URL" on an image
  card, paste the clipboard contents, and confirm it's a fully-qualified URL
  (`http://<host>/manual/<sessionId>/assets/<filename>`) that loads the image
  directly in a browser tab / successfully downloads via `curl`. Confirm the
  icon swaps to a checkmark briefly after the click. Confirm the existing
  workflow ID / workflow directory copy buttons on the detail page still copy
  their plain values unchanged (regression check on the shared `copy.js`
  path).
