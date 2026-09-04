/* global document, navigator, window, setTimeout, clearTimeout */

/**
 * Delegated click handler for [data-copy-target] elements — copies the
 * attribute's value to the clipboard and shows a toast. Delegation (vs.
 * binding listeners at load time) means elements added after page load
 * (e.g. inside the image-viewer modal, or content swapped in via
 * sse-client.js) work without a re-scan.
 */
document.addEventListener('click', function (event) {
  var elem = event.target.closest('[data-copy-target]');
  if (!elem || !navigator.clipboard) return;

  var text = elem.getAttribute('data-copy-target') || '';
  if (!text) return;

  if (elem.hasAttribute('data-copy-absolute')) {
    text = new URL(text, window.location.origin).href;
  }

  navigator.clipboard.writeText(text).then(
    function () {
      if (window.toast) window.toast.show('Copied to clipboard', { type: 'success' });

      if (elem._copySuccessTimer) clearTimeout(elem._copySuccessTimer);
      elem.classList.add('copy-success');
      elem._copySuccessTimer = setTimeout(function () {
        elem.classList.remove('copy-success');
      }, 1500);
    },
    function () {
      if (window.toast) window.toast.show('Could not copy to clipboard', { type: 'error' });
    },
  );
});
