# Copy-to-Clipboard Component — Design

## Problem

[Toast notifications](2026-08-30-toast-notifications-design.md) already
implemented `public/copy.js`'s click-to-copy handler and confirmation
toast, wired via `[data-copy-target]` and loaded in `layout.njk`. But
`grep`ping the codebase for `data-copy-target` turns up nothing — no
template actually emits an element with that attribute. The click handler
and toast plumbing exist; there is no reusable markup/macro convention for
authors to opt a piece of content into "click to copy," and no visual
affordance telling users an element is copyable at all.

## Current implementation

- `public/copy.js` — fully implemented. On click of a `[data-copy-target]`
  element, calls `navigator.clipboard.writeText(...)` with the attribute's
  value, then `window.toast.show(...)` for success/failure. Wires up via
  `document.querySelectorAll('[data-copy-target]').forEach(...)` once at
  script load time — the same pattern every other `data-*` interaction in
  `app.js` uses (e.g. `data-randomize-seed`, `data-delete-url`).
- `src/templates/layout.njk:71` — loads `copy.js` as the last plain
  `<script>` tag, after `toast.js`, so `window.toast` is available.
- `src/templates/macros.njk` — defines `card(label='')` (wraps `caller()`
  in a bordered/shadowed panel with an optional uppercase eyebrow label)
  and sibling macros `pill()`, `button()`, `mono()`, `statusBadge()`, all
  following the same "Tailwind utility classes selected by a param"
  convention.
- No JS framework, no bundler. Client JS is plain vanilla, IIFE-wrapped,
  ES5-flavored, loaded as sequential `<script src="...">` tags.

## Design

### API

New macro `copyable(value='')` in `src/templates/macros.njk`, alongside
`card()`:

```njk
{% call ui.copyable('sk-live-4f9a2b1c8e7d') %}
  <span class="font-mono text-sm">sk-live-4f9a2b1c8e7d</span>
{% endcall %}

{% call ui.copyable() %}
  a young woman with auburn hair, standing in a sunlit forest clearing...
{% endcall %}
```

- Content is passed via a call-block, matching `card()`'s `caller()`
  convention — not a param.
