/**
 * debugDialogs.js — Modal dialogs for variable inspection in the debug panel.
 * 
 * Replaces three 1C managed forms:
 *   - конс_Просмотрщик           → ExpressionDialog  (tree viewer with expression input)
 *   - конс_ПросмотрЗначенияВыражения → StringDialog     (read-only string value)
 *   - конс_ПросмотрСодержимогоКоллекции → CollectionDialog (paginated table)
 *
 * Communication protocol:
 *   JS → 1C: sendEvent('EVENT_DIALOG_EVALUATE', { expression })
 *            sendEvent('EVENT_DIALOG_GET_COLLECTION_PAGE', { page, pageSize, address, variableName })
 *            sendEvent('EVENT_DIALOG_GET_VARIABLE_DATA', { variableName, variableId, variablePath })
 *   1C → JS: showExpressionDialog(expression)     — open / focus dialog
 *            updateExpressionResult(json)          — fill tree with evaluated result
 *            showStringDialog(value, title)        — open string viewer
 *            showCollectionDialog(json)            — open collection viewer
 *            updateCollectionPage(json)            — update table page
 */

// ─── Helpers ───────────────────────────────────────────────────────────

function _isDark() {
  return document.getElementById('display') &&
    document.getElementById('display').classList.contains('dark');
}

function _createOverlay(id) {
  let overlay = document.getElementById(id);
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'debug-dialog-overlay';
  document.body.appendChild(overlay);
  return overlay;
}

function _makeDraggable(dialog, handle) {
  let startX, startY, origLeft, origTop;

  handle.addEventListener('mousedown', function (e) {
    if (e.target.classList.contains('debug-dialog-close')) return;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    let rect = dialog.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onDragEnd);
  });

  function onDrag(e) {
    let dx = e.clientX - startX;
    let dy = e.clientY - startY;
    dialog.style.position = 'fixed';
    dialog.style.left = (origLeft + dx) + 'px';
    dialog.style.top = (origTop + dy) + 'px';
    dialog.style.margin = '0';
  }

  function onDragEnd() {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', onDragEnd);
  }
}

// ─── ExpressionDialog ──────────────────────────────────────────────────

/**
 * Modal dialog for evaluating expressions and viewing their structure as a tree.
 * Reuses the Treeview class from tree/tree.js.
 */
class ExpressionDialog {

  constructor() {
    this._overlay = null;
    this._dialog = null;
    this._input = null;
    this._treeContainer = null;
    this._statusEl = null;
    this._treeview = null;
    this._editorRef = null;
    this._build();
  }

