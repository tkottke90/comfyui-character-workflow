/* global document, fetch, window */
(function () {
  'use strict';

  // Markup contract this script expects the page to provide:
  //
  // - A `[data-images-endpoint]` root (e.g. the gallery grid) naming the base
  //   URL to PATCH image updates to (`<endpoint>/<imageId>`).
  // - Each image tile inside it: `[data-image-tile]` with `data-image-id` —
  //   toggling `data-locked` on the tile itself drives the delete-button
  //   visibility CSS in app.css — and a `[data-lock-toggle]` button.

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

  Array.prototype.forEach.call(document.querySelectorAll('[data-images-endpoint]'), function (root) {
    var endpoint = root.getAttribute('data-images-endpoint');

    root.addEventListener('click', function (event) {
      var button = event.target.closest('[data-lock-toggle]');
      if (!button) return;

      var tile = button.closest('[data-image-tile]');
      if (!tile) return;

      var next = !tile.hasAttribute('data-locked');

      request('PATCH', endpoint + '/' + tile.getAttribute('data-image-id'), { locked: next })
        .then(function () {
          tile.toggleAttribute('data-locked', next);
          button.textContent = next ? 'Unlock' : 'Lock';
        })
        .catch(function () {
          if (window.toast) window.toast.show('Failed to update lock status.', { type: 'error' });
        });
    });
  });
})();
