/* global document, Image, FileReader */
(function () {
  'use strict';

  // ---- Mask editor: editable polygon drawn over the current image, OR an uploaded file ----
  //
  // Markup contract (a page wires this in by providing this shape — see refinement.njk /
  // polish.njk once they adopt it):
  //
  //   <div data-mask-editor data-image-src="...">
  //     <canvas data-mask-canvas></canvas>
  //     <button type="button" data-mask-mode-btn="draw">Draw</button>
  //     <button type="button" data-mask-mode-btn="upload">Upload</button>
  //     <div data-mask-draw-tools>
  //       <button type="button" data-mask-add-vertex>Add vertex</button>
  //       <button type="button" data-mask-remove-vertex>Remove vertex</button>
  //     </div>
  //     <div data-mask-upload-tools>
  //       <input type="file" accept="image/png,image/jpeg,image/webp" data-mask-upload-input>
  //     </div>
  //     <input type="hidden" name="maskMode" data-mask-mode value="draw">
  //     <input type="hidden" name="maskDataUrl" data-mask-data-url>
  //   </div>
  //
  // Two mutually exclusive modes. Switching mode discards whatever was in the other —
  // there's no dual-state to reconcile, matching the design decision this implements.
  // The exported mask (maskDataUrl, draw mode only) is always a plain white-on-black
  // raster at the reference image's own pixel dimensions — the on-canvas view can show
  // the reference image for tracing, but that's an editing aid, not part of the output.

  var MIN_VERTICES = 3;
  var VERTEX_HIT_RADIUS = 10;

  document.querySelectorAll('[data-mask-editor]').forEach(function (root) {
    var canvas = root.querySelector('[data-mask-canvas]');
    var modeField = root.querySelector('[data-mask-mode]');
    var dataUrlField = root.querySelector('[data-mask-data-url]');
    var drawTools = root.querySelector('[data-mask-draw-tools]');
    var uploadTools = root.querySelector('[data-mask-upload-tools]');
    var uploadInput = root.querySelector('[data-mask-upload-input]');
    var addVertexBtn = root.querySelector('[data-mask-add-vertex]');
    var removeVertexBtn = root.querySelector('[data-mask-remove-vertex]');
    var modeButtons = root.querySelectorAll('[data-mask-mode-btn]');
    if (!canvas || !dataUrlField) return;

    var ctx = canvas.getContext('2d');
    var referenceImage = new Image();
    var imageWidth = 0;
    var imageHeight = 0;
    var polygon = []; // [{x, y}, ...] in reference-image pixel space
    var draggingIndex = -1;
    var mode = (modeField && modeField.value) || 'draw';

    function defaultPolygon() {
      var w = imageWidth || 512;
      var h = imageHeight || 512;
      return [
        { x: w * 0.25, y: h * 0.25 },
        { x: w * 0.75, y: h * 0.25 },
        { x: w * 0.75, y: h * 0.75 },
        { x: w * 0.25, y: h * 0.75 },
      ];
    }

    function toCanvas(point) {
      var scaleX = canvas.width / (imageWidth || canvas.width);
      var scaleY = canvas.height / (imageHeight || canvas.height);
      return { x: point.x * scaleX, y: point.y * scaleY };
    }

    function fromCanvas(point) {
      var scaleX = (imageWidth || canvas.width) / canvas.width;
      var scaleY = (imageHeight || canvas.height) / canvas.height;
      return { x: point.x * scaleX, y: point.y * scaleY };
    }

    function renderEditorView() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (referenceImage.complete && referenceImage.naturalWidth) {
        ctx.drawImage(referenceImage, 0, 0, canvas.width, canvas.height);
      }

      if (mode !== 'draw' || polygon.length < 1) return;

      ctx.save();
      ctx.beginPath();
      polygon.forEach(function (point, index) {
        var p = toCanvas(point);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      polygon.forEach(function (point) {
        var p = toCanvas(point);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
      });
      ctx.restore();
    }

    function rasterizeMask() {
      var w = imageWidth || canvas.width;
      var h = imageHeight || canvas.height;
      var raster = document.createElement('canvas');
      raster.width = w;
      raster.height = h;
      var rctx = raster.getContext('2d');
      if (!rctx) return '';

      rctx.fillStyle = '#000000';
      rctx.fillRect(0, 0, w, h);

      if (polygon.length >= MIN_VERTICES) {
        rctx.beginPath();
        polygon.forEach(function (point, index) {
          if (index === 0) rctx.moveTo(point.x, point.y);
          else rctx.lineTo(point.x, point.y);
        });
        rctx.closePath();
        rctx.fillStyle = '#ffffff';
        rctx.fill();
      }

      return raster.toDataURL('image/png');
    }

    function updateExportedMask() {
      if (mode !== 'draw') return;
      dataUrlField.value = rasterizeMask();
    }

    function setMode(nextMode) {
      mode = nextMode;
      if (modeField) modeField.value = mode;
      if (drawTools) drawTools.classList.toggle('hidden', mode !== 'draw');
      if (uploadTools) uploadTools.classList.toggle('hidden', mode !== 'upload');
      modeButtons.forEach(function (btn) {
        btn.classList.toggle('opacity-50', btn.getAttribute('data-mask-mode-btn') !== mode);
      });

      // Switching modes discards whatever was in the other mode — no dual-state kept.
      dataUrlField.value = '';
      if (mode === 'draw') {
        polygon = defaultPolygon();
        updateExportedMask();
      }
      if (uploadInput) uploadInput.value = '';
      renderEditorView();
    }

    function nearestVertexIndex(canvasPoint) {
      var closestIndex = -1;
      var closestDistance = VERTEX_HIT_RADIUS;
      polygon.forEach(function (point, index) {
        var p = toCanvas(point);
        var distance = Math.hypot(p.x - canvasPoint.x, p.y - canvasPoint.y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      return closestIndex;
    }

    function nearestEdgeMidpointIndex(canvasPoint) {
      var closestIndex = -1;
      var closestDistance = Infinity;
      for (var i = 0; i < polygon.length; i += 1) {
        var a = toCanvas(polygon[i]);
        var b = toCanvas(polygon[(i + 1) % polygon.length]);
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        var distance = Math.hypot(mid.x - canvasPoint.x, mid.y - canvasPoint.y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      }
      return closestIndex;
    }

    function canvasPointFromEvent(event) {
      var rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    canvas.addEventListener('mousedown', function (event) {
      if (mode !== 'draw') return;
      var point = canvasPointFromEvent(event);
      draggingIndex = nearestVertexIndex(point);
    });

    canvas.addEventListener('mousemove', function (event) {
      if (mode !== 'draw' || draggingIndex === -1) return;
      var point = fromCanvas(canvasPointFromEvent(event));
      polygon[draggingIndex] = point;
      renderEditorView();
    });

    ['mouseup', 'mouseleave'].forEach(function (name) {
      canvas.addEventListener(name, function () {
        if (draggingIndex === -1) return;
        draggingIndex = -1;
        updateExportedMask();
      });
    });

    if (addVertexBtn) {
      addVertexBtn.addEventListener('click', function () {
        // Insert at the midpoint of whichever edge is currently longest, by canvas-space
        // reasoning — simplest useful default without asking the user to click a spot first.
        var index = nearestEdgeMidpointIndex({ x: canvas.width / 2, y: canvas.height / 2 });
        if (index === -1) return;
        var a = polygon[index];
        var b = polygon[(index + 1) % polygon.length];
        polygon.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        renderEditorView();
        updateExportedMask();
      });
    }

    if (removeVertexBtn) {
      removeVertexBtn.addEventListener('click', function () {
        if (polygon.length <= MIN_VERTICES) return;
        polygon.pop();
        renderEditorView();
        updateExportedMask();
      });
    }

    modeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMode(btn.getAttribute('data-mask-mode-btn'));
      });
    });

    if (uploadInput) {
      uploadInput.addEventListener('change', function () {
        var file = uploadInput.files && uploadInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          dataUrlField.value = String(reader.result || '');
        };
        reader.readAsDataURL(file);
      });
    }

    var imageSrc = root.getAttribute('data-image-src');
    referenceImage.onload = function () {
      imageWidth = referenceImage.naturalWidth;
      imageHeight = referenceImage.naturalHeight;
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      polygon = defaultPolygon();
      renderEditorView();
      updateExportedMask();
    };
    if (imageSrc) referenceImage.src = imageSrc;

    setMode(mode);
  });
})();