  _build() {
    this._overlay = _createOverlay('expr-dialog-overlay');

    let html = `
      <div class="debug-dialog expr-dialog" id="expr-dialog">
        <div class="debug-dialog-header">
          <span class="debug-dialog-title" id="expr-dialog-title"></span>
          <button class="debug-dialog-close" title="Close">\u00d7</button>
        </div>
        <div class="expr-dialog-input-row">
          <input class="expr-dialog-input" id="expr-dialog-input" type="text"
                 placeholder="" autocomplete="off" spellcheck="false">
          <button class="expr-dialog-btn" id="expr-dialog-eval-btn"></button>
        </div>
        <div class="expr-result-summary" id="expr-result-summary">
          <span class="result-value" id="expr-result-value"></span>
          <span class="result-type" id="expr-result-type"></span>
        </div>
        <div class="expr-dialog-error" id="expr-dialog-error"></div>
        <div class="debug-dialog-body">
          <div class="expr-dialog-tree" id="expr-dialog-tree"></div>
          <div class="expr-dialog-status" id="expr-dialog-status"></div>
        </div>
      </div>`;

    this._overlay.innerHTML = html;
    this._dialog = this._overlay.querySelector('#expr-dialog');
    this._input = this._overlay.querySelector('#expr-dialog-input');
    this._treeContainer = this._overlay.querySelector('#expr-dialog-tree');
    this._statusEl = this._overlay.querySelector('#expr-dialog-status');
    this._summaryEl = this._overlay.querySelector('#expr-result-summary');
    this._errorEl = this._overlay.querySelector('#expr-dialog-error');

    let titleEl = this._overlay.querySelector('#expr-dialog-title');
    let evalBtn = this._overlay.querySelector('#expr-dialog-eval-btn');

    // Localized labels (engLang is a global from editor.js)
    let isEng = typeof engLang !== 'undefined' && engLang;
    titleEl.textContent = isEng ? 'Expression Viewer' : 'Просмотрщик выражений';
    evalBtn.textContent = isEng ? 'Evaluate' : 'Вычислить';
    this._input.placeholder = isEng ? 'Enter expression...' : 'Введите выражение...';
    this._statusEl.textContent = isEng ? 'Enter an expression and press Evaluate' : 'Введите выражение и нажмите Вычислить';

    // Theme
    this._applyTheme();

    // Draggable
    _makeDraggable(this._dialog, this._overlay.querySelector('.debug-dialog-header'));

    // Close button
    this._overlay.querySelector('.debug-dialog-close').addEventListener('click', () => this.close());

    // Click overlay backdrop to close
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });

    // Evaluate button
    evalBtn.addEventListener('click', () => this._evaluate());

    // Enter key in input
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._evaluate();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    // Keyboard: Escape to close
    this._overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  _applyTheme() {
    if (_isDark()) {
      this._overlay.classList.add('dark');
    } else {
      this._overlay.classList.remove('dark');
    }
  }

  _evaluate() {
    let expression = this._input.value.trim();
    if (!expression) return;

    let isEng = typeof engLang !== 'undefined' && engLang;
    this._statusEl.textContent = isEng ? 'Evaluating...' : 'Вычисление...';
    this._statusEl.classList.add('loading');
    this._statusEl.style.display = 'block';
    this._treeContainer.innerHTML = '';
    this._summaryEl.classList.remove('visible');
    this._errorEl.classList.remove('visible');

    if (this._treeview) {
      this._treeview.dispose();
      this._treeview = null;
    }

    sendEvent('EVENT_DIALOG_EVALUATE', { expression: expression });
  }

  /**
   * Open the dialog, optionally pre-filling the expression.
   * @param {string} [expression] — expression text
   * @param {object} [editorRef] — monaco editor instance (for Treeview)
   */
  open(expression, editorRef) {
    this._editorRef = editorRef || (typeof editor !== 'undefined' ? editor : null);
    this._applyTheme();
    this._overlay.classList.add('visible');

    if (expression) {
      this._input.value = expression;
      // Auto-evaluate on open if expression provided
      setTimeout(() => this._evaluate(), 50);
    } else {
      this._input.value = '';
    }
    this._input.focus();
  }

  /**
   * Update the tree with evaluation result from 1C.
   * @param {string|object} resultJSON — variable tree data (same format as showVariablesDescription)
   * @param {string} [errorText] — error message if evaluation failed
   */
  updateResult(resultJSON, errorText) {
    this._statusEl.classList.remove('loading');

    if (errorText) {
      this._statusEl.style.display = 'none';
      this._summaryEl.classList.remove('visible');
      this._errorEl.textContent = errorText;
      this._errorEl.classList.add('visible');
      this._treeContainer.innerHTML = '';
      return;
    }

    try {
      let data = typeof resultJSON === 'string' ? JSON.parse(resultJSON) : resultJSON;
      this._statusEl.style.display = 'none';
      this._errorEl.classList.remove('visible');

      // Strip labels from root-level nodes — the expression is already in the input field
      let keys = Object.keys(data);
      for (let i = 0; i < keys.length; i++) {
        if (data[keys[i]]) data[keys[i]].label = '';
      }

      // Extract first variable's value/type for the summary bar
      let firstKey = keys[0];
      if (firstKey && data[firstKey]) {
        let node = data[firstKey];
        let valueEl = this._overlay.querySelector('#expr-result-value');
        let typeEl = this._overlay.querySelector('#expr-result-type');
        valueEl.textContent = node.value || '';
        typeEl.textContent = node.type || '';
        this._summaryEl.classList.add('visible');
      } else {
        this._summaryEl.classList.remove('visible');
      }

      if (this._treeview) {
        this._treeview.dispose();
        this._treeview = null;
      }

      this._treeview = new Treeview('#expr-dialog-tree', this._editorRef, './tree/icons/');
      // Override sendEvent on the treeview's editor ref to route tree expand requests
      // through the dialog-specific event
      let origEditor = this._treeview.editor;
      if (origEditor) {
        let origSend = origEditor.sendEvent;
        this._treeview.editor = Object.create(origEditor);
        this._treeview.editor.sendEvent = function(eventName, eventParams) {
          if (eventName === 'EVENT_GET_VARIABLE_DATA') {
            return sendEvent('EVENT_DIALOG_GET_VARIABLE_DATA', eventParams);
          }
          return origSend.call(origEditor, eventName, eventParams);
        };
      }
      this._treeview.replaceData(data);
    } catch (e) {
      this._statusEl.textContent = 'Error: ' + e.message;
      this._statusEl.style.display = 'block';
    }
  }

  /**
   * Update a subtree node after lazy-load expand (same as updateVariableDescription).
   * @param {string} variableId
   * @param {string|object} variableJSON
   */
  updateSubtree(variableId, variableJSON) {
    try {
      let data = typeof variableJSON === 'string' ? JSON.parse(variableJSON) : variableJSON;
      if (this._treeview) {
        this._treeview.replaceData(data, variableId);
        this._treeview.open(variableId);
      }
    } catch (e) {
      console.error('ExpressionDialog.updateSubtree error:', e);
    }
  }

  close() {
    this._overlay.classList.remove('visible');
    if (this._treeview) {
      this._treeview.dispose();
      this._treeview = null;
    }
    this._treeContainer.innerHTML = '';
    this._summaryEl.classList.remove('visible');
    this._errorEl.classList.remove('visible');
    this._statusEl.classList.remove('loading');
    let isEng = typeof engLang !== 'undefined' && engLang;
    this._statusEl.textContent = isEng ? 'Enter an expression and press Evaluate' : 'Введите выражение и нажмите Вычислить';
    this._statusEl.style.display = 'block';
  }

  get isOpen() {
    return this._overlay && this._overlay.classList.contains('visible');
  }
}

