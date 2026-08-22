/* global document, FileReader */
(function () {
  'use strict';

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

  // ---- File -> base64 data URL upload (no server-side multipart parser) ----
  document.querySelectorAll('[data-file-upload]').forEach(function (wrapper) {
    var input = wrapper.querySelector('input[type="file"]');
    var hidden = wrapper.querySelector('input[type="hidden"]');
    var preview = wrapper.querySelector('[data-file-preview]');
    var label = wrapper.querySelector('[data-file-label]');
    if (!input || !hidden) return;

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
