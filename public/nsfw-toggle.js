/* global document, fetch */
(function () {
  'use strict';

  // Markup contract this script expects the page to provide:
  //
  // - A `[data-images-endpoint]` root (e.g. the gallery grid) naming the base
  //   URL to PATCH image updates to (`<endpoint>/<imageId>`).
  // - Each image tile inside it: `[data-image-tile]` with `data-image-id`,
  //   containing a `[data-nsfw-target]` element (the thumbnail wrapper —
  //   toggling `data-nsfw-enabled` on it drives the blur/badge CSS in
  //   app.css) and a `[data-nsfw-toggle]` button.

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
      var button = event.target.closest('[data-nsfw-toggle]');
      if (!button) return;

      var tile = button.closest('[data-image-tile]');
      var target = tile && tile.querySelector('[data-nsfw-target]');
      if (!tile || !target) return;

      var next = !target.hasAttribute('data-nsfw-enabled');

      request('PATCH', endpoint + '/' + tile.getAttribute('data-image-id'), { nsfw: next })
        .then(function () {
          target.toggleAttribute('data-nsfw-enabled', next);
          button.textContent = next ? 'Unset NSFW' : 'Set NSFW';
        })
        .catch(function () {
          /* no-op: leave the button and tile exactly as the user left them */
        });
    });
  });
})();
