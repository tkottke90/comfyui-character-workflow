/* global document, window, fetch, confirm */
(function () {
  'use strict';

  function request(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error('Request failed');
      return res.json();
    });
  }

  document.querySelectorAll('[data-select-mode-root]').forEach(function (root) {
    var endpoint = root.getAttribute('data-images-endpoint');
    var toggle = document.querySelector('[data-select-toggle]');
    var cancel = document.querySelector('[data-select-cancel]');
    var selectAll = document.querySelector('[data-select-all]');
    var bar = document.querySelector('[data-select-bar]');
    if (!toggle || !cancel || !selectAll || !bar) return;
    var countEl = bar.querySelector('[data-select-count]');
    var selected = new Set();

    function tiles() {
      return Array.prototype.slice.call(root.querySelectorAll('[data-image-tile]'));
    }

    function render() {
      bar.classList.toggle('hidden', selected.size === 0);
      countEl.textContent = selected.size + ' selected';
      selectAll.textContent = selected.size > 0 && selected.size === tiles().length ? 'Deselect all' : 'Select all';
    }

    function setSelected(tile, on) {
      var id = tile.getAttribute('data-image-id');
      var box = tile.querySelector('[data-select-checkbox]');
      if (on) selected.add(id); else selected.delete(id);
      if (box) box.checked = on;
      render();
    }

    function enterMode() {
      root.setAttribute('data-select-mode', '');
      toggle.classList.add('hidden');
      cancel.classList.remove('hidden');
      selectAll.classList.remove('hidden');
      render();
    }

    function exitMode() {
      root.removeAttribute('data-select-mode');
      selected.clear();
      tiles().forEach(function (tile) {
        var box = tile.querySelector('[data-select-checkbox]');
        if (box) box.checked = false;
      });
      toggle.classList.remove('hidden');
      cancel.classList.add('hidden');
      selectAll.classList.add('hidden');
      bar.classList.add('hidden');
    }

    toggle.addEventListener('click', enterMode);
    cancel.addEventListener('click', exitMode);
    selectAll.addEventListener('click', function () {
      var all = tiles();
      var makeSelected = selected.size !== all.length;
      all.forEach(function (tile) { setSelected(tile, makeSelected); });
    });

    // Capture on `window`, not `document`: must run before image-viewer.js's
    // own document-level capture listener (capture propagates outermost-first)
    // so the preview dialog never opens while selecting. Canceling the click
    // here also suppresses the checkbox's native checked-state toggle for both
    // mouse and keyboard/Space activation, so no separate `change` listener is
    // needed — setSelected() is the single source of truth for `box.checked`.
    window.addEventListener('click', function (event) {
      if (!root.hasAttribute('data-select-mode')) return;
      var tile = event.target.closest('[data-image-tile]');
      if (!tile || !root.contains(tile)) return;
      event.stopPropagation();
      event.preventDefault();
      setSelected(tile, !selected.has(tile.getAttribute('data-image-id')));
    }, true);

    bar.addEventListener('click', function (event) {
      var button = event.target.closest('[data-bulk-action]');
      if (!button) return;
      var action = button.getAttribute('data-bulk-action');
      var ids = Array.from(selected);
      if (ids.length === 0) return;

      if (action === 'delete') {
        if (!confirm('Delete ' + ids.length + ' image' + (ids.length === 1 ? '' : 's') + '? This cannot be undone.')) return;
        request('POST', endpoint + '/bulk-action/delete', { imageIds: ids })
          .then(function (result) {
            result.deleted.forEach(function (id) {
              var tile = root.querySelector('[data-image-tile][data-image-id="' + id + '"]');
              if (tile) tile.remove();
            });
            var imageCountEl = document.querySelector('[data-image-count]');
            if (imageCountEl) {
              var remaining = tiles().length;
              imageCountEl.textContent = remaining + (remaining === 1 ? ' image' : ' images');
            }
            var message = result.deleted.length + ' deleted';
            if (result.skippedLocked.length > 0) message += ', ' + result.skippedLocked.length + ' skipped (locked)';
            if (window.toast) window.toast.show(message, { type: 'info' });
            exitMode();
          })
          .catch(function () {
            if (window.toast) window.toast.show('Failed to delete images.', { type: 'error' });
          });
        return;
      }

      var body = { imageIds: ids };
      if (action === 'lock') body.locked = true;
      if (action === 'unlock') body.locked = false;
      if (action === 'nsfw') body.nsfw = true;

      request('PATCH', endpoint + '/bulk-action/edit', body)
        .then(function (result) {
          result.images.forEach(function (image) {
            var tile = root.querySelector('[data-image-tile][data-image-id="' + image.id + '"]');
            if (!tile) return;

            tile.toggleAttribute('data-locked', image.locked);
            var nsfwTarget = tile.querySelector('[data-nsfw-target]');
            if (nsfwTarget) nsfwTarget.toggleAttribute('data-nsfw-enabled', image.nsfw);

            var lockBtn = tile.querySelector('[data-lock-toggle]');
            if (lockBtn) lockBtn.textContent = image.locked ? 'Unlock' : 'Lock';
            var nsfwBtn = tile.querySelector('[data-nsfw-toggle]');
            if (nsfwBtn) nsfwBtn.textContent = image.nsfw ? 'Unset NSFW' : 'Set NSFW';
          });
          if (window.toast) window.toast.show('Updated ' + result.images.length + ' image' + (result.images.length === 1 ? '' : 's') + '.', { type: 'success' });
          exitMode();
        })
        .catch(function () {
          if (window.toast) window.toast.show('Failed to update images.', { type: 'error' });
        });
    });
  });
})();
