/* global document, window, setTimeout, clearTimeout, requestAnimationFrame */
(function () {
  'use strict';

  var portal = document.getElementById('toast-portal');
  if (!portal) return;

  var DEFAULT_DURATIONS = { success: 4000, info: 4000, warning: 6000, error: 0 };
  var VALID_TYPES = Object.keys(DEFAULT_DURATIONS);

  var VARIANT_CLASSES = {
    success:
      'bg-success-100 border-success-500 text-success-700 dark:bg-[#12301e] dark:border-success-600 dark:text-[#7fd0a0]',
    error:
      'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300',
    info: 'bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300',
    warning:
      'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300',
  };

  // ---- FLIP helper: capture each portal child's position, run `mutate`, then animate
  // every surviving child from its old position to its new one. `spring` picks which of
  // the two easing curves (defined in app.css) drives that reflow. ----
  function flipReflow(mutate, spring) {
    var children = Array.prototype.slice.call(portal.children);
    var firstRects = children.map(function (child) {
      return child.getBoundingClientRect();
    });

    mutate();

    children.forEach(function (child, i) {
      if (!child.isConnected) return;
      var last = child.getBoundingClientRect();
      var dy = firstRects[i].top - last.top;
      if (!dy) return;

      if (spring) child.classList.add('toast-spring');
      child.style.transition = 'none';
      child.style.transform = 'translateY(' + dy + 'px)';
      child.getBoundingClientRect(); // force reflow so the transform above is committed
      child.style.transition = '';

      var onEnd = function (event) {
        if (event.propertyName !== 'transform') return;
        child.removeEventListener('transitionend', onEnd);
        child.classList.remove('toast-spring');
      };
      child.addEventListener('transitionend', onEnd);

      requestAnimationFrame(function () {
        child.style.transform = '';
      });
    });
  }

  function createToastEl(message, type) {
    var el = document.createElement('div');
    el.className =
      'toast toast-offscreen pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-lg border shadow-md px-4 py-3 flex items-start gap-3 text-[13.5px] ' +
      (VARIANT_CLASSES[type] || VARIANT_CLASSES.info);
    el.setAttribute('data-toast-type', type);
    el.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');

    var message_ = document.createElement('span');
    message_.className = 'toast-message flex-1 leading-snug';
    message_.textContent = message;
    el.appendChild(message_);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'shrink-0 leading-none text-base opacity-60 hover:opacity-100';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    el.appendChild(closeBtn);

    return { el: el, closeBtn: closeBtn };
  }

  function dismiss(el) {
    if (el.dataset.dismissing) return;
    el.dataset.dismissing = 'true';
    if (el._timer) clearTimeout(el._timer);

    el.classList.add('toast-spring');
    el.classList.add('toast-offscreen');

    var onExitEnd = function (event) {
      if (event.target !== el || event.propertyName !== 'transform') return;
      el.removeEventListener('transitionend', onExitEnd);
      flipReflow(
        function () {
          el.remove();
        },
        false,
      );
    };
    el.addEventListener('transitionend', onExitEnd);
  }

  function show(message, options) {
    options = options || {};
    var type = VALID_TYPES.indexOf(options.type) !== -1 ? options.type : 'info';
    var duration = typeof options.duration === 'number' ? options.duration : DEFAULT_DURATIONS[type];

    var created = createToastEl(message, type);
    var el = created.el;

    flipReflow(function () {
      portal.insertBefore(el, portal.firstChild);
      // Force layout so the browser registers the off-screen starting state before it's
      // removed below — otherwise the two style changes coalesce and nothing transitions.
      el.getBoundingClientRect();
    }, true);

    setTimeout(function () {
      el.classList.remove('toast-offscreen');
    }, 100);

    created.closeBtn.addEventListener('click', function () {
      dismiss(el);
    });

    if (duration > 0) {
      el._remaining = duration;
      el._start = Date.now();
      el._timer = setTimeout(function () {
        dismiss(el);
      }, duration);

      el.addEventListener('mouseenter', function () {
        if (!el._timer) return;
        clearTimeout(el._timer);
        el._timer = null;
        el._remaining -= Date.now() - el._start;
      });
      el.addEventListener('mouseleave', function () {
        if (el._timer || el.dataset.dismissing || el._remaining <= 0) return;
        el._start = Date.now();
        el._timer = setTimeout(function () {
          dismiss(el);
        }, el._remaining);
      });
    }

    return el;
  }

  window.toast = { show: show };
})();
