/* global document, FileReader */
(function () {
  'use strict';

  // ---- Sidebar drawer (below lg): hamburger button opens, X inside the sidebar or the
  // backdrop closes it ----
  var sidebar = document.getElementById('sidebar');
  var sidebarToggle = document.getElementById('sidebar-toggle');
  var sidebarClose = document.getElementById('sidebar-close');
  var sidebarBackdrop = document.getElementById('sidebar-backdrop');
  if (sidebar && sidebarToggle && sidebarClose && sidebarBackdrop) {
    var mainEl = document.querySelector('main');
    var setSidebarOpen = function (open) {
      sidebar.classList.toggle('-translate-x-full', !open);
      sidebarBackdrop.classList.toggle('hidden', !open);
      sidebarToggle.classList.toggle('hidden', open);
      sidebarToggle.setAttribute('aria-expanded', String(open));
      if (mainEl) mainEl.style.overflow = open ? 'hidden' : '';
    };
    sidebarToggle.addEventListener('click', function () {
      setSidebarOpen(true);
    });
    sidebarClose.addEventListener('click', function () {
      setSidebarOpen(false);
    });
    sidebarBackdrop.addEventListener('click', function () {
      setSidebarOpen(false);
    });
  }

  // ---- Live range readouts (denoise sliders etc.) ----
  document.querySelectorAll('[data-range-output]').forEach(function (input) {
    var output = document.querySelector(input.getAttribute('data-range-output'));
    if (!output) return;
    var render = function () {
      output.textContent = Number(input.value).toFixed(2);
    };
    input.addEventListener('input', render);
    render();
  });

  // ---- Spec Builder: live identity-block preview ----
  var previewEl = document.querySelector('[data-identity-preview]');
  if (previewEl) {
    var form = previewEl.closest('form') || document;
    var fields = form.querySelectorAll('[data-spec-field]');

    var genderNoun = function (sex) {
      var value = (sex || '').trim().toLowerCase();
      if (value === 'male') return 'man';
      if (value === 'female') return 'woman';
      return value || 'person';
    };

    var recompute = function () {
      var get = function (name) {
        var el = form.querySelector('[data-spec-field="' + name + '"]');
        return el ? el.value.trim() : '';
      };

      var name = document.querySelector('[data-character-name]');
      var nameValue = name ? name.getAttribute('data-character-name') : '';
      var useToken = form.querySelector('[data-use-name-token]');
      var namedPart = useToken && useToken.checked && nameValue ? ' named ' + nameValue : '';

      var subject =
        'photo of a ' +
        [get('ethnicity'), genderNoun(get('sex'))].filter(Boolean).join(' ') +
        namedPart;

      var parts = [
        get('apparent_age'),
        get('skin_tone'),
        get('face_shape'),
        get('eyes') ? get('eyes') + ' eyes' : '',
        get('eyebrows') ? get('eyebrows') + ' eyebrows' : '',
        get('hair'),
        get('nose'),
        get('lips') ? get('lips') + ' lips' : '',
        get('build'),
        get('height_impression') ? get('height_impression') + ' height' : '',
        get('base_clothing'),
      ].filter(function (part) {
        return part && part.length > 0;
      });

      previewEl.textContent = [subject].concat(parts).join(', ').toLowerCase();
    };

    fields.forEach(function (field) {
      field.addEventListener('input', recompute);
      field.addEventListener('change', recompute);
    });
    var tokenToggle = form.querySelector('[data-use-name-token]');
    if (tokenToggle) tokenToggle.addEventListener('change', recompute);
    recompute();
  }

  // ---- Spec Builder: attribute autocomplete + clear button ----
  document.querySelectorAll('[data-autocomplete]').forEach(function (wrapper) {
    var input = wrapper.querySelector('input');
    var list = wrapper.querySelector('[data-autocomplete-list]');
    var clearBtn = wrapper.querySelector('[data-autocomplete-clear]');
    if (!input || !list) return;

    var suggestions = [];
    try {
      suggestions = JSON.parse(wrapper.getAttribute('data-suggestions') || '[]');
    } catch (err) {
      suggestions = [];
    }

    var MAX_RESULTS = 20;

    var closeList = function () {
      list.classList.add('hidden');
      list.innerHTML = '';
    };

    var updateClearButton = function () {
      if (!clearBtn) return;
      clearBtn.classList.toggle('hidden', input.value.length === 0);
    };

    var renderList = function () {
      var query = input.value.trim().toLowerCase();
      var matches = suggestions.filter(function (value) {
        return value.toLowerCase().indexOf(query) !== -1;
      });

      if (matches.length === 0) {
        closeList();
        return;
      }

      list.innerHTML = '';
      matches.slice(0, MAX_RESULTS).forEach(function (value) {
        var item = document.createElement('li');
        item.textContent = value;
        item.setAttribute('data-autocomplete-option', '');
        item.className =
          'px-3 py-1.5 cursor-pointer hover:bg-steel-100 dark:hover:bg-steel-700 text-[#222] dark:text-[#efefef]';
        item.addEventListener('mousedown', function (event) {
          event.preventDefault();
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          closeList();
          updateClearButton();
        });
        list.appendChild(item);
      });
      list.classList.remove('hidden');
    };

    input.addEventListener('input', function () {
      renderList();
      updateClearButton();
    });
    input.addEventListener('focus', renderList);
    input.addEventListener('blur', closeList);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeList();
    });

    if (clearBtn) {
      clearBtn.addEventListener('mousedown', function (event) {
        event.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        closeList();
        updateClearButton();
      });
    }

    updateClearButton();
  });

  // ---- File -> base64 data URL upload (no server-side multipart parser) ----
  document.querySelectorAll('[data-file-upload]').forEach(function (wrapper) {
    var input = wrapper.querySelector('input[type="file"]');
    var hidden = wrapper.querySelector('input[type="hidden"]');
    var preview = wrapper.querySelector('[data-file-preview]');
    var label = wrapper.querySelector('[data-file-label]');
    var filenameField = wrapper.querySelector('[data-file-name]');
    var submitBtn = wrapper.hasAttribute('data-require-file')
      ? wrapper.querySelector('button[type="submit"]')
      : null;
    if (!input || !hidden) return;

    if (submitBtn) submitBtn.disabled = true;

    var handleFile = function (file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        hidden.value = String(reader.result || '');
        if (preview) {
          preview.src = hidden.value;
          preview.classList.remove('hidden');
        }
        if (label) label.textContent = file.name;
        if (filenameField) filenameField.value = file.name;
        if (submitBtn) submitBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    };

    input.addEventListener('change', function () {
      handleFile(input.files && input.files[0]);
    });

    wrapper.addEventListener('dragover', function (event) {
      event.preventDefault();
      wrapper.classList.add('bg-steel-100');
    });
    wrapper.addEventListener('dragleave', function () {
      wrapper.classList.remove('bg-steel-100');
    });
    wrapper.addEventListener('drop', function (event) {
      event.preventDefault();
      wrapper.classList.remove('bg-steel-100');
      var file = event.dataTransfer && event.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  });
})();
