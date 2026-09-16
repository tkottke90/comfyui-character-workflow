/* global document, FormData, URLSearchParams, fetch */
(function () {
  'use strict';

  // Markup contract this script expects the page to provide:
  //
  // - One `[data-image-viewer]` `<dialog>` per page (partials/image-viewer.njk,
  //   included once from layout.njk), containing `[data-viewer-image]`,
  //   `[data-viewer-video]`, `[data-viewer-audio]` (exactly one shown at a
  //   time, per trigger kind), `[data-viewer-prev]`/`[data-viewer-next]`
  //   (hidden unless a group has more than one member), `[data-viewer-close]`,
  //   and an empty `[data-viewer-checklist-slot]`.
  // - Any element with `data-viewer-trigger` opens the dialog on click.
  //   `data-viewer-kind="video"|"audio"` on the trigger selects which of the
  //   three media elements is shown (default: image). The URL is resolved
  //   from, in order: an explicit `data-viewer-src` attribute on the trigger
  //   (used when the trigger itself isn't a media element, e.g. an audio
  //   placeholder icon); the trigger's own `src`/`currentSrc` if it's an
  //   `<img>`/`<video>`; otherwise the nearest `img`/`video`/`audio` inside its
  //   enclosing tile (`[data-live-tile]`/`[data-gallery-tile]`/
  //   `[data-picker-tile]`/`[data-viewer-tile]`). The URL is always read live
  //   at click/step time — never cached — so SSE-patched tiles and
  //   client-side file-preview swaps can never go stale.
  // - `data-viewer-group="<name>"` on a trigger groups it with every other
  //   trigger sharing that name for prev/next stepping.
  // - `data-viewer-checklist="<id>"` on a trigger names the id of a page
  //   element (a `<form>` or wrapping `<div>`) to move into the checklist slot
  //   for the life of the dialog, restoring it to its original position on
  //   close.
  // - A `<form data-viewer-ajax-form>` inside the moved checklist panel is
  //   submitted via fetch (Accept: application/json) instead of a full page
  //   POST, so the dialog doesn't close/reload. The JSON response's
  //   `checklist` (an object of `"<phase>.<id>": boolean`) patches every
  //   `input[type=checkbox]` in the form named `checklist[<id>]`, keyed off a
  //   `data-checklist-phase` attribute on the form; a `rowHtml` string
  //   (server-rendered replacement markup) instead replaces the form's nearest
  //   `[data-audit-row-index]` ancestor via outerHTML swap.

  var dialog = document.querySelector('[data-image-viewer]');
  if (!dialog) return;

  var image = dialog.querySelector('[data-viewer-image]');
  var video = dialog.querySelector('[data-viewer-video]');
  var audio = dialog.querySelector('[data-viewer-audio]');
  var prevBtn = dialog.querySelector('[data-viewer-prev]');
  var nextBtn = dialog.querySelector('[data-viewer-next]');
  var closeBtn = dialog.querySelector('[data-viewer-close]');
  var slot = dialog.querySelector('[data-viewer-checklist-slot]');
  if (!image || !video || !audio || !prevBtn || !nextBtn || !closeBtn || !slot) return;

  var currentGroup = null;
  var currentIndex = -1;
  var movedPanel = null; // { node, parent, nextSibling }

  function resolveMediaUrl(trigger) {
    var explicit = trigger.getAttribute('data-viewer-src');
    if (explicit) return explicit;
    if (trigger.tagName === 'IMG' || trigger.tagName === 'VIDEO') {
      return trigger.currentSrc || trigger.getAttribute('src') || '';
    }
    var scope =
      trigger.closest(
        '[data-live-tile], [data-gallery-tile], [data-picker-tile], [data-viewer-tile]',
      ) || trigger.parentElement;
    var media = scope && scope.querySelector('img, video, audio');
    return media ? media.currentSrc || media.getAttribute('src') || '' : '';
  }

  function showTrigger(trigger) {
    var kind = trigger.getAttribute('data-viewer-kind') || 'image';
    video.pause();
    audio.pause();
    image.classList.add('hidden');
    video.classList.add('hidden');
    audio.classList.add('hidden');

    var el = kind === 'video' ? video : kind === 'audio' ? audio : image;
    el.src = resolveMediaUrl(trigger);
    el.classList.remove('hidden');
  }

  function restorePanel() {
    if (!movedPanel) return;
    if (movedPanel.nextSibling) {
      movedPanel.parent.insertBefore(movedPanel.node, movedPanel.nextSibling);
    } else {
      movedPanel.parent.appendChild(movedPanel.node);
    }
    movedPanel = null;
    slot.classList.add('hidden');
  }

  function openFromTrigger(trigger) {
    var groupName = trigger.getAttribute('data-viewer-group');
    if (groupName) {
      currentGroup = Array.prototype.slice.call(
        document.querySelectorAll('[data-viewer-group="' + groupName + '"]'),
      );
      currentIndex = currentGroup.indexOf(trigger);
    } else {
      currentGroup = null;
      currentIndex = -1;
    }

    showTrigger(trigger);

    var checklistId = trigger.getAttribute('data-viewer-checklist');
    var panel = checklistId ? document.getElementById(checklistId) : null;
    if (panel) {
      movedPanel = { node: panel, parent: panel.parentNode, nextSibling: panel.nextSibling };
      slot.appendChild(panel);
      slot.classList.remove('hidden');
    }

    var hasNeighbors = Boolean(currentGroup && currentGroup.length > 1);
    prevBtn.classList.toggle('hidden', !hasNeighbors);
    nextBtn.classList.toggle('hidden', !hasNeighbors);

    if (!dialog.open) dialog.showModal();
  }

  function step(delta) {
    if (!currentGroup || currentGroup.length === 0) return;
    currentIndex = (currentIndex + delta + currentGroup.length) % currentGroup.length;
    showTrigger(currentGroup[currentIndex]);
  }

  // ---- Trigger click delegation ----
  // Capture phase, not bubble: some triggers (e.g. the Refinement input
  // image's overlay button) sit inside a container with its own onclick.
  // That ancestor's handler runs during the bubble phase before an event
  // reaches a bubble-phase listener on `document`, so stopping propagation
  // there would already be too late — intercepting during capture (which
  // runs document-down, before the click ever reaches the container) is
  // what actually prevents it from firing. Harmless for every other trigger.
  document.addEventListener(
    'click',
    function (event) {
      var trigger = event.target.closest('[data-viewer-trigger]');
      if (!trigger) return;
      event.stopPropagation();
      openFromTrigger(trigger);
    },
    true,
  );

  // ---- Dialog controls ----
  prevBtn.addEventListener('click', function () {
    step(-1);
  });
  nextBtn.addEventListener('click', function () {
    step(1);
  });
  closeBtn.addEventListener('click', function () {
    dialog.close();
  });
  // <dialog> doesn't close on backdrop click natively — a click that lands
  // directly on the dialog element itself (not any of its content) is one.
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', function () {
    image.src = '';
    video.pause();
    video.src = '';
    audio.pause();
    audio.src = '';
    restorePanel();
  });

  // ---- In-modal checklist/audit-row submits ----
  function patchChecklist(form, checklist) {
    var phase = form.getAttribute('data-checklist-phase');
    if (!phase) return;
    var checkboxes = form.querySelectorAll('input[type="checkbox"]');
    Array.prototype.forEach.call(checkboxes, function (box) {
      var match = /^checklist\[(.+)\]$/.exec(box.getAttribute('name') || '');
      if (!match) return;
      box.checked = Boolean(checklist[phase + '.' + match[1]]);
    });
  }

  function patchAuditRow(form, rowHtml) {
    var oldRow = form.closest('[data-audit-row-index]');
    if (!oldRow) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = rowHtml.trim();
    var newRow = wrapper.firstElementChild;
    if (newRow) oldRow.replaceWith(newRow);
  }

  slot.addEventListener('submit', function (event) {
    var form = event.target.closest('form[data-viewer-ajax-form]');
    if (!form) return;
    event.preventDefault();

    fetch(form.getAttribute('action'), {
      method: 'POST',
      body: new URLSearchParams(new FormData(form)),
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data && data.checklist) patchChecklist(form, data.checklist);
        if (data && data.rowHtml) patchAuditRow(form, data.rowHtml);
      })
      .catch(function () {
        /* no-op: leave the form exactly as the user left it */
      });
  });
})();
