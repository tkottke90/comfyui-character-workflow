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
  // failure state, consistent with that.
  //
  // Casting batch (job.kind === 'batch') is the deliberate exception in the design: a
  // tile grid patched in place rather than reloaded, since a reload mid-batch would lose
  // the in-progress state of every candidate that hadn't finished yet. Opt in per-page by
  // also setting data-sse-batch on the same element, plus a data-images-base prefix (e.g.
  // "/characters/<slug>/images/file") images are served under. Each candidate tile is:
  //   <div data-casting-tile data-seed="<seed>">
  //     <img data-tile-image> or <div data-tile-placeholder> (whichever the page rendered)
  //     <div data-tile-status></div>
  //     <span data-tile-delete> (server-rendered hidden until the candidate has an image;
  //       unhidden client-side on 'done')
  //   </div>

  function patchBatchTiles(root, job) {
    var imagesBase = root.getAttribute('data-images-base') || '';
    var subJobs = job.subJobs || [];
    var done = 0;
    var failed = 0;

    subJobs.forEach(function (sub) {
      if (sub.status === 'done') done += 1;
      if (sub.status === 'error') failed += 1;

      var tile = root.querySelector('[data-casting-tile][data-seed="' + sub.seed + '"]');
      if (!tile) return;

      var statusEl = tile.querySelector('[data-tile-status]');
      if (statusEl) {
        if (sub.status === 'done') statusEl.textContent = '';
        else if (sub.status === 'error')
          statusEl.textContent =
            'Failed' + (sub.error && sub.error.message ? ': ' + sub.error.message : '');
        else if (sub.status === 'running')
          statusEl.textContent =
            'Running' + (sub.progress ? ' ' + sub.progress.value + '/' + sub.progress.max : '…');
        else statusEl.textContent = 'Queued…';
      }

      if (sub.status === 'done' && sub.resultPath) {
        var src = imagesBase + '/' + sub.resultPath;
        var img = tile.querySelector('[data-tile-image]');
        var placeholder = tile.querySelector('[data-tile-placeholder]');
        if (img) {
          if (img.getAttribute('src') !== src) img.setAttribute('src', src);
        } else if (placeholder) {
          var newImg = document.createElement('img');
          newImg.setAttribute('data-tile-image', '');
          newImg.setAttribute('data-viewer-trigger', '');
          newImg.setAttribute('data-viewer-group', 'casting-batch');
          newImg.setAttribute('src', src);
          newImg.setAttribute('alt', '');
          newImg.className = placeholder.className;
          placeholder.replaceWith(newImg);
        }
      }

      if (sub.status === 'done') {
        var deleteEl = tile.querySelector('[data-tile-delete]');
        if (deleteEl) deleteEl.classList.remove('hidden');
      }
    });

    return { total: subJobs.length, done: done, failed: failed };
  }

  document.querySelectorAll('[data-sse-events]').forEach(function (root) {
    var url = root.getAttribute('data-sse-events');
    if (!url) return;

    var isBatch = root.hasAttribute('data-sse-batch');
    var statusEl = root.querySelector('[data-sse-status]');
    var progressEl = root.querySelector('[data-sse-progress]');

    // The page's initial server-render already reflects whatever job state existed at
    // request time (see the events route's "emit current state immediately" comment). If
    // the first SSE message reports the very same terminal status, the page already shows
    // it — reloading would just re-fetch the same 'done'/'error' state and reconnect,
    // triggering the same message again forever. Only reload when the status differs from
    // what was rendered (a fresh completion) or on any later message (a real transition).
    var initialStatus = root.getAttribute('data-initial-status') || '';
    var sawFirstMessage = false;

    var setStatus = function (text) {
      if (statusEl) statusEl.textContent = text;
    };

    var source = new EventSource(url);

    source.onmessage = function (event) {
      var isFirstMessage = !sawFirstMessage;
      sawFirstMessage = true;
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
        if (!isBatch) {
          setStatus('Casting batch in progress — refresh to see results.');
          return;
        }
        var summary = patchBatchTiles(root, job);
        if (summary.total === 0) setStatus('');
        else if (summary.done + summary.failed >= summary.total) {
          source.close();
          setStatus(
            summary.failed > 0
              ? summary.done + '/' + summary.total + ' done, ' + summary.failed + ' failed'
              : 'All ' + summary.total + ' candidates done',
          );
        } else {
          setStatus(summary.done + summary.failed + ' of ' + summary.total + ' finished…');
        }
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
        setStatus(
          'Running' +
            (job.progress ? ' — step ' + job.progress.value + ' of ' + job.progress.max : '…'),
        );
        return;
      }

      if (job.status === 'done' || job.status === 'error') {
        source.close();
        if (!isFirstMessage || job.status !== initialStatus) location.reload();
      }
    };

    source.onerror = function () {
      setStatus('Connection lost — retrying…');
    };
  });
})();
