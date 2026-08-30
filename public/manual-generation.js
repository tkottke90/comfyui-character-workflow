/* global document, fetch, FileReader */
(function () {
  'use strict';

  // Manual-workspace-specific glue for the generic dynamic-fields.js module:
  // answers its `dynamic-field:image-edit` (user clicked "Change" on an
  // image-type field) and `dynamic-field:image-render` (a value-slot was
  // (re)built and needs its thumbnail painted) events. dynamic-fields.js
  // deliberately knows nothing about manual sessions, image storage, or the
  // `/manual/:id/assets/:filename` URL scheme — all of that lives here.

  function sessionContext(target) {
    var scope = target.closest('[data-session-id]');
    if (!scope) return null;
    var images = [];
    try {
      images = JSON.parse(scope.getAttribute('data-session-images') || '[]');
    } catch {
      images = [];
    }
    return { id: scope.getAttribute('data-session-id'), images: images };
  }

  function findImage(images, imageId) {
    for (var i = 0; i < images.length; i++) {
      if (images[i].id === imageId) return images[i];
    }
    return null;
  }

  function paintThumbnail(container, sessionId, images, imageId) {
    container.setAttribute('data-field-image-id', imageId || '');
    var wrap = container.querySelector('[data-field-image-thumb-wrap]');
    if (!wrap) return;
    var image = imageId ? findImage(images, imageId) : null;
    if (image) {
      wrap.innerHTML = '<img src="/manual/' + sessionId + '/assets/' + image.filename + '" class="w-full h-full object-cover" alt="" />';
    } else {
      wrap.innerHTML = '<div class="w-full h-full flex items-center justify-center text-steel-400 text-[11px]">No image</div>';
    }
  }

  document.addEventListener('dynamic-field:image-render', function (event) {
    var ctx = sessionContext(event.target);
    if (!ctx) return;
    paintThumbnail(event.detail.container, ctx.id, ctx.images, event.detail.value);
  });

  function buildPanel(sessionId, images, currentValue) {
    var options = images
      .map(function (image) {
        return '<option value="' + image.id + '"' + (image.id === currentValue ? ' selected' : '') + '>' + image.filename + '</option>';
      })
      .join('');

    var panel = document.createElement('div');
    panel.className = 'mt-2 p-2.5 border border-steel-300 dark:border-steel-700 rounded-md';
    panel.innerHTML =
      '<div class="flex gap-4 mb-2 text-[12.5px] font-semibold">' +
      '<label class="flex items-center gap-1.5"><input type="radio" name="mode" value="upload" checked /> Upload</label>' +
      '<label class="flex items-center gap-1.5"><input type="radio" name="mode" value="select" ' +
      (images.length ? '' : 'disabled') +
      ' /> Select existing</label>' +
      '</div>' +
      '<div data-panel-mode="upload" class="mb-2">' +
      '<input type="file" accept="image/png,image/jpeg,image/webp" data-panel-file />' +
      '</div>' +
      '<div data-panel-mode="select" class="mb-2 hidden">' +
      (images.length
        ? '<select class="w-full rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[12.5px]" data-panel-select>' +
          options +
          '</select>'
        : '<p class="text-[12px] text-steel-400">No images in this session yet.</p>') +
      '</div>' +
      '<div class="text-[12px] text-rose-700 dark:text-rose-300 mb-2 hidden" data-panel-error></div>' +
      '<div class="flex justify-end gap-3">' +
      '<button type="button" class="text-[12.5px] text-steel-500" data-panel-cancel>Cancel</button>' +
      '<button type="button" class="text-[12.5px] font-semibold text-apple-700 dark:text-apple-300" data-panel-set>Set</button>' +
      '</div>';

    var radios = panel.querySelectorAll('input[name="mode"]');
    var modePanels = panel.querySelectorAll('[data-panel-mode]');
    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        modePanels.forEach(function (p) {
          p.classList.toggle('hidden', p.getAttribute('data-panel-mode') !== radio.value);
        });
      });
    });

    return panel;
  }

  document.addEventListener('dynamic-field:image-edit', function (event) {
    var ctx = sessionContext(event.target);
    if (!ctx) return;

    var row = event.target.closest('[data-field-row]');
    if (!row) return;

    var existingPanel = row.querySelector('[data-field-image-panel]');
    if (existingPanel) {
      existingPanel.remove();
      return; // clicking "Change" again toggles the panel closed
    }

    var panel = buildPanel(ctx.id, ctx.images, event.detail.currentValue);
    panel.setAttribute('data-field-image-panel', '');
    row.appendChild(panel);

    var errorEl = panel.querySelector('[data-panel-error]');
    var showError = function (message) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    };

    panel.querySelector('[data-panel-cancel]').addEventListener('click', function () {
      panel.remove();
    });

    panel.querySelector('[data-panel-set]').addEventListener('click', function () {
      var mode = panel.querySelector('input[name="mode"]:checked').value;

      if (mode === 'select') {
        var select = panel.querySelector('[data-panel-select]');
        if (!select || !select.value) {
          showError('Choose an image.');
          return;
        }
        event.detail.resolve(select.value);
        panel.remove();
        return;
      }

      var fileInput = panel.querySelector('[data-panel-file]');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        showError('Choose a file to upload.');
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        fetch('/api/v1/manual/' + ctx.id + '/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ imageDataUrl: String(reader.result || '') }),
        })
          .then(function (res) {
            return res.json().then(function (data) {
              if (!res.ok) throw new Error((data && data.error) || 'Upload failed');
              return data;
            });
          })
          .then(function (image) {
            event.detail.resolve(image.id);
            panel.remove();
          })
          .catch(function (err) {
            showError(err.message);
          });
      };
      reader.readAsDataURL(file);
    });
  });
})();
