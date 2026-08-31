# Manual Workspace — Dynamic Field Reordering — Design

## Problem

The manual workspace dynamic-fields system (`ui.dynamicFieldForm()` macro +
`public/dynamic-fields.js`) renders fields in `session.fields` array order,
but there's no way to change that order once a field is created — new
fields are always appended at the end. Users want to reorder fields (e.g.
put a prompt field above sampler settings) without a drag-and-drop
implementation.

## Current implementation

- `session.fields` (`ManualFieldSchema[]`) — array order is display order.
  Nothing else references a field by position: generations key
  `fieldValuesSnapshot` by field `key`, not index
  (`src/services/manual-workflow.service.ts:37-45`).
- `POST /:id/fields` appends to the end of the array
  (`src/controllers/v1/manual.ts`, `manualRouter.post('/:id/fields', ...)`).
  `PATCH .../fields/:fieldId` and `DELETE .../fields/:fieldId` both
  preserve relative order of the remaining fields.
- Each field row's "⋯" menu (`data-field-menu-panel`) currently has two
  actions, Edit and Delete — rendered identically in the SSR macro
  (`_dynamicFieldRow` in `src/templates/macros.njk:159-183`) and in the
  client-rebuilt row (`buildInteractRow` in `public/dynamic-fields.js`).
- `dynamic-fields.js` is deliberately domain-agnostic — reusable by any
  page via `data-fields-endpoint` — and already re-renders from server
  responses after mutating requests (`commitEdit` → `replaceRow`, delete →
  `row.remove()`), rather than trusting client-predicted state.

## Design

### Backend: move endpoint

New route in `src/controllers/v1/manual.ts`, alongside the existing field
CRUD routes:

```ts
manualRouter.post('/:id/fields/:fieldId/move', async (req: Request, res: Response) => {
  const session = await app.manualWorkflows.getSession(req.params.id.toString());
  const direction = String(req.body.direction ?? '');
  if (direction !== 'up' && direction !== 'down') {
    throw new BadRequestError('direction must be "up" or "down"');
  }

  const index = session.fields.findIndex((f) => f.id === req.params.fieldId);
  if (index === -1) throw new NotFoundError('Field not found');

  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= session.fields.length) {
    res.status(200).json({ moved: false });
    return;
  }

  const fields = [...session.fields];
  [fields[index], fields[swapIndex]] = [fields[swapIndex], fields[index]];
  await app.manualWorkflows.updateSession(session.id, { fields });

  res.status(200).json({ moved: true });
});
```

A move at a boundary (moving the first field up, or the last field down)
is an idempotent no-op (`{ moved: false }`, 200) rather than an error —
consistent with this codebase's existing idempotent-delete convention, and
defensive against a client whose disabled-button state is momentarily
stale (see below).

### Frontend: menu buttons

Both `_dynamicFieldRow` (`macros.njk`) and `buildInteractRow`
(`dynamic-fields.js`) get two new buttons in the "⋯" panel, above the
existing Edit/Delete:

```html
<button type="button" class="block w-full text-left px-3 py-1.5 hover:bg-steel-50 dark:hover:bg-steel-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" data-field-move-up>Move Up</button>
<button type="button" class="block w-full text-left px-3 py-1.5 hover:bg-steel-50 dark:hover:bg-steel-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" data-field-move-down>Move Down</button>
```

Plain native `disabled` buttons — a disabled button doesn't fire `click`,
so no extra guard is needed in the delegated click handler. Both buttons
are always rendered (in both the SSR macro and the JS builder); their
`disabled` state is not baked into either render path.

### Frontend: boundary state — `updateMoveButtons(list)`

Rather than threading "is this the first/last field" through every
row-building call site (SSR loop context, `buildInteractRow`,
`replaceRow`), one small sweep function in `dynamic-fields.js`:

```js
function updateMoveButtons(list) {
  var rows = list.querySelectorAll('[data-field-row]');
  Array.prototype.forEach.call(rows, function (row, i) {
    var upBtn = row.querySelector('[data-field-move-up]');
    var downBtn = row.querySelector('[data-field-move-down]');
    if (upBtn) upBtn.disabled = i === 0;
    if (downBtn) downBtn.disabled = i === rows.length - 1;
  });
}
```

Called once per form root right after its existing setup block (correcting
the SSR-rendered "always enabled" default before the user can plausibly
interact — the module's script tag already runs after the DOM section it
operates on, so this happens synchronously with no visible flash), and
again after anything that changes row count or order: the existing
add-field success handler, the existing delete success/catch handlers, and
the new move handler below.

### Frontend: move click handler

Added to the existing delegated click listener in the per-root setup
block, alongside the menu/edit/delete/image handlers:

```js
var moveTrigger = event.target.closest('[data-field-move-up], [data-field-move-down]');
if (moveTrigger) {
  var moveRow = moveTrigger.closest('[data-field-row]');
  var moveFieldId = moveRow.getAttribute('data-field-id');
  var direction = moveTrigger.hasAttribute('data-field-move-up') ? 'up' : 'down';
  var panel = moveTrigger.closest('[data-field-menu-panel]');
  if (panel) panel.classList.add('hidden');

  request('POST', endpoint + '/' + moveFieldId + '/move', { direction: direction }).then(function (result) {
    if (!result || !result.moved) return;
    var sibling = direction === 'up' ? moveRow.previousElementSibling : moveRow.nextElementSibling;
    if (!sibling) return;
    if (direction === 'up') list.insertBefore(moveRow, sibling);
    else list.insertBefore(sibling, moveRow);
    updateMoveButtons(list);
  });
  return;
}
```

Only the two swapped rows' DOM positions change — their content is
untouched, so there's no need to re-render either row from the response
(and no risk of clobbering an unrelated row that happens to be mid-edit,
unlike a full-list rebuild would risk). The panel is hidden immediately on
click, matching how Edit/Delete effectively close it (by replacing/removing
the row it lives in).

## Explicitly out of scope

- Drag-and-drop reordering — this is the explicitly-requested alternative
  to it.
- An arbitrary-position "move to index N" or full-array reorder endpoint —
  adjacent-swap covers the two-button UI this spec adds; nothing else
  calls the move endpoint.
- Reordering feedback beyond the immediate DOM swap (e.g. a toast or
  animation) — matches the app's existing plain-DOM-patch style for this
  module.

## Testing

- Controller tests (`manual-controller.test.ts`, alongside the existing
  field CRUD tests): move-up swaps two fields; move-down swaps two fields;
  move-up on the first field returns `{ moved: false }` with the array
  unchanged; move-down on the last field likewise; unknown `fieldId` →
  404; invalid `direction` → 400.
- Manual verification via the `run` skill: create three fields, move the
  middle one up, confirm the new order in the UI and that it persists
  across a page reload; confirm Move Up is disabled on the first field and
  Move Down is disabled on the last.