- `value` is optional:
  - If given, it's the literal string written to the clipboard,
    independent of how the content is displayed (e.g. displayed content
    can carry markup/formatting the copied value shouldn't include).
  - If omitted, the macro captures `caller()`'s rendered output and uses
    it as the copy value, so plain-text call sites need no extra param.
- No `label` param (unlike `card()`). A caller wanting a labeled section
  nests instead: `{% call ui.card('API Key') %}{% call ui.copyable(key) %}...{% endcall %}{% endcall %}`.
- Renders as `<button type="button" data-copy-target="...">`, reusing the
  existing `data-copy-target` attribute `copy.js` already listens for — no
  new wiring convention introduced.

### Markup and layout

```html
<button type="button" data-copy-target="{{ value }}"
        class="group relative flex items-start gap-3 w-full text-left
               bg-white dark:bg-steel-900 border border-steel-200
               dark:border-steel-800 rounded-lg shadow-[0_1px_2px_rgba(29,38,52,.06)]
               p-3 hover:bg-steel-50 dark:hover:bg-steel-800/50"
        aria-label="Copy to clipboard">
  <span class="flex-1 min-w-0">{{ caller() }}</span>
  <span class="copy-icon-wrap flex-shrink-0">
    <svg data-copy-icon="idle" ...><!-- clipboard glyph --></svg>
    <svg data-copy-icon="success" ...><!-- checkmark glyph --></svg>
  </span>
</button>
```

One markup structure handles both short single-line values and long
multi-line blocks: `flex items-start` puts the icon in a flex item on the
right with `align-items` set to `start` rather than `center`. For a
single-line value this places the icon beside the text; for a wrapped
multi-line block, the icon stays pinned at the top-right as the text wraps
below it. No separate "block" vs. "inline" param or layout variant is
needed.

`<button>` is a real button (`type="button"`), not a styled `<div>`, so it
gets keyboard focus and Enter/Space activation for free. Tailwind resets
(`text-left`, `w-full`, plus inherited font/background removal) make it
read as a plain wrapper rather than a native button. Styling otherwise
matches `card()` (`bg-white`/`border-steel-200`/`rounded-lg`/shadow) so it
reads as part of the same visual system.

### Icon affordance and states

- **Idle**: a clipboard glyph (`data-copy-icon="idle"`).
- **Desktop**: hidden at rest (`opacity-0`), revealed on `:hover` and
  `:focus-visible` (via Tailwind's `group-hover`/`group-focus-visible`
  variants on `.copy-icon-wrap`) — so keyboard-focused buttons reveal the
  icon too, not just mouse hover.
- **Touch**: always visible at rest, via `@media (pointer: coarse)` in
  `public/app.css` overriding the opacity-0 default — there is no hover
  state on touch to reveal it.
- **Success feedback**: on a successful copy, `copy.js` toggles a
  `copy-success` class on the button for ~1.5s. CSS driven by that class
  swaps which of the two icons (`data-copy-icon="idle"` /
  `data-copy-icon="success"`) is visible, so the clipboard glyph becomes a
  green checkmark for that window, then reverts. This is a localized
  complement to the toast, not a replacement — useful when a page has
  several copy targets and the corner toast is easy to miss.
- **Failure**: only the error toast fires; the icon does not change (no
  natural "error" icon state fits inline here).

### `copy.js` changes

Two changes to the already-implemented handler:

1. **Event delegation**, replacing load-time
   `querySelectorAll(...).forEach(...)`, so `copyable()` instances that
   appear after page load (inside the image-viewer modal, or content
   swapped in via `sse-client.js`) are wired up without needing a re-scan:

   ```js
   document.addEventListener('click', function (e) {
     var elem = e.target.closest('[data-copy-target]');
     if (!elem || !navigator.clipboard) return;
     var text = elem.getAttribute('data-copy-target') || '';
     if (!text) return;

     navigator.clipboard.writeText(text).then(
       function () {
         if (window.toast) window.toast.show('Copied to clipboard', { type: 'success' });
         elem.classList.add('copy-success');
         setTimeout(function () { elem.classList.remove('copy-success'); }, 1500);
       },
       function () {
         if (window.toast) window.toast.show('Could not copy to clipboard', { type: 'error' });
       },
     );
   });
   ```

2. **Icon swap on success**, as described above — the only new behavior
   beyond what `copy.js` already does.

### Accessibility

- Real `<button type="button">` — native keyboard focus and Enter/Space
  activation, no manual `keydown` handling needed.
- `aria-label="Copy to clipboard"` on the button, since the visible
  content is the value being copied, not a description of the action —
  screen readers need the explicit label to announce what the control
  does.
- Toast confirmation already uses `role="alert"`/`role="status"`
  (established in the toast design), so screen-reader users get the
  outcome announced without any extra work here.

### Explicitly out of scope

- A disabled/fallback visual state for browsers without
  `navigator.clipboard` — `copy.js` already silently no-ops in that case
  (matches existing behavior; not changed by this pass).
- Any new `data-*` convention — this reuses `data-copy-target` exactly as
  `copy.js` already defines it.

## Testing

Manual verification via the `run` skill (no automated test harness exists
for `public/*.js` in this repo):

- Click a single-line `copyable()` and a multi-line block `copyable()`;
  confirm the correct value lands on the clipboard for both an explicit
  `value` param and the inner-content fallback.
- Confirm hover reveals the icon on desktop; confirm it's always visible
  under a touch/coarse-pointer emulation (Chrome DevTools device
  toolbar).
- Confirm the icon swaps to a checkmark for ~1.5s after a successful
  copy, then reverts, with the toast firing alongside it.
- Tab to a `copyable()` button, confirm focus-visible reveals the icon,
  press Enter and Space, confirm each triggers the copy.
- Place a `copyable()` inside the image-viewer modal (content present only
  after the modal opens) and confirm it works, verifying the
  event-delegation fix.
- Simulate a clipboard-write rejection (e.g. via browser devtools) and
  confirm the error toast fires with no icon swap.
- Confirm dark mode styling (border/background/hover tint) reads
  correctly.
