/* global document, fetch */
(function () {
  'use strict';

  // ---- Configuration page: Field Mapping card ----
  //
  // Deliberately *not* the character-integration workflow-mapping convention of
  // rendering every parsed node input as a permanent, always-visible row — a raw
  // ComfyUI workflow can have dozens of inputs, and this page only ever lists the small
  // number of fields the user actually created on the Generation tab. The full input
  // list is fetched once and only ever shown inside a field's own "Map…" picker, opened
  // on demand and filterable by search text.

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function request(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || 'Request failed');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function inputKey(nodeId, inputName) {
    return nodeId + '::' + inputName;
  }

  function matchesFilter(input, filter) {
    if (!filter) return true;
    var haystack = (input.nodeTitle + ' ' + input.nodeId + ' ' + input.inputName + ' ' + input.classType).toLowerCase();
    return haystack.indexOf(filter) !== -1;
  }

  function buildPanel(inputs, currentMappings) {
    var checkedKeys = {};
    currentMappings.forEach(function (m) {
      checkedKeys[inputKey(m.nodeId, m.inputName)] = true;
    });

    var panel = document.createElement('div');
    panel.className = 'mt-2 p-2.5 border border-steel-300 dark:border-steel-700 rounded-md';
    panel.innerHTML =
      '<input type="text" placeholder="Filter by node or input name…" data-mapping-filter ' +
      'class="w-full mb-2 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[12.5px]" />' +
      '<div class="max-h-56 overflow-y-auto flex flex-col gap-1" data-mapping-options></div>' +
      '<div class="text-[12px] text-rose-700 dark:text-rose-300 mt-2 hidden" data-mapping-error></div>' +
      '<div class="flex justify-end gap-3 mt-2">' +
      '<button type="button" class="text-[12.5px] text-steel-500" data-mapping-cancel>Cancel</button>' +
      '<button type="button" class="text-[12.5px] font-semibold text-apple-700 dark:text-apple-300" data-mapping-save>Save</button>' +
      '</div>';

    var optionsEl = panel.querySelector('[data-mapping-options]');

    function renderOptions(filter) {
      var matches = inputs.filter(function (input) {
        return matchesFilter(input, filter);
      });

      if (matches.length === 0) {
        optionsEl.innerHTML = '<p class="text-[12px] text-steel-400 py-1">No matching inputs.</p>';
        return;
      }

      optionsEl.innerHTML = matches
        .map(function (input) {
          var key = inputKey(input.nodeId, input.inputName);
          return (
            '<label class="flex items-center gap-2 text-[12.5px] py-0.5">' +
            '<input type="checkbox" data-mapping-option data-node-id="' +
            escapeHtml(input.nodeId) +
            '" data-input-name="' +
            escapeHtml(input.inputName) +
            '" data-class-type="' +
            escapeHtml(input.classType) +
            '" ' +
            (checkedKeys[key] ? 'checked' : '') +
            ' />' +
            '<span>' +
            escapeHtml(input.nodeTitle) +
            ' <span class="font-mono text-steel-400">·' +
            escapeHtml(input.nodeId) +
            '</span> — ' +
            escapeHtml(input.inputName) +
            '</span>' +
            '</label>'
          );
        })
        .join('');
    }

    renderOptions('');

    panel.querySelector('[data-mapping-filter]').addEventListener('input', function (event) {
      renderOptions(event.target.value.trim().toLowerCase());
    });

    return panel;
  }

  document.querySelectorAll('[data-field-mapping-list]').forEach(function (list) {
    var workflowInputsEndpoint = list.getAttribute('data-workflow-inputs-endpoint');
    var fieldsEndpoint = list.getAttribute('data-fields-endpoint');
    var inputsPromise = request('GET', workflowInputsEndpoint).then(function (data) {
      return (data && data.inputs) || [];
    });

    list.addEventListener('click', function (event) {
      var editTrigger = event.target.closest('[data-mapping-edit]');
      if (!editTrigger) return;

      var row = editTrigger.closest('[data-mapping-row]');
      var existingPanel = row.querySelector('[data-mapping-panel]');
      if (existingPanel) {
        existingPanel.remove();
        return; // clicking "Map…" again toggles the panel closed
      }

      var fieldId = row.getAttribute('data-field-id');
      // A row can override its own PATCH target (Seed's pinned row does, since it isn't
      // a field with an id) — everything else about the picker/save flow is identical.
      var patchEndpoint = row.getAttribute('data-mapping-endpoint') || (fieldsEndpoint + '/' + fieldId);
      var currentMappings = [];
      try {
        currentMappings = JSON.parse(row.getAttribute('data-field-mappings') || '[]');
      } catch {
        currentMappings = [];
      }

      inputsPromise.then(function (inputs) {
        var panel = buildPanel(inputs, currentMappings);
        panel.setAttribute('data-mapping-panel', '');
        row.appendChild(panel);

        var errorEl = panel.querySelector('[data-mapping-error]');
        var showError = function (message) {
          errorEl.textContent = message;
          errorEl.classList.remove('hidden');
        };

        panel.querySelector('[data-mapping-cancel]').addEventListener('click', function () {
          panel.remove();
        });

        panel.querySelector('[data-mapping-save]').addEventListener('click', function () {
          var selected = Array.prototype.map.call(
            panel.querySelectorAll('[data-mapping-option]:checked'),
            function (checkbox) {
              return {
                nodeId: checkbox.getAttribute('data-node-id'),
                inputName: checkbox.getAttribute('data-input-name'),
                classType: checkbox.getAttribute('data-class-type'),
              };
            }
          );

          request('PATCH', patchEndpoint, { mappings: selected })
            .then(function (data) {
              row.setAttribute('data-field-mappings', JSON.stringify(data.mappings));
              var summary = row.querySelector('[data-mapping-summary]');
              if (summary) {
                summary.textContent = data.mappings.length + ' input' + (data.mappings.length !== 1 ? 's' : '') + ' mapped';
              }
              panel.remove();
            })
            .catch(function (err) {
              showError(err.message);
            });
        });
      });
    });
  });

  // ---- Configuration page: Result Output pinned row ----
  //
  // A different kind of picker from the field/Seed one above: a single node selection
  // (not a multi-select checklist over inputs) plus an explicit output-index number.
  // Shares the same open/filter/save/collapse shape, fetching a separate endpoint since
  // "candidate output nodes" is a distinct dataset from "mappable inputs".

  function buildOutputPanel(candidates, allNodeIds, current) {
    var panel = document.createElement('div');
    panel.className = 'mt-2 p-2.5 border border-steel-300 dark:border-steel-700 rounded-md';

    var nodePicker;
    if (candidates.length) {
      nodePicker =
        '<select data-output-node class="w-full mb-2 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[12.5px] font-mono">' +
        '<option value="">— choose —</option>' +
        candidates
          .map(function (candidate) {
            return (
              '<option value="' +
              escapeHtml(candidate.nodeId) +
              '" ' +
              (current && current.nodeId === candidate.nodeId ? 'selected' : '') +
              '>' +
              escapeHtml(candidate.nodeTitle) +
              ' ·' +
              escapeHtml(candidate.nodeId) +
              '</option>'
            );
          })
          .join('') +
        '</select>';
    } else {
      var optionsHtml = allNodeIds
        .map(function (nodeId) {
          return '<option value="' + escapeHtml(nodeId) + '"></option>';
        })
        .join('');
      nodePicker =
        '<input type="text" list="output-node-ids" data-output-node placeholder="node id" value="' +
        (current ? escapeHtml(current.nodeId) : '') +
        '" class="w-full mb-2 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[12.5px] font-mono" />' +
        '<datalist id="output-node-ids">' + optionsHtml + '</datalist>';
    }

    panel.innerHTML =
      nodePicker +
      '<label class="block text-[11.5px] text-steel-500 mb-1">Output index</label>' +
      '<input type="number" data-output-index value="' +
      (current ? current.outputIndex : 0) +
      '" class="w-20 mb-2 rounded-md border border-steel-300 dark:border-steel-700 dark:bg-steel-800 px-2.5 py-1.5 text-[12.5px] font-mono" />' +
      '<div class="text-[12px] text-rose-700 dark:text-rose-300 mt-1 hidden" data-output-error></div>' +
      '<div class="flex justify-end gap-3 mt-2">' +
      '<button type="button" class="text-[12.5px] text-steel-500" data-output-cancel>Cancel</button>' +
      '<button type="button" class="text-[12.5px] font-semibold text-apple-700 dark:text-apple-300" data-output-save>Save</button>' +
      '</div>';

    return panel;
  }

  document.querySelectorAll('[data-field-mapping-list]').forEach(function (list) {
    var outputNodesEndpoint = list.getAttribute('data-output-nodes-endpoint');
    var resultOutputEndpoint = list.getAttribute('data-result-output-endpoint');
    if (!outputNodesEndpoint || !resultOutputEndpoint) return;
    var outputNodesPromise = request('GET', outputNodesEndpoint);

    list.addEventListener('click', function (event) {
      var editTrigger = event.target.closest('[data-output-edit]');
      if (!editTrigger) return;

      var row = editTrigger.closest('[data-output-row]');
      var existingPanel = row.querySelector('[data-output-panel]');
      if (existingPanel) {
        existingPanel.remove();
        return;
      }

      var summaryText = row.querySelector('[data-output-summary]').textContent.trim();
      var currentMatch = /^(\S+)\s*→\s*(\d+)$/.exec(summaryText);
      var current = currentMatch ? { nodeId: currentMatch[1], outputIndex: Number(currentMatch[2]) } : null;

      outputNodesPromise.then(function (data) {
        var panel = buildOutputPanel((data && data.candidates) || [], (data && data.allNodeIds) || [], current);
        panel.setAttribute('data-output-panel', '');
        row.appendChild(panel);

        var errorEl = panel.querySelector('[data-output-error]');
        var showError = function (message) {
          errorEl.textContent = message;
          errorEl.classList.remove('hidden');
        };

        panel.querySelector('[data-output-cancel]').addEventListener('click', function () {
          panel.remove();
        });

        panel.querySelector('[data-output-save]').addEventListener('click', function () {
          var nodeId = panel.querySelector('[data-output-node]').value.trim();
          var outputIndex = Number(panel.querySelector('[data-output-index]').value || 0);
          if (!nodeId) {
            showError('Choose a node.');
            return;
          }

          request('POST', resultOutputEndpoint, {
            nodeId: nodeId,
            outputIndex: outputIndex,
          })
            .then(function () {
              var summary = row.querySelector('[data-output-summary]');
              if (summary) summary.textContent = nodeId + ' → ' + outputIndex;
              panel.remove();
            })
            .catch(function (err) {
              showError(err.message);
            });
        });
      });
    });
  });
})();
