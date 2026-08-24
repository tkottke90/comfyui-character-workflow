/* global document, EventSource, location */
(function () {
  'use strict';

  // ---- Phase-run progress via Server-Sent Events ----
  //
  // Markup contract: a page rendering a phase's loading state provides
  //   <div data-sse-events="/characters/<slug>/events/<phaseBindingKey>">
  //     <div data-sse-status></div>
  //     <progress data-sse-progress></progress>
  //   </div>
  //
  // Single-result phases (job.kind === 'single'): on 'done' or 'error', the page just
  // reloads — this app has no client-side framework and every other page already works
  // by plain form-post/redirect, so reload is what shows the promoted result or the
  // failure state, consistent with that. Casting batch (job.kind === 'batch') is a
  // deliberate exception in the design (a tile grid patched in place, not a reload) —
  // not implemented here yet; this client only drives the single-result case for now.

  document.querySelectorAll('[data-sse-events]').forEach(function (root) {
    var url = root.getAttribute('data-sse-events');
    if (!url) return;

    var statusEl = root.querySelector('[data-sse-status]');
    var progressEl = root.querySelector('[data-sse-progress]');

    var setStatus = function (text) {
      if (statusEl) statusEl.textContent = text;
    };

    var source = new EventSource(url);

    source.onmessage = function (event) {
      var job;
      try {
        job = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!job) {
        setStatus('Waiting to start…');
        return;
      }

      if (job.kind === 'batch') {
        // Tile-grid patching for casting batch isn't implemented on this generic
        // client yet — surfaced as a status line rather than silently doing nothing.
        setStatus('Casting batch in progress — refresh to see results.');
        return;
      }

      if (job.status === 'queued') {
        setStatus('Queued…');
        return;
      }

      if (job.status === 'running') {
        if (job.progress && progressEl) {
          progressEl.max = job.progress.max;
          progressEl.value = job.progress.value;
          progressEl.classList.remove('hidden');
        }
        setStatus('Running' + (job.progress ? ' — step ' + job.progress.value + ' of ' + job.progress.max : '…'));
        return;
      }

      if (job.status === 'done' || job.status === 'error') {
        source.close();
        location.reload();
      }
    };

    source.onerror = function () {
      setStatus('Connection lost — retrying…');
    };
  });
})();
