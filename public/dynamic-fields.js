/* global document, fetch, CustomEvent */
(function () {
  'use strict';

  // Generic add/edit/delete key-type-value field form, reusable by any page
  // that renders it via the `ui.dynamicFieldForm()` macro (macros.njk) and
  // implements matching `POST {endpoint}`, `PATCH {endpoint}/:id`,
  // `DELETE {endpoint}/:id` routes, each accepting/returning
  // `{id, key, type, value}` JSON. This module has no concept of what a
  // "field" is used for — that's entirely up to the consuming page.
  //
  // Image-type fields are a special case: this module can't render a
  // thumbnail (it doesn't know the domain's image URL scheme), so it
  // renders a minimal placeholder and dispatches `dynamic-field:image-edit`
  // (on click) / `dynamic-field:image-render` (whenever a value-slot is
  // (re)built) for a page-specific listener to handle.

  var TEXT_TYPES = ['text', 'number', 'boolean', 'image'];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nextDefaultKey(root) {
    var max = 0;
    var rows = root.querySelectorAll('[data-field-row]');
    Array.prototype.forEach.call(rows, function (row) {
      var match = /^field_(\d+)$/.exec(row.getAttribute('data-field-key') || '');
      if (match) max = Math.max(max, parseInt(match[1], 10));
    });
    return 'field_' + (max + 1);
  }

  function buildValueSlot(field, editMode) {
    if (editMode) {
      if (field.type === 'boolean') {
        return '<input type="checkbox" ' + (field.value ? 'checked' : '') + ' data-field-edit-value />';
      }
      if (field.type === 'image') {
        // Image values aren't edited inline here — they're set via the
        // "Change" trigger in Interact mode (dynamic-field:image-edit).
        return '<p class="text-[12px] text-steel-400">Image value is set from Interact mode via "Change".</p>';
      }
      return (
        '<input type="' +
        (field.type === 'number' ? 'number' : 'text') +
        '" class="w-full rounded-md border border-dashed border-steel-400 dark:border-steel-600 px-2.5 py-1.5 text-[13px]" value="' +
        escapeHtml(field.value) +
        '" data-field-edit-value />'
      );
    }
    if (field.type === 'text') {
      return (
        '<input type="text" class="w-full rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[13px]" value="' +
        escapeHtml(field.value) +
        '" data-field-value />'
      );
    }
    if (field.type === 'number') {
      return (
        '<input type="number" class="w-full rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[13px]" value="' +
        escapeHtml(field.value) +
        '" data-field-value />'
      );
    }
    if (field.type === 'boolean') {
      return '<input type="checkbox" ' + (field.value ? 'checked' : '') + ' data-field-value />';
    }
    // image (and any unrecognized future type): generic placeholder only —
    // a page-specific listener paints the real thumbnail via
    // dynamic-field:image-render, and keeps data-field-image-id in sync so
    // this module can later read the current value back off the DOM.
    return (
      '<div class="flex items-center gap-3" data-field-image-value data-field-image-id="' +
      escapeHtml(field.value || '') +
      '">' +
      '<div class="w-16 h-16 rounded-md overflow-hidden bg-steel-100 dark:bg-steel-800 flex-shrink-0" data-field-image-thumb-wrap></div>' +
      '<button type="button" class="text-[13px] font-semibold text-apple-700 dark:text-apple-300" data-field-image-trigger>Change</button>' +
      '</div>'
    );
  }

  function buildInteractRow(field) {
    return (
      '<div class="mb-3" data-field-row data-field-id="' +
      escapeHtml(field.id) +
      '" data-field-key="' +
      escapeHtml(field.key) +
      '" data-field-type="' +
      escapeHtml(field.type) +
      '">' +
      '<div class="flex items-center justify-between mb-1">' +
      '<label class="text-[13px] font-semibold text-steel-600 dark:text-steel-300">' +
      escapeHtml(field.key) +
      '</label>' +
      '<div class="relative" data-field-menu>' +
      '<button type="button" class="text-steel-400 hover:text-steel-600 text-[13px] px-1" data-field-menu-trigger>⋯</button>' +
      '<div class="hidden absolute right-0 mt-1 bg-white dark:bg-steel-800 border border-steel-200 dark:border-steel-700 rounded-md shadow-sm text-[12.5px] z-10" data-field-menu-panel>' +
      '<button type="button" class="block w-full text-left px-3 py-1.5 hover:bg-steel-50 dark:hover:bg-steel-700" data-field-edit>Edit</button>' +
      '<button type="button" class="block w-full text-left px-3 py-1.5 text-rose-700 dark:text-rose-300 hover:bg-steel-50 dark:hover:bg-steel-700" data-field-delete>Delete</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div data-field-value-slot>' +
      buildValueSlot(field, false) +
      '</div>' +
      '</div>'
    );
  }

  function buildEditRow(field) {
    var typeOptions = TEXT_TYPES.map(function (type) {
      return '<option value="' + type + '"' + (type === field.type ? ' selected' : '') + '>' + type + '</option>';
    }).join('');

    return (
      '<div class="mb-3" data-field-row data-field-id="' +
      escapeHtml(field.id) +
      '" data-field-key="' +
      escapeHtml(field.key) +
      '" data-field-type="' +
      escapeHtml(field.type) +
      '" data-field-editing>' +
      '<div class="border-2 border-dashed border-steel-400 dark:border-steel-600 rounded-lg p-2.5" data-field-edit-form>' +
      '<div class="flex gap-2 mb-2">' +
      '<input type="text" class="flex-1 rounded-md border border-dashed border-steel-400 dark:border-steel-600 px-2.5 py-1.5 text-[13px]" value="' +
      escapeHtml(field.key) +
      '" placeholder="key" data-field-edit-key />' +
      '<select class="rounded-md border border-dashed border-steel-400 dark:border-steel-600 px-2.5 py-1.5 text-[13px]" data-field-edit-type>' +
      typeOptions +
      '</select>' +
      '</div>' +
      buildValueSlot(field, true) +
      '<div class="text-[12px] text-rose-700 dark:text-rose-300 mt-1 hidden" data-field-edit-error></div>' +
      '<div class="flex justify-between items-center mt-2">' +
      '<button type="button" class="text-[12.5px] text-rose-700 dark:text-rose-300" data-field-remove>Delete</button>' +
      '<button type="button" class="text-[12.5px] font-semibold text-apple-700 dark:text-apple-300" data-field-done>✓ Done</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function dispatchImageRender(row, field) {
    var container = row.querySelector('[data-field-image-value], [data-field-edit-value]');
    row.dispatchEvent(
      new CustomEvent('dynamic-field:image-render', {
        bubbles: true,
        detail: { fieldId: field.id, value: field.value, container: container || row },
      }),
    );
  }

  function replaceRow(row, field, editMode) {
    var html = editMode ? buildEditRow(field) : buildInteractRow(field);
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    var newRow = wrapper.firstElementChild;
    row.replaceWith(newRow);
    // Edit-mode image rows show a static note, not a thumbnail (see
    // buildValueSlot) — only Interact-mode rows have anywhere to paint one.
    if (!editMode && field.type === 'image') dispatchImageRender(newRow, field);
    return newRow;
  }

  function request(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || 'Request failed');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function readValueControl(row) {
    var control = row.querySelector('[data-field-value]');
    if (!control) return undefined;
    if (control.type === 'checkbox') return control.checked;
    if (control.type === 'number') return Number(control.value);
    return control.value;
  }

  document.querySelectorAll('[data-dynamic-field-form]').forEach(function (root) {
    var endpoint = root.getAttribute('data-fields-endpoint');
    if (!endpoint) return;
    var list = root.querySelector('[data-fields-list]');
    var addBtn = root.querySelector('[data-add-field]');
    if (!list || !addBtn) return;

    function commitEdit(row) {
      var fieldId = row.getAttribute('data-field-id');
      var key = row.querySelector('[data-field-edit-key]').value.trim();
      var type = row.querySelector('[data-field-edit-type]').value;
      var body = { key: key, type: type };

      // Image values are only ever set via the dynamic-field:image-edit flow
      // (resolve() below), never typed directly — so `value` is deliberately
      // omitted here when type is 'image'. The server preserves the
      // existing value when type is unchanged, and resets it to the type's
      // default only when type actually changed (including into 'image'),
      // so omitting it can never accidentally wipe an already-set image.
      if (type !== 'image') {
        var valueControl = row.querySelector('[data-field-edit-value], [data-field-value]');
        if (type === 'boolean') body.value = valueControl && valueControl.type === 'checkbox' ? valueControl.checked : false;
        else if (type === 'number') body.value = valueControl ? Number(valueControl.value) : 0;
        else body.value = valueControl ? valueControl.value : '';
      }

      var errorEl = row.querySelector('[data-field-edit-error]');
      if (errorEl) errorEl.classList.add('hidden');

      request('PATCH', endpoint + '/' + fieldId, body)
        .then(function (field) {
          replaceRow(row, field, false);
        })
        .catch(function (err) {
          if (errorEl) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
          }
        });
    }

    addBtn.addEventListener('click', function () {
      var key = nextDefaultKey(root);
      request('POST', endpoint, { key: key, type: 'text' }).then(function (field) {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = buildEditRow(field).trim();
        var row = wrapper.firstElementChild;
        list.appendChild(row);
        var keyInput = row.querySelector('[data-field-edit-key]');
        if (keyInput) keyInput.focus();
      });
    });

    root.addEventListener('click', function (event) {
      var menuTrigger = event.target.closest('[data-field-menu-trigger]');
      if (menuTrigger) {
        var panel = menuTrigger.parentElement.querySelector('[data-field-menu-panel]');
        var wasHidden = panel.classList.contains('hidden');
        root.querySelectorAll('[data-field-menu-panel]').forEach(function (p) {
          p.classList.add('hidden');
        });
        if (wasHidden) panel.classList.remove('hidden');
        return;
      }

      var editTrigger = event.target.closest('[data-field-edit]');
      if (editTrigger) {
        var row = editTrigger.closest('[data-field-row]');
        var field = {
          id: row.getAttribute('data-field-id'),
          key: row.getAttribute('data-field-key'),
          type: row.getAttribute('data-field-type'),
          value: readValueControl(row),
        };
        replaceRow(row, field, true);
        return;
      }

      var deleteTrigger = event.target.closest('[data-field-delete], [data-field-remove]');
      if (deleteTrigger) {
        var deleteRow = deleteTrigger.closest('[data-field-row]');
        var fieldId = deleteRow.getAttribute('data-field-id');
        // Deleting is idempotent from the UI's perspective: a 404 (e.g. a
        // redundant/racing delete on a row that's already gone server-side)
        // should still remove the row rather than leaving a dangling
        // unhandled rejection — there's nothing a user could usefully retry.
        request('DELETE', endpoint + '/' + fieldId)
          .then(function () {
            deleteRow.remove();
          })
          .catch(function () {
            deleteRow.remove();
          });
        return;
      }

      var doneTrigger = event.target.closest('[data-field-done]');
      if (doneTrigger) {
        commitEdit(doneTrigger.closest('[data-field-row]'));
        return;
      }

      var imageTrigger = event.target.closest('[data-field-image-trigger]');
      if (imageTrigger) {
        var imageRow = imageTrigger.closest('[data-field-row]');
        var imageContainer = imageTrigger.closest('[data-field-image-value]');
        var imageFieldId = imageRow.getAttribute('data-field-id');
        var currentImageId = imageContainer ? imageContainer.getAttribute('data-field-image-id') : '';

        imageRow.dispatchEvent(
          new CustomEvent('dynamic-field:image-edit', {
            bubbles: true,
            detail: {
              fieldId: imageFieldId,
              currentValue: currentImageId || null,
              resolve: function (imageId) {
                request('PATCH', endpoint + '/' + imageFieldId, { value: imageId }).then(function (field) {
                  dispatchImageRender(imageRow, field);
                });
              },
            },
          }),
        );
      }
    });

    document.addEventListener('click', function (event) {
      if (!root.contains(event.target)) {
        root.querySelectorAll('[data-field-menu-panel]').forEach(function (p) {
          p.classList.add('hidden');
        });
      }
    });

    root.addEventListener(
      'focusout',
      function (event) {
        var editingRow = event.target.closest('[data-field-editing]');
        if (!editingRow) return;
        // If focus is moving to another element still inside this same row,
        // it's not actually leaving edit mode.
        var next = event.relatedTarget;
        if (next && editingRow.contains(next)) return;
        commitEdit(editingRow);
      },
      true,
    );

    root.addEventListener('change', function (event) {
      var control = event.target.closest('[data-field-value]');
      if (!control) return;
      var row = control.closest('[data-field-row]');
      if (!row || row.hasAttribute('data-field-editing')) return;
      var fieldId = row.getAttribute('data-field-id');
      var value = control.type === 'checkbox' ? control.checked : control.type === 'number' ? Number(control.value) : control.value;
      request('PATCH', endpoint + '/' + fieldId, { value: value });
    });

    // Server-rendered image-type rows already have their thumbnail painted
    // by the SSR partial (which has access to the real image lookup) — no
    // dynamic-field:image-render is needed for those. The event is only
    // dispatched for rows this module itself builds (see replaceRow),
    // since only those use the generic, image-agnostic placeholder markup.
  });
})();