// ─── StringDialog ──────────────────────────────────────────────────────

/**
 * Simple modal dialog for viewing a long string value.
 * Replaces конс_ПросмотрЗначенияВыражения.
 */
class StringDialog {

  constructor() {
    this._overlay = null;
    this._dialog = null;
    this._content = null;
    this._build();
  }

  _build() {
    this._overlay = _createOverlay('string-dialog-overlay');

    let isEng = typeof engLang !== 'undefined' && engLang;
    let title = isEng ? 'String Value' : 'Значение строки';

    let html = `
      <div class="debug-dialog string-dialog" id="string-dialog">
        <div class="debug-dialog-header">
          <span class="debug-dialog-title" id="string-dialog-title">${title}</span>
          <button class="debug-dialog-close" title="Close">\u00d7</button>
        </div>
        <div class="string-dialog-toolbar">
          <span class="str-info" id="string-dialog-info"></span>
          <button id="string-dialog-copy">${isEng ? 'Copy' : 'Копировать'}</button>
        </div>
        <div class="debug-dialog-body">
          <div class="string-dialog-lines">
            <div class="string-dialog-gutter" id="string-dialog-gutter"></div>
            <div class="string-dialog-content" id="string-dialog-content"></div>
          </div>
        </div>
      </div>`;

    this._overlay.innerHTML = html;
    this._dialog = this._overlay.querySelector('#string-dialog');
    this._content = this._overlay.querySelector('#string-dialog-content');
    this._gutter = this._overlay.querySelector('#string-dialog-gutter');
    this._infoEl = this._overlay.querySelector('#string-dialog-info');

    // Theme
    if (_isDark()) this._overlay.classList.add('dark');

    // Draggable
    _makeDraggable(this._dialog, this._overlay.querySelector('.debug-dialog-header'));

    // Close
    this._overlay.querySelector('.debug-dialog-close').addEventListener('click', () => this.close());
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });
    this._overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });

    // Copy button
    this._overlay.querySelector('#string-dialog-copy').addEventListener('click', () => {
      if (this._rawValue) {
        navigator.clipboard.writeText(this._rawValue).catch(function() {});
      }
    });

    this._rawValue = '';
  }

  /**
   * Open the dialog with a string value.
   * @param {string} value — the string to display
   * @param {string} [title] — optional custom title
   */
  open(value, title) {
    if (_isDark()) {
      this._overlay.classList.add('dark');
    } else {
      this._overlay.classList.remove('dark');
    }

    if (title) {
      this._overlay.querySelector('#string-dialog-title').textContent = title;
    }

    this._rawValue = value || '';
    this._content.textContent = this._rawValue;

    // Line numbers
    let lines = this._rawValue.split('\n');
    let gutterHTML = '';
    for (let i = 1; i <= lines.length; i++) {
      gutterHTML += i + '\n';
    }
    this._gutter.textContent = gutterHTML.trimEnd();

    // Info: chars + lines count
    let isEng = typeof engLang !== 'undefined' && engLang;
    this._infoEl.textContent = isEng
      ? `${this._rawValue.length} chars, ${lines.length} lines`
      : `${this._rawValue.length} симв., ${lines.length} строк`;

    this._overlay.classList.add('visible');
  }

  close() {
    this._overlay.classList.remove('visible');
    this._content.textContent = '';
    this._gutter.textContent = '';
    this._rawValue = '';
  }

  get isOpen() {
    return this._overlay && this._overlay.classList.contains('visible');
  }
}

