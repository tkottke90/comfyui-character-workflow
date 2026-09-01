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
  // Single-result phases without live tiles (job.kind === 'single', no data-sse-tiles):
  // on 'done' or 'error', the page just reloads — this app has no client-side framework
  // and every other page already works by plain form-post/redirect, so reload is what
  // shows the promoted result or the failure state, consistent with that.
  //
  // A page can opt into live tiles instead — patched in place rather than reloaded, since
  // a reload mid-run would lose the in-progress state of every tile that hadn't finished
  // yet — by setting data-sse-tiles on the data-sse-events element, plus a
  // data-images-base prefix (e.g. "/characters/<slug>/images/file") images are served
  // under. Each tile is:
  //   <div data-live-tile data-tile-key="<key>">
  //     <img data-tile-image> or <div data-tile-placeholder> (whichever the page rendered)
  //     <div data-tile-status></div>
  //     <span data-tile-delete> (server-rendered hidden until the tile has an image;
  //       unhidden client-side on 'done' — used by Casting Batch, not by manual generations)
  //   </div>
  //
  // Two shapes of tiles-enabled stream exist:
  // - One job per message (Casting Batch): `job.kind === 'batch'`, mapped to one tile per
  //   sub-job by jobToTiles() below.
  // - A multiplexed array, `{ jobs: [...] }` (manual sessions — any number of single
  //   generations and/or batches can be in flight for one session at once, each in its
  //   own job-store slot): every job in the array is mapped to its own tile(s) the same
  //   way. This stream never triggers a reload — new jobs can appear at any time.

  // Maps whatever JobRecord arrives to one shape both callers below share: one tile per
  // batch sub-job (keyed by its seed), or a single one-item array for a plain job (keyed
  // by the generationId the submitting service recorded on it).
  function jobToTiles(job) {
    if (job.kind === 'batch') {
      return (job.subJobs || []).map(function (s) {
        return { key: s.seed, status: s.status, progress: s.progress, resultPath: s.resultPath, error: s.error };
      });
    }
    return [{ key: job.generationId, status: job.status, progress: job.progress, resultPath: job.resultPath, error: job.error }];
  }

  function patchTiles(root, items) {
    var imagesBase = root.getAttribute('data-images-base') || '';
    var done = 0;
    var failed = 0;

    items.forEach(function (item) {
      if (item.status === 'done') done += 1;
      if (item.status === 'error') failed += 1;

      var tile = root.querySelector('[data-live-tile][data-tile-key="' + item.key + '"]');
      if (!tile) return;

      var statusEl = tile.querySelector('[data-tile-status]');
      if (statusEl) {
        if (item.status === 'done') statusEl.textContent = '';
        else if (item.status === 'error')
          statusEl.textContent =
            'Failed' + (item.error && item.error.message ? ': ' + item.error.message : '');
        else if (item.status === 'running')
          statusEl.textContent =
            'Running' + (item.progress ? ' ' + item.progress.value + '/' + item.progress.max : '…');
        else statusEl.textContent = 'Queued…';
      }

      if (item.status === 'done' && item.resultPath) {
        var src = imagesBase + '/' + item.resultPath;
        var img = tile.querySelector('[data-tile-image]');
        var placeholder = tile.querySelector('[data-tile-placeholder]');
        if (img) {
          if (img.getAttribute('src') !== src) img.setAttribute('src', src);
        } else if (placeholder) {
          var newImg = document.createElement('img');
          newImg.setAttribute('data-tile-image', '');
          newImg.setAttribute('data-viewer-trigger', '');
          newImg.setAttribute('data-viewer-group', tile.getAttribute('data-viewer-group') || '');
          newImg.setAttribute('src', src);
          newImg.setAttribute('alt', '');
          newImg.className = placeholder.className;
          placeholder.replaceWith(newImg);
        }
      }

      if (item.status === 'done') {
        var deleteEl = tile.querySelector('[data-tile-delete]');
        if (deleteEl) deleteEl.classList.remove('hidden');
      }
    });

    return { total: items.length, done: done, failed: failed };
  }

  document.querySelectorAll('[data-sse-events]').forEach(function (root) {
    var url = root.getAttribute('data-sse-events');
    if (!url) return;

    var wantsTiles = root.hasAttribute('data-sse-tiles');
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

      // A multiplexed session-level stream (manual sessions): any number of jobs can be
      // in flight at once, each patched into its own tile(s) — never reloaded, since new
      // jobs can appear at any time the page is open.
      if (wantsTiles && job.jobs && Array.isArray(job.jobs)) {
        job.jobs.forEach(function (oneJob) {
          patchTiles(root, jobToTiles(oneJob));
        });
        return;
      }

      if (job.kind === 'batch') {
        if (!wantsTiles) {
          setStatus('Casting batch in progress — refresh to see results.');
          return;
        }
        var summary = patchTiles(root, jobToTiles(job));
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
