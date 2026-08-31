# Manual Workspace — Multiline Field Type — Design

## Problem

The manual workspace dynamic-fields system (`ui.dynamicFieldForm()` macro +
`public/dynamic-fields.js`, introduced by the
[Generation page design](2026-08-30-manual-workspace-generation-page-design.md))
supports four field types: `text`, `number`, `boolean`, `image`. A `text`
field always renders as a single-line `<input>`, which is a poor fit for
long-form values like prompts — no line wrapping, no room to see more than
one line at a time. This adds a fifth type, `multiline`, that renders as a
resizable `<textarea>` instead.

## Current implementation

- `ManualFieldSchema.type` (`src/services/manual-workflow.service.ts:31`):
  `z.enum(['text', 'number', 'boolean', 'image'])`. `value` is already a
  `z.union([z.string(), z.number(), z.boolean(), z.null()])` — a multiline
  value is just a string, so no change is needed there.
- `defaultValueForType()` (`src/controllers/v1/manual.ts:13-20`): explicit
  `case`s for `number`/`boolean`/`image`, `default: return ''` covers
  `text` today.
- `_dynamicFieldRow` macro (`src/templates/macros.njk:159-183`) renders the
  server-side (first-paint) value control via an `{% if/elif %}` chain on
  `field.type`, with no `{% else %}` — an unhandled type renders nothing
  in `data-field-value-slot`.
- `public/dynamic-fields.js` rebuilds rows client-side (add/edit/save) via
  `buildValueSlot(field, editMode)` (lines 38-85), which explicitly handles
  `text`/`number`/`boolean` in both interact- and edit-mode, and falls
  through to image-widget markup for anything else (lines 73-84,
  43-46) — the fallthrough that a new type must not hit.
- `TEXT_TYPES` (`dynamic-fields.js:18`) is the array of type-select
  `<option>`s in `buildEditRow` — despite the name, it already lists all
  four existing types (`image` included), so it's a misnomer today.
- `readValueControl` (lines 188-194) and the `change` listener's value
  coercion (line 344) both key off `control.type === 'checkbox'` /
  `'number'`, else read `.value` directly — a `<textarea>`'s native `.type`
  is `'textarea'`, so both already fall through to the correct generic
  string-read branch with no change needed.

## Design

### Schema & default value

`ManualFieldSchema.type` becomes
`z.enum(['text', 'number', 'boolean', 'image', 'multiline'])`.
`defaultValueForType()` gets an explicit `case 'multiline': return '';` —
behaviorally identical to today's `default` branch, made explicit since
every other type now has its own case.

### SSR macro (`macros.njk`)

New branch in `_dynamicFieldRow`, styled like the existing `text`/`number`
inputs plus vertical resizing:

```njk
{% elif field.type == 'multiline' %}
  <textarea rows="4" class="w-full rounded-md border border-steel-300 dark:border-steel-700 bg-transparent px-2.5 py-1.5 text-[13px] resize-y" data-field-value>{{ field.value }}</textarea>
```

This closes the gap where an unhandled type renders an empty slot on
first paint.

### Client JS (`dynamic-fields.js`)

- `TEXT_TYPES` renamed to `FIELD_TYPES` (it already drives all five type
  options, not just text-like ones — the old name was already a misnomer)
  and gains `'multiline'`.
- `buildValueSlot()` gets a `multiline` branch in both halves, ahead of
  the image fallthrough:
  - Interact mode: same textarea markup as the SSR macro above.
  - Edit mode: same dashed-border editing style used by `text`/`number`'s
    edit-mode inputs, as a `<textarea data-field-edit-value>`.
- No other function changes — `readValueControl`, the `change` listener,
  and `commitEdit`'s value coercion already handle a `<textarea>` correctly
  via their generic non-checkbox/non-number branch.

Multiline fields behave exactly like `text` fields otherwise: directly
editable in Interact mode (type, blur → `change` listener →
`PATCH {endpoint}/:id`), same "⋯ → Edit" flow for renaming the key or
changing type (which resets the value to `''` per the existing
type-change behavior).

## Explicitly out of scope

- Any character/length limit or validation beyond what `text` fields
  already have (none).
- A read-only/auto-grow textarea variant — fixed 4 rows, user-resizable
  via native `resize-y`, matching plain `<textarea>` behavior.
- Markdown rendering, syntax highlighting, or any other rich-text
  treatment of the value — it's stored and round-tripped as a plain
  string, same as `text`.

## Testing

- Schema test (`manual-workflow.service.test.ts`): `ManualFieldSchema`
  accepts `type: 'multiline'`.
- Controller tests (`manual-controller.test.ts`): create a `multiline`
  field (defaults to `''`), update its value with embedded newlines and
  confirm it round-trips unchanged.
- Manual verification via the `run` skill: add a multiline field, type
  multi-line text, confirm it autosaves on blur and survives a page
  reload; resize the textarea; switch its type away and back and confirm
  the value resets to `''` per existing type-change behavior.