// ─── CollectionDialog ──────────────────────────────────────────────────

/**
 * Modal dialog for viewing collection contents as a paginated table.
 * Replaces конс_ПросмотрСодержимогоКоллекции.
 */
class CollectionDialog {

  constructor() {
    this._overlay = null;
    this._dialog = null;
    this._tableWrap = null;
    this._pageInfo = null;
    this._btnPrev = null;
    this._btnNext = null;
    this._currentPage = 0;
    this._totalItems = 0;
    this._pageSize = 100;
    this._address = '';
    this._variableName = '';
    this._collectionType = '';
    this._build();
  }

  _build() {
    this._overlay = _createOverlay('collection-dialog-overlay');

    let isEng = typeof engLang !== 'undefined' && engLang;

    let html = `
      <div class="debug-dialog collection-dialog" id="collection-dialog">
        <div class="debug-dialog-header">
          <span class="debug-dialog-title" id="collection-dialog-title">${isEng ? 'Collection' : 'Коллекция'}</span>
          <button class="debug-dialog-close" title="Close">\u00d7</button>
        </div>
        <div class="collection-dialog-toolbar">
          <span class="page-info" id="collection-page-info"></span>
          <button id="collection-btn-prev" disabled>\u25c0</button>
          <button id="collection-btn-next" disabled>\u25b6</button>
        </div>
        <div class="debug-dialog-body">
          <div class="collection-table-wrap" id="collection-table-wrap"></div>
        </div>
      </div>`;

    this._overlay.innerHTML = html;
    this._dialog = this._overlay.querySelector('#collection-dialog');
    this._tableWrap = this._overlay.querySelector('#collection-table-wrap');
    this._pageInfo = this._overlay.querySelector('#collection-page-info');
    this._btnPrev = this._overlay.querySelector('#collection-btn-prev');
    this._btnNext = this._overlay.querySelector('#collection-btn-next');

    // Theme
    if (_isDark()) this._overlay.classList.add('dark');

    // Draggable
    _makeDraggable(this._dialog, this._overlay.querySelector('.debug-dialog-header'));

    // Close
    this._overlay.querySelector('.debug-dialog-close').addEventListener('click', () => this.close());
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });
    this._overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });

    // Pagination
    this._btnPrev.addEventListener('click', () => {
      if (this._currentPage > 0) {
        this._currentPage--;
        this._requestPage();
      }
    });

    this._btnNext.addEventListener('click', () => {
      let maxPage = Math.max(0, Math.ceil(this._totalItems / this._pageSize) - 1);
      if (this._currentPage < maxPage) {
        this._currentPage++;
        this._requestPage();
      }
    });
  }

  _requestPage() {
    sendEvent('EVENT_DIALOG_GET_COLLECTION_PAGE', {
      page: this._currentPage,
      pageSize: this._pageSize,
      address: this._address,
      variableName: this._variableName
    });
    this._updatePageInfo();
  }

  _updatePageInfo() {
    let isEng = typeof engLang !== 'undefined' && engLang;
    let totalPages = Math.max(1, Math.ceil(this._totalItems / this._pageSize));
    let currentDisplay = this._currentPage + 1;
    let from = this._currentPage * this._pageSize;
    let to = Math.min(from + this._pageSize, this._totalItems);

    if (this._totalItems > 0) {
      this._pageInfo.textContent = (isEng
        ? `${from + 1}–${to} of ${this._totalItems}  (page ${currentDisplay}/${totalPages})`
        : `${from + 1}–${to} из ${this._totalItems}  (стр. ${currentDisplay}/${totalPages})`);
    } else {
      this._pageInfo.textContent = isEng ? 'Empty collection' : 'Пустая коллекция';
    }

    this._btnPrev.disabled = this._currentPage <= 0;
    this._btnNext.disabled = this._currentPage >= totalPages - 1;
  }

  /**
   * Open the dialog with collection metadata.
   * @param {object} params
   *   @param {string} params.type — collection type (e.g. "ТаблицаЗначений")
   *   @param {string} params.variableName — full path of the variable
   *   @param {number} params.totalItems — total number of items
   *   @param {string} params.address — temp storage address for server-side paging
   *   @param {Array}  [params.columns] — column definitions [{name, title, type}]
   *   @param {Array}  [params.rows] — first page of data
   */
  open(params) {
    if (_isDark()) {
      this._overlay.classList.add('dark');
    } else {
      this._overlay.classList.remove('dark');
    }

    this._collectionType = params.type || '';
    this._variableName = params.variableName || '';
    this._totalItems = params.totalItems || 0;
    this._address = params.address || '';
    this._currentPage = 0;
    this._pageSize = params.pageSize || 100;

    let isEng = typeof engLang !== 'undefined' && engLang;
    let titleEl = this._overlay.querySelector('#collection-dialog-title');
    titleEl.textContent = (this._variableName || (isEng ? 'Collection' : 'Коллекция'))
      + (this._collectionType ? ' {' + this._collectionType + '}' : '');

    this._updatePageInfo();
    this._overlay.classList.add('visible');

    // Render first page if rows provided
    if (params.columns || params.rows) {
      this._renderTable(params.columns || [], params.rows || []);
    } else {
      this._tableWrap.innerHTML = '';
      // Request first page from 1C
      this._requestPage();
    }
  }

  /**
   * Update the table with page data from 1C.
   * @param {string|object} dataJSON
   *   @param {Array} data.columns — [{name, title, type}]
   *   @param {Array} data.rows — [{col1: val1, col2: val2, ...}]
   *   @param {number} [data.totalItems] — updated total if changed
   */
  updatePage(dataJSON) {
    try {
      let data = typeof dataJSON === 'string' ? JSON.parse(dataJSON) : dataJSON;
      if (data.totalItems !== undefined) {
        this._totalItems = data.totalItems;
        this._updatePageInfo();
      }
      this._renderTable(data.columns || [], data.rows || []);
    } catch (e) {
      console.error('CollectionDialog.updatePage error:', e);
    }
  }

  _renderTable(columns, rows) {
    if (!columns.length && rows.length > 0) {
      // Auto-detect columns from first row
      columns = Object.keys(rows[0]).map(function (k) {
        return { name: k, title: k };
      });
    }

    let isEng = typeof engLang !== 'undefined' && engLang;
    let startIndex = this._currentPage * this._pageSize;

    let table = document.createElement('table');
    table.className = 'collection-table';

    // Header
    let thead = document.createElement('thead');
    let headerRow = document.createElement('tr');
    let thIdx = document.createElement('th');
    thIdx.textContent = '#';
    headerRow.appendChild(thIdx);
    columns.forEach(function (col) {
      let th = document.createElement('th');
      th.textContent = col.title || col.name;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    let tbody = document.createElement('tbody');
    rows.forEach(function (row, index) {
      let tr = document.createElement('tr');
      let tdIdx = document.createElement('td');
      tdIdx.textContent = String(startIndex + index);
      tdIdx.style.color = '#999';
      tr.appendChild(tdIdx);
      columns.forEach(function (col) {
        let td = document.createElement('td');
        let cellValue = row[col.name];
        if (cellValue !== undefined && cellValue !== null) {
          if (typeof cellValue === 'object') {
            // Reference or complex value
            if (cellValue.presentation) {
              td.textContent = cellValue.presentation;
              if (cellValue.isRef) {
                td.className = 'coll-ref';
                td.dataset.refType = cellValue.type || '';
                td.dataset.refPath = cellValue.path || '';
              }
            } else {
              td.textContent = JSON.stringify(cellValue);
            }
          } else {
            td.textContent = String(cellValue);
          }
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    this._tableWrap.innerHTML = '';
    this._tableWrap.appendChild(table);

    if (rows.length === 0) {
      let empty = document.createElement('div');
      empty.className = 'expr-dialog-status';
      empty.textContent = isEng ? 'No data' : 'Нет данных';
      this._tableWrap.appendChild(empty);
    }
  }

  close() {
    this._overlay.classList.remove('visible');
    this._tableWrap.innerHTML = '';
    this._currentPage = 0;
    this._totalItems = 0;
    this._address = '';
    this._variableName = '';
  }

  get isOpen() {
    return this._overlay && this._overlay.classList.contains('visible');
  }
}

// ─── Singleton instances (created lazily) ──────────────────────────────

var _expressionDialog = null;
var _stringDialog = null;
var _collectionDialog = null;

function getExpressionDialog() {
  if (!_expressionDialog) _expressionDialog = new ExpressionDialog();
  return _expressionDialog;
}

function getStringDialog() {
  if (!_stringDialog) _stringDialog = new StringDialog();
  return _stringDialog;
}

function getCollectionDialog() {
  if (!_collectionDialog) _collectionDialog = new CollectionDialog();
  return _collectionDialog;
}
