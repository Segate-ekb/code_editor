require.config( { 'vs/nls': { availableLanguages: { '*': "ru" } } } );

define(['bslGlobals', 'bslMetadata', 'snippets', 'bsl_language', 'vs/editor/editor.main', 'actions', 'bslQuery', 'bslDCS', 'colors'], function () {

  // #region global vars 
  selectionText = '';
  engLang = false;
  contextData = new Map();
  readOnlyMode = false;
  queryMode = false;
  DCSMode = false;
  version1C = '';
  contextActions = [];
  customHovers = {};
  customSignatures = {};
  customCodeLenses = [];
  originalText = '';
  metadataRequests = new Map();
  customSuggestions = [];
  contextMenuEnabled = false;
  err_tid = 0;
  suggestObserver = null;
  signatureObserver = null;
  definitionObserver = null;
  statusBarWidget = null;
  ctrlPressed = false;
  altPressed = false;
  shiftPressed = false;  
  signatureVisible = true;
  currentBookmark = -1;
  currentMarker = -1;
  activeSuggestionAcceptors = [];
  diffEditor = null;  
  inlineDiffEditor = null;
  inlineDiffWidget = null;
  events_queue = [];
  editor_options = [];
  snippets = {};
  treeview = null;
  // debugger state
  debugModeFlag = 0;
  debugBreakpoints = new Map();
  debugCurrentLine = null;
  debugDecorations = [];
  debugUsingDebugger = false;
  debugGlyphListenerAttached = false;
  debugToolbarElement = null;
  debugStopOnError = false;
  debugToolbarDockSide = 'top';
  debugToolbarDockOffset = 0.5;
  debugPanelCollapsed = false;
  debugCustomExpressions = [];
  debugLastVariablesData = null;
  schemaRegistry = new Map();
  // #endregion

  // #region public API
  reserMark = function() {

    clearInterval(err_tid);
    editor.updateDecorations([]);

  }

  sendEvent = function(eventName, eventParams) {

    console.debug(eventName, eventParams);
    let lastEvent = new MouseEvent('click');
    lastEvent.eventData1C = {event : eventName, params: eventParams};
    return dispatchEvent(lastEvent);
    // The new event model is disabled until fix https://github.com/salexdv/bsl_console/issues/#217
    events_queue.push({event : eventName, params: eventParams});
    document.getElementById('event-button').click();
    
  }

  setText = function(txt, range, usePadding) {

    editor.pushUndoStop();
    
    editor.checkBookmarks = false;

    reserMark();    
    bslHelper.setText(txt, range, usePadding);
    
    if (getText())
      checkBookmarksCount();
    else
      removeAllBookmarks();
    
    editor.checkBookmarks = true;

  }
  
  updateText = function(txt, clearUndoHistory = true) {

    let read_only = readOnlyMode;
    let mod_event = getOption('generateModificationEvent');
    editor.checkBookmarks = false;   

    reserMark();  

    if (read_only)
      setReadOnly(false);

    if (mod_event)    
      setOption('generateModificationEvent', false);

    eraseTextBeforeUpdate();
    
    if (clearUndoHistory)
      editor.setValue(txt);
    else
      setText(txt);

    if (getText())
      checkBookmarksCount();
    else
      removeAllBookmarks();

    if (mod_event)    
      setOption('generateModificationEvent', true);

    if (read_only)
      setReadOnly(true);

    editor.checkBookmarks = true;

  }

  setContent = function(text) {

    let read_only = readOnlyMode;
    let mod_event = getOption('generateModificationEvent');
    
    if (read_only)
      setReadOnly(false);

    if (mod_event)    
      setOption('generateModificationEvent', false);

    editor.setValue(text)

    if (mod_event)    
      setOption('generateModificationEvent', true);

    if (read_only)
      setReadOnly(true);

  }

  eraseText = function () {
    
    setText('', editor.getModel().getFullModelRange(), false);    

  }

  getText = function(txt) {

    return getActiveEditor().getValue();

  }

  getQuery = function () {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getQuery();

  }

  getFormatString = function () {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getFormatString();

  }

  updateMetadata = function (metadata, path = '') {
        
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.updateMetadata(metadata, path);

  }

  parseCommonModule = function (moduleName, moduleText, isGlobal = false) {

    return bslHelper.parseCommonModule(moduleName, moduleText, isGlobal);

  }

  parseMetadataModule = function (moduleText, path) {

    return bslHelper.parseMetadataModule(moduleText, path);

  }  

  updateSnippets = function (snips, replace = false) {
        
    return bslHelper.updateSnippets(snips, replace);    

  }

  updateCustomFunctions = function (data) {
        
    return bslHelper.updateCustomFunctions(data);

  }

  /**
   * Registers a variable with OpenAPI/JSON-Schema type
   * for intellisense on Map/Structure operations.
   * 
   * @param {string} variableName - variable name in code (case-insensitive)
   * @param {string|object} schema - OpenAPI spec (JSON string or object) 
   * @param {string} typeName - schema/component name (e.g. "Pet", "Error")
   * 
   * @returns {true|object} true on success, {errorDescription} on failure
   */
  setVariableSchema = function (variableName, schema, typeName) {

    try {
      return bslHelper.setVariableSchema(variableName, schema, typeName);
    }
    catch (e) {
      return { errorDescription: e.message };
    }

  }

  /**
   * Removes schema binding for a variable
   * 
   * @param {string} variableName - variable name
   */
  removeVariableSchema = function (variableName) {

    schemaRegistry.delete(variableName.toLowerCase());

  }

  /**
   * Removes all schema bindings
   */
  clearVariableSchemas = function () {

    schemaRegistry.clear();

  }

  /**
   * Loads an OpenAPI / Swagger / JSON-Schema file and registers
   * all found types as variables in the schema registry.
   *
   * For OpenAPI 3.x  — iterates components.schemas
   * For Swagger 2.x  — iterates definitions
   * For plain JSON Schema — uses schema.title or "Schema"
   *
   * Additionally registers the variables with updateMetadata
   * so they appear in basic autocomplete.
   *
   * @param {string|object} schema - JSON string or parsed object
   * @returns {string} comma-separated list of registered type names
   */
  loadSchemaFile = function (schema) {

    try {

      let schemaObj = (typeof schema === 'string') ? JSON.parse(schema) : schema;
      let registeredTypes = [];

      // OpenAPI 3.x
      if (schemaObj.openapi && schemaObj.components && schemaObj.components.schemas) {
        let schemas = schemaObj.components.schemas;
        for (let typeName in schemas) {
          if (schemas.hasOwnProperty(typeName)) {
            let result = bslHelper.setVariableSchema(typeName, schemaObj, typeName);
            if (result === true) registeredTypes.push(typeName);
          }
        }
      }
      // Swagger 2.x
      else if (schemaObj.swagger && schemaObj.definitions) {
        let defs = schemaObj.definitions;
        for (let typeName in defs) {
          if (defs.hasOwnProperty(typeName)) {
            let result = bslHelper.setVariableSchema(typeName, schemaObj, typeName);
            if (result === true) registeredTypes.push(typeName);
          }
        }
      }
      // Plain JSON Schema
      else if (schemaObj.type || schemaObj.properties || schemaObj.$ref) {
        let name = schemaObj.title || 'Schema';
        let result = bslHelper.setVariableSchema(name, schemaObj, name);
        if (result === true) registeredTypes.push(name);
      }

      // Register as autocomplete variables via updateMetadata
      if (registeredTypes.length) {
        let customObjects = {};
        for (let i = 0; i < registeredTypes.length; i++) {
          customObjects[registeredTypes[i]] = { properties: {} };
        }
        let bsl = new bslHelper(editor.getModel(), editor.getPosition());
        bsl.updateMetadata(JSON.stringify({ customObjects: customObjects }));
      }

      return registeredTypes.join(',');

    }
    catch (e) {
      return '';
    }

  }

  setTheme = function (theme) {
        
    monaco.editor.setTheme(theme);
    setThemeVariablesDisplay(theme);

  }

  setReadOnly = function (readOnly) {

    readOnlyMode = readOnly;
    editor.updateOptions({ readOnly: readOnly });

    if (contextMenuEnabled)
      editor.updateOptions({ contextmenu: !readOnly });
    
  }

  getReadOnly = function () {

    return readOnlyMode;

  }

  switchLang = function (language) {
    
    if (language == undefined)
      engLang = !engLang;
    else
      engLang = (language == 'en');

    return engLang ? 'en' : 'ru';
    
  }

  addComment = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.addComment();

  }

  removeComment = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.removeComment();
    
  }

  markError = function (line, column) {
    reserMark();
    editor.timer_count = 12;
    err_tid = setInterval(function () {
      let newDecor = [];
      if (editor.timer_count % 2 == 0) {
        newDecor.push(
          { range: new monaco.Range(line, 1, line), options: { isWholeLine: true, inlineClassName: 'error-string' } }
        );
        newDecor.push(
          { range: new monaco.Range(line, 1, line), options: { isWholeLine: true, linesDecorationsClassName: 'error-mark' } },
        );
      }
      editor.timer_count--;
      editor.updateDecorations(newDecor);
      if (editor.timer_count == 0) {
        clearInterval(err_tid);
      }
    }, 300);
    editor.revealLineInCenter(line);
    editor.setPosition(new monaco.Position(line, column));
  }

  findText = function (string) {
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());
    return bsl.findText(string);
  }

  init = function(version) {

    version1C = version;
    initContextMenuActions();
    editor.layout();

  }

  enableQuickSuggestions = function (enabled) {

    editor.updateOptions({ quickSuggestions: enabled });

  }

  minimap = function (enabled) {

    editor.updateOptions({ minimap: { enabled: enabled } });
    
  }

  addContextMenuItem = function(label, eventName) {

    let time = new Date().getTime();
    let id = time.toString() + '.' + Math.random().toString(36).substring(8);
    editor.addAction({
      id: id + "_bsl",
      label: label,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: time,
      run: function () {     
          sendEvent(eventName, "");
          return null;
      }
    });

  }

  isQueryMode = function() {

    return getCurrentLanguageId() == 'bsl_query';

  }

  isDCSMode = function() {

    return getCurrentLanguageId() == 'dcs_query';

  }

  setLanguageMode = function(mode) {

    let isCompareMode = (editor.navi != undefined);

    queryMode = (mode == 'bsl_query');
    DCSMode = (mode == 'dcs_query');

    if (queryMode || DCSMode)
      editor.updateOptions({ foldingStrategy: "indentation" });
    else
      editor.updateOptions({ foldingStrategy: "auto" });

    if (isCompareMode) {
      monaco.editor.setModelLanguage(editor.getModifiedEditor().getModel(), mode);
      monaco.editor.setModelLanguage(editor.getOriginalEditor().getModel(), mode);
    }
    else {
      monaco.editor.setModelLanguage(editor.getModel(), mode);
    }

    let currentTheme = getCurrentThemeName();
    setTheme(currentTheme);

    initContextMenuActions();

  }

  // #region debugger public API

  setUsingDebugger = function (enabled) {

    debugUsingDebugger = enabled;

    if (enabled) {
      editor.updateOptions({ glyphMargin: true });
      createDebugToolbar();
    } else {
      editor.updateOptions({ glyphMargin: false });
      removeDebugToolbar();
    }

    initContextMenuActions();

  }

  updateBreakpoints = function (line) {

    if (line != undefined) {
      if (debugBreakpoints.has(line)) {
        debugBreakpoints.delete(line);
      } else {
        debugBreakpoints.set(line, { enabled: true });
      }
    }

    refreshDebugDecorations();
    sendEvent('EVENT_UPDATE_BREAKPOINTS', getBreakpoints());

  }

  getBreakpoints = function () {

    return JSON.stringify([...debugBreakpoints.keys()].sort((a, b) => a - b));

  }

  removeAllBreakpoints = function () {

    debugBreakpoints.clear();
    refreshDebugDecorations();
    sendEvent('EVENT_REMOVE_ALL_BREAKPOINTS', '[]');

  }

  setCurrentDebugLine = function (line) {

    debugCurrentLine = line;
    refreshDebugDecorations();

  }

  deleteCurrentDebugLine = function () {

    debugCurrentLine = null;
    refreshDebugDecorations();

  }

  setDebugMode = function (mode) {

    debugModeFlag = mode;
    updateDebugToolbarVisibility();
    updateCommandBarVisibility();
    if (mode) {
      editor.updateOptions({ readOnly: true });
    } else {
      editor.updateOptions({ readOnly: readOnlyMode });
      deleteCurrentDebugLine();
      // Don't hide panel — keep messages/errors visible after execution
    }

  }

  isDebugMode = function () {

    return debugModeFlag;

  }

  startDebugging = function () {

    // Export lezer tokens for the 1C compiler to bypass its own lexer.
    // bslAstService already has the parsed tree (updated on every edit).
    let tokensJSON = '';
    if (typeof bslAstService !== 'undefined' && bslAstService.getTree()) {
      try {
        let tokens = bslAstService.exportTokens();
        if (tokens && tokens.length > 0) {
          tokensJSON = JSON.stringify(tokens);
        }
      } catch (e) {
        console.warn('Failed to export lezer tokens:', e);
      }
    }

    sendEvent('EVENT_START_DEBUGGING', tokensJSON);

  }

  continueDebugging = function () {

    sendEvent('EVENT_CONTINUE_DEBUGGING', '');

  }

  stepOver = function () {

    sendEvent('EVENT_STEP_OVER', '');

  }

  stepInto = function () {

    sendEvent('EVENT_STEP_INTO', '');

  }

  stopDebugging = function () {

    sendEvent('EVENT_STOP_DEBUGGING', '');

  }

  evaluateExpression = function () {

    let expression = getSelectedText() || '';
    sendEvent('EVENT_EVALUATE_EXPRESSION', expression);

  }

  // #region Debug dialog public API (called from 1C)

  /**
   * Opens the expression viewer dialog.
   * Called from 1C instead of opening the конс_Просмотрщик form.
   * @param {string} [expression] — expression to evaluate
   */
  showExpressionDialog = function (expression) {
    getExpressionDialog().open(expression, editor);
  }

  /**
   * Updates the expression dialog tree with evaluation result from 1C.
   * Called from 1C after evaluating the expression on the server.
   * @param {string} resultJSON — variable tree JSON (same format as showVariablesDescription)
   * @param {string} [errorText] — error message if evaluation failed
   */
  updateExpressionResult = function (resultJSON, errorText) {
    getExpressionDialog().updateResult(resultJSON, errorText);
  }

  /**
   * Updates a subtree node in the expression dialog after lazy-load expand.
   * @param {string} variableId — id of the summary element
   * @param {string} variableJSON — children data JSON
   */
  updateDialogSubtree = function (variableId, variableJSON) {
    getExpressionDialog().updateSubtree(variableId, variableJSON);
  }

  /**
   * Opens a read-only string value viewer dialog.
   * Called from 1C instead of opening the конс_ПросмотрЗначенияВыражения form.
   * @param {string} value — the string to display
   * @param {string} [title] — optional dialog title
   */
  showStringDialog = function (value, title) {
    getStringDialog().open(value, title);
  }

  /**
   * Opens the collection viewer dialog with initial data.
   * Called from 1C instead of opening the конс_ПросмотрСодержимогоКоллекции form.
   * @param {string} paramsJSON — JSON: {type, variableName, totalItems, address, columns, rows, pageSize}
   */
  showCollectionDialog = function (paramsJSON) {
    try {
      let params = typeof paramsJSON === 'string' ? JSON.parse(paramsJSON) : paramsJSON;
      getCollectionDialog().open(params);
    } catch (e) {
      console.error('showCollectionDialog error:', e);
    }
  }

  /**
   * Updates the collection dialog with a new page of data.
   * Called from 1C in response to EVENT_DIALOG_GET_COLLECTION_PAGE.
   * @param {string} dataJSON — JSON: {columns, rows, totalItems}
   */
  updateCollectionPage = function (dataJSON) {
    getCollectionDialog().updatePage(dataJSON);
  }

  // #endregion

  toggleStopOnError = function () {

    debugStopOnError = !debugStopOnError;
    updateStopOnErrorButton();
    sendEvent('EVENT_TOGGLE_STOP_ON_ERROR', debugStopOnError ? '1' : '0');

  }

  getStopOnError = function () {

    return debugStopOnError;

  }

  function updateStopOnErrorButton() {

    let btn = document.getElementById('debug-btn-stoponerror');
    if (!btn) return;
    if (debugStopOnError) {
      btn.classList.add('active');
      btn.title = 'Остановка по ошибке (вкл.)';
    } else {
      btn.classList.remove('active');
      btn.title = 'Остановка по ошибке (выкл.)';
    }

  }

  function refreshDebugDecorations() {

    let decor = [];

    debugBreakpoints.forEach(function (value, line) {
      let glyphClass = value.enabled ? 'debug-breakpoint' : 'debug-breakpoint-disabled';
      decor.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: glyphClass,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
    });

    if (debugCurrentLine) {
      decor.push({
        range: new monaco.Range(debugCurrentLine, 1, debugCurrentLine, 1),
        options: {
          isWholeLine: true,
          className: 'debug-current-line',
          glyphMarginClassName: 'debug-current-arrow',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
    }

    debugDecorations = editor.deltaDecorations(debugDecorations, decor);

  }

  var flashDecorations = [];

  function flashEditorLine(line, cssClass, duration) {
    // Remove any previous flash
    if (flashDecorations.length) {
      flashDecorations = editor.deltaDecorations(flashDecorations, []);
    }
    flashDecorations = editor.deltaDecorations([], [{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: cssClass,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }]);
    setTimeout(function() {
      flashDecorations = editor.deltaDecorations(flashDecorations, []);
    }, duration || 1500);
  }

  function createDebugToolbar() {

    if (debugToolbarElement) return;

    debugToolbarElement = document.createElement('div');
    debugToolbarElement.className = 'debug-toolbar';
    debugToolbarElement.innerHTML = `
      <div class="debug-toolbar-drag-handle" title="Перетащите для перемещения">⠇</div>
      <button class="debug-toolbar-button" id="debug-btn-start" title="Начать отладку (F5)">
        <svg viewBox="0 0 16 16"><polygon points="3,1 13,8 3,15" fill="#388a34"/></svg>
      </button>
      <button class="debug-toolbar-button" id="debug-btn-continue" title="Продолжить (F5)" disabled>
        <svg viewBox="0 0 16 16">
          <rect x="2" y="2" width="3" height="12" fill="#388a34"/>
          <polygon points="7,2 15,8 7,14" fill="#388a34"/>
        </svg>
      </button>
      <button class="debug-toolbar-button" id="debug-btn-stepover" title="Шагнуть через (F10)" disabled>
        <svg viewBox="0 0 16 16">
          <circle cx="12" cy="12" r="2" fill="#388a34"/>
          <path d="M2,8 Q2,3 7,3 L7,1 L11,4 L7,7 L7,5 Q4,5 4,8" stroke="#388a34" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
      <button class="debug-toolbar-button" id="debug-btn-stepinto" title="Шагнуть в (F11)" disabled>
        <svg viewBox="0 0 16 16">
          <circle cx="8" cy="13" r="2" fill="#388a34"/>
          <polyline points="8,2 8,9" stroke="#388a34" stroke-width="2" fill="none"/>
          <polyline points="5,6 8,9 11,6" stroke="#388a34" stroke-width="2" fill="none"/>
        </svg>
      </button>
      <div class="debug-toolbar-separator"></div>
      <button class="debug-toolbar-button" id="debug-btn-stop" title="Остановить (Shift+F5)" disabled>
        <svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" fill="#e51400"/></svg>
      </button>
      <button class="debug-toolbar-button" id="debug-btn-evaluate" title="Вычислить выражение (Shift+F9)" disabled>
        <svg viewBox="0 0 16 16">
          <rect x="1" y="3" width="14" height="10" rx="1" fill="none" stroke="#388a34" stroke-width="1.3"/>
          <text x="8" y="10.5" text-anchor="middle" font-size="7" font-weight="bold" fill="#388a34" font-family="monospace">=?</text>
        </svg>
      </button>
      <div class="debug-toolbar-separator"></div>
      <button class="debug-toolbar-button" id="debug-btn-stoponerror" title="Остановка по ошибке">
        <svg viewBox="0 0 16 16">
          <circle cx="8" cy="5" r="4" fill="none" stroke="#e51400" stroke-width="1.5"/>
          <line x1="8" y1="3" x2="8" y2="5.5" stroke="#e51400" stroke-width="1.5"/>
          <circle cx="8" cy="7" r="0.6" fill="#e51400"/>
          <path d="M3,10 L8,15 L13,10" stroke="#e51400" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
    `;

    document.body.appendChild(debugToolbarElement);
    debugToolbarElement.classList.add('visible');

    // Apply saved dock position
    snapDebugToolbar(debugToolbarDockSide, debugToolbarDockOffset);

    // Setup drag
    setupDebugToolbarDrag(debugToolbarElement);

    window.addEventListener('resize', onDebugToolbarWindowResize);

    document.getElementById('debug-btn-start').addEventListener('click', function () {
      if (!this.disabled) startDebugging();
    });
    document.getElementById('debug-btn-continue').addEventListener('click', function () {
      if (!this.disabled) continueDebugging();
    });
    document.getElementById('debug-btn-stepover').addEventListener('click', function () {
      if (!this.disabled) stepOver();
    });
    document.getElementById('debug-btn-stepinto').addEventListener('click', function () {
      if (!this.disabled) stepInto();
    });
    document.getElementById('debug-btn-stop').addEventListener('click', function () {
      if (!this.disabled) stopDebugging();
    });
    document.getElementById('debug-btn-evaluate').addEventListener('click', function () {
      if (!this.disabled) evaluateExpression();
    });
    document.getElementById('debug-btn-stoponerror').addEventListener('click', function () {
      toggleStopOnError();
    });

  }

  function removeDebugToolbar() {

    if (debugToolbarElement) {
      debugToolbarElement.remove();
      debugToolbarElement = null;
    }
    window.removeEventListener('resize', onDebugToolbarWindowResize);

  }

  // --- Debug toolbar drag & snap logic ---

  function getDebugToolbarBounds() {
    let displayEl = document.getElementById('display');
    let displayVisible = displayEl && displayEl.style.display !== 'none' && parseFloat(displayEl.style.height) > 0;
    let bottomLimit = displayVisible ? displayEl.getBoundingClientRect().top : window.innerHeight;
    return { top: 0, left: 0, right: window.innerWidth, bottom: bottomLimit };
  }

  function setDebugToolbarDockClass(toolbar, side) {
    toolbar.classList.remove('docked-top', 'docked-bottom', 'docked-left', 'docked-right');
    toolbar.classList.add('docked-' + side);
  }

  function snapDebugToolbar(side, offset) {
    if (!debugToolbarElement) return;
    let tb = debugToolbarElement;
    let bounds = getDebugToolbarBounds();

    tb.style.transform = 'none';
    setDebugToolbarDockClass(tb, side);

    // Force reflow so flex-direction change applies before measurement
    void tb.offsetWidth;
    let tbRect = tb.getBoundingClientRect();
    let tbW = tbRect.width;
    let tbH = tbRect.height;

    let areaW = bounds.right - bounds.left;
    let areaH = bounds.bottom - bounds.top;

    if (side === 'top' || side === 'bottom') {
      let maxLeft = areaW - tbW;
      let leftPos = offset * areaW - tbW / 2;
      leftPos = Math.max(0, Math.min(leftPos, maxLeft));
      tb.style.left = leftPos + 'px';
      if (side === 'top') {
        tb.style.top = '0px';
      } else {
        tb.style.top = (bounds.bottom - tbH) + 'px';
      }
    } else {
      let maxTop = areaH - tbH;
      let topPos = offset * areaH - tbH / 2;
      topPos = Math.max(0, Math.min(topPos, maxTop));
      tb.style.top = (bounds.top + topPos) + 'px';
      if (side === 'left') {
        tb.style.left = '0px';
      } else {
        tb.style.left = (bounds.right - tbW) + 'px';
      }
    }

    debugToolbarDockSide = side;
    debugToolbarDockOffset = offset;
  }

  function setupDebugToolbarDrag(toolbar) {
    let handle = toolbar.querySelector('.debug-toolbar-drag-handle');
    if (!handle) return;

    let startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      let rect = toolbar.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      toolbar.classList.add('dragging');
      toolbar.classList.remove('docked-top', 'docked-bottom', 'docked-left', 'docked-right');
      toolbar.style.flexDirection = 'row';
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', onDragEnd);
    });

    function onDrag(e) {
      let dx = e.clientX - startX;
      let dy = e.clientY - startY;
      let bounds = getDebugToolbarBounds();
      let tbRect = toolbar.getBoundingClientRect();

      let newLeft = origLeft + dx;
      let newTop = origTop + dy;

      newLeft = Math.max(bounds.left, Math.min(newLeft, bounds.right - tbRect.width));
      newTop = Math.max(bounds.top, Math.min(newTop, bounds.bottom - tbRect.height));

      toolbar.style.left = newLeft + 'px';
      toolbar.style.top = newTop + 'px';
      toolbar.style.transform = 'none';
    }

    function onDragEnd() {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onDragEnd);
      toolbar.classList.remove('dragging');
      toolbar.style.flexDirection = '';

      let bounds = getDebugToolbarBounds();
      let tbRect = toolbar.getBoundingClientRect();
      let cx = tbRect.left + tbRect.width / 2;
      let cy = tbRect.top + tbRect.height / 2;

      let distTop = tbRect.top - bounds.top;
      let distBottom = bounds.bottom - tbRect.bottom;
      let distLeft = tbRect.left - bounds.left;
      let distRight = bounds.right - tbRect.right;

      let minDist = Math.min(distTop, distBottom, distLeft, distRight);
      let side, offset;

      let areaW = bounds.right - bounds.left;
      let areaH = bounds.bottom - bounds.top;

      if (minDist === distTop) {
        side = 'top';
        offset = areaW > 0 ? cx / areaW : 0.5;
      } else if (minDist === distBottom) {
        side = 'bottom';
        offset = areaW > 0 ? cx / areaW : 0.5;
      } else if (minDist === distLeft) {
        side = 'left';
        offset = areaH > 0 ? (cy - bounds.top) / areaH : 0.5;
      } else {
        side = 'right';
        offset = areaH > 0 ? (cy - bounds.top) / areaH : 0.5;
      }

      offset = Math.max(0, Math.min(1, offset));
      snapDebugToolbar(side, offset);
    }
  }

  function onDebugToolbarWindowResize() {
    if (debugToolbarElement) {
      snapDebugToolbar(debugToolbarDockSide, debugToolbarDockOffset);
    }
  }

  function resnapDebugToolbar() {
    if (debugToolbarElement) {
      requestAnimationFrame(function() {
        snapDebugToolbar(debugToolbarDockSide, debugToolbarDockOffset);
      });
    }
  }

  function updateDebugToolbarVisibility() {

    if (!debugToolbarElement) return;

    let btnStart = document.getElementById('debug-btn-start');
    let btnContinue = document.getElementById('debug-btn-continue');
    let btnStepOver = document.getElementById('debug-btn-stepover');
    let btnStepInto = document.getElementById('debug-btn-stepinto');
    let btnStop = document.getElementById('debug-btn-stop');
    let btnEvaluate = document.getElementById('debug-btn-evaluate');

    if (debugModeFlag) {
      btnStart.disabled = true;
      btnContinue.disabled = false;
      btnStepOver.disabled = false;
      btnStepInto.disabled = false;
      btnStop.disabled = false;
      btnEvaluate.disabled = false;
    } else {
      btnStart.disabled = false;
      btnContinue.disabled = true;
      btnStepOver.disabled = true;
      btnStepInto.disabled = true;
      btnStop.disabled = true;
      btnEvaluate.disabled = true;
    }

  }

  // #endregion

  getCurrentLanguageId = function() {

    let identifier = getActiveEditor().getModel().getLanguageIdentifier();
    return identifier.language;

  }

  getSelectedText = function() {

    const active_editor = getActiveEditor();
    const model = active_editor.getModel();
    const selection = active_editor.getSelection();
    
    return model.getValueInRange(selection);

  }

  addWordWrap = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.addWordWrap();

  }

  removeWordWrap = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.removeWordWrap();
    
  }

  setCustomHovers = function (hoversJSON) {
    
    try {
			customHovers = JSON.parse(hoversJSON);			
			return true;
		}
		catch (e) {
      customHovers = {};
			return { errorDescription: e.message };
		}

  }

  setCustomSignatures = function(sigJSON) {

    try {
			customSignatures = JSON.parse(sigJSON);			
			return true;
		}
		catch (e) {
      customSignatures = {};
			return { errorDescription: e.message };
		}    

  }

  setCustomCodeLenses = function(lensJSON) {

    try {
			customCodeLenses = JSON.parse(lensJSON);
      editor.updateCodeLens();
			return true;
		}
		catch (e) {
      customCodeLenses = [];
			return { errorDescription: e.message };
		}    

  }

  getVarsNames = function (includeLineNumber = false) {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getVarsNames(0, includeLineNumber);    
    
  }

  getSelection = function() {

    return editor.getSelection();

  }

  setSelection = function(startLineNumber, startColumn, endLineNumber, endColumn) {
    
    if (endLineNumber <= getLineCount()) {
      let range = new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn);
      editor.setSelection(range);
      editor.revealPositionInCenterIfOutsideViewport(range.getEndPosition());
      return true;
    }
    else
      return false;

  }

  setSelectionByLength = function(start, end) {
    
    let startPosition = editor.getModel().getPositionAt(start - 1);
    let endPosition = editor.getModel().getPositionAt(end - 1);
    let range = new monaco.Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);    
    editor.setSelection(range);
    editor.revealPositionInCenterIfOutsideViewport(endPosition);

    return true;

  }

  selectedText = function(text = undefined, keepSelection = false) {

    if (text == undefined)
      
      return getSelectedText();    

    else {      
      
      if (getSelectedText()) {

        let selection = getSelection();
        let tempModel = monaco.editor.createModel(text);
        let tempRange = tempModel.getFullModelRange();
        
        setText(text, getSelection(), false);

        if (keepSelection) {
          if (tempRange.startLineNumber == tempRange.endLineNumber)
            setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber, selection.startColumn + tempRange.endColumn - 1);
          else
            setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber + tempRange.endLineNumber - tempRange.startLineNumber, tempRange.endColumn);
        }

      }
      else
        setText(text, undefined, false);

    }

  }

  getLineCount = function() {
    
    return editor.getModel().getLineCount();

  }

  getLineContent = function(lineNumber) {

    return editor.getModel().getLineContent(lineNumber)

  }

  getCurrentLineContent = function() {

    return getLineContent(editor.getPosition().lineNumber);

  }

  getCurrentLine = function() {

    return editor.getPosition().lineNumber;

  }

  getCurrentColumn = function() {

    return editor.getPosition().column;

  }

  setLineContent = function(lineNumber, text) {

    if (lineNumber <= getLineCount()) {
      let range = new monaco.Range(lineNumber, 1, lineNumber, editor.getModel().getLineMaxColumn(lineNumber));
      setText(text, range, false);
      return true;      
    }
    else {
      return false;
    }

  }

  insertLine = function(lineNumber, text) {

    let model = editor.getModel();
    let text_model = monaco.editor.createModel(text);
    let text_range = text_model.getFullModelRange();
    let total_lines = getLineCount();
    let text_lines = text_range.endLineNumber - text_range.startLineNumber;
    
    if (total_lines < lineNumber)
      lineNumber = total_lines + 1;

    if (total_lines < lineNumber && getText())
      text = '\n' + text;

    text_range.startLineNumber = lineNumber;
    text_range.endLineNumber = lineNumber + text_lines;

    if (lineNumber <= total_lines) {

      let next_range = new monaco.Range(lineNumber, 1, total_lines, model.getLineMaxColumn(total_lines));
      let next_text = model.getValueInRange(next_range);

      if (next_text) {
        next_range.endLineNumber += text_lines + 1;
        next_text = '\n'.repeat(text_lines + 1) + next_text;
        editor.executeEdits('insertLine', [{
          range: next_range,
          text: next_text,
          forceMoveMarkers: true
        }]);
      }

    }

    editor.executeEdits('insertLine', [{
      range: text_range,
      text: text,
      forceMoveMarkers: true
    }]);

  }

  addLine = function(text) {

    let line = getLineCount();

    if (getText()) {
      text = '\n' + text;
      line++;
    }

    editor.executeEdits('addLine', [{
      range: new monaco.Range(line, 1, line, 1),
      text: text,
      forceMoveMarkers: true
    }]);

  }

  getPositionOffset = function() {

    let position = editor.getPosition();
    let v_pos = editor.getScrolledVisiblePosition(position);
    let layer = editor.getLayoutInfo();
    let top = Math.min(v_pos.top, layer.height);
    let left = Math.min(v_pos.left, layer.width);

    return {top: top, left: left}

  }

  compare = function (text, sideBySide, highlight, markLines = true) {
    
    let language_id = getCurrentLanguageId();
    let currentTheme = getCurrentThemeName();
    let previous_options = getActiveEditor().getRawOptions();
  
    let status_bar = statusBarWidget ? true : false;
    let overlapScroll = true;
    
    if (status_bar) {
      overlapScroll = statusBarWidget.overlapScroll;
      hideStatusBar();      
    }

    if (text) {      
      
      if (language_id == 'xml') {
        language_id = 'xml';
        currentTheme = 'vs';
      }
      
      let originalModel = originalText ? monaco.editor.createModel(originalText) : monaco.editor.createModel(editor.getModel().getValue());
      let modifiedModel = monaco.editor.createModel(text);
      originalText = originalModel.getValue();
      disposeEditor();
      editor = monaco.editor.createDiffEditor(document.getElementById("container"), {
        theme: currentTheme,
        language: language_id,
        contextmenu: false,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderSideBySide: sideBySide,
        find: {
          addExtraSpaceOnTop: false
        }
      });    
      if (highlight) {
        monaco.editor.setModelLanguage(originalModel, language_id);
        monaco.editor.setModelLanguage(modifiedModel, language_id);
      }
      editor.setModel({
        original: originalModel,
        modified: modifiedModel
      });
      editor.navi = monaco.editor.createDiffNavigator(editor, {
        followsCaret: true,
        ignoreCharChanges: true
      });
      editor.markLines = markLines;
      editor.getModifiedEditor().diffDecor = {
        decor: [],
        line: 0,
        position: 0
      };
      editor.getOriginalEditor().diffDecor = {
        decor: [],
        line: 0,
        position: 0
      };      
      editor.diffEditorUpdateDecorations = diffEditorUpdateDecorations;
      editor.markDiffLines = function () {
        setTimeout(() => {
          const modified_line = this.getPosition().lineNumber;
          const diff_info = this.getDiffLineInformationForModified(modified_line);
          const original_line = diff_info ? diff_info.equivalentLineNumber : modified_line;
          if (this.markLines) {
            this.getModifiedEditor().diffDecor.line = modified_line;
            this.getOriginalEditor().diffDecor.line = original_line;
          }
          this.diffEditorUpdateDecorations();
          editor.diffCount = editor.getLineChanges().length;
        }, 50);
      };
      editor.markDiffLines();
      editor.getModifiedEditor().onKeyDown(e => diffEditorOnKeyDown(e));
      editor.getOriginalEditor().onKeyDown(e => diffEditorOnKeyDown(e));
      editor.getModifiedEditor().onDidChangeCursorPosition(e => diffEditorOnDidChangeCursorPosition(e));
      editor.getOriginalEditor().onDidChangeCursorPosition(e => diffEditorOnDidChangeCursorPosition(e));
      editor.getModifiedEditor().onDidLayoutChange(e => diffEditorOnDidLayoutChange(e));
      editor.getOriginalEditor().onDidLayoutChange(e => diffEditorOnDidLayoutChange(e));
      setDefaultStyle();
    }
    else
    {
      disposeEditor();
      createEditor(language_id, originalText, currentTheme);
      initEditorEventListenersAndProperies();
      originalText = '';
      editor.diffCount = 0;
    }
    
    editor.updateOptions({ readOnly: readOnlyMode });
    if (status_bar)
      showStatusBar(overlapScroll);

    let current_options = getActiveEditor().getRawOptions();
    for (const [key, value] of Object.entries(previous_options)) {
      if (!current_options.hasOwnProperty(key)) {
        let option = {};
        option[key] = value;
        editor.updateOptions(option);
      }
    }

    for (const [key, value] of Object.entries(editor_options)) {
      setOption(key, value);
    }

  }

  triggerSuggestions = function() {
    
    editor.trigger('', 'editor.action.triggerSuggest', {});

  }

  triggerHovers = function() {
    
    editor.trigger('', 'editor.action.showHover', {});

  }

  triggerSigHelp = function() {
    
    editor.trigger('', 'editor.action.triggerParameterHints', {});

  }

  requestMetadata = function (metadata, trigger, data) {

    if (!trigger)
      trigger = 'suggestion';

    let metadata_name = metadata.toLowerCase();
    let request = metadataRequests.get(metadata_name);

    if (!request) {

      metadataRequests.set(metadata_name, true);

      let event_params = {
        metadata: metadata_name,
        trigger: trigger
      }

      if (data)
        event_params = Object.assign(event_params, data);

      sendEvent("EVENT_GET_METADATA", event_params);
    }

  }

  showCustomSuggestions = function(suggestions) {
    
    customSuggestions = [];
    
    try {
            
      let suggestObj = JSON.parse(suggestions);
      
      for (const [key, value] of Object.entries(suggestObj)) {

        customSuggestions.push({
          label: value.name,
          kind: monaco.languages.CompletionItemKind[value.kind],
          insertText: value.text,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: value.detail,
          documentation: value.documentation,
          filterText: value.hasOwnProperty('filter') ? value.filter : value.name,
          sortText: value.hasOwnProperty('sort') ? value.sort : value.name
        });

      }

      triggerSuggestions();
      return true;
      
		}
		catch (e) {
			return { errorDescription: e.message };
		}

  }

  showPreviousCustomSuggestions = function () {

    if (editor.previousCustomSuggestions) {
      customSuggestions = [...editor.previousCustomSuggestions];
      triggerSuggestions();
      return true;
    }
    else {
      return false;
    }

  }

  nextDiff = function() {

    if (editor.navi) {
      editor.navi.next();
      editor.markDiffLines();
    }

  }

  previousDiff = function() {

    if (editor.navi) {
      editor.navi.previous();
      editor.markDiffLines();
    }

  }

  disableContextMenu = function() {
    
    editor.updateOptions({ contextmenu: false });
    contextMenuEnabled = false;

  }

  scrollToTop = function () {
    
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

  }

  hideLineNumbers = function() {
        
    editor.updateOptions({ lineNumbers: false, lineDecorationsWidth: 0 });

  }

  showLineNumbers = function() {
        
    editor.updateOptions({ lineNumbers: true, lineDecorationsWidth: 10 });
    
  }

  clearMetadata = function() {

    metadataRequests.clear();

    for (let [key, value] of Object.entries(bslMetadata)) {

      if (value.hasOwnProperty('items'))
        bslMetadata[key].items = {};

    }

  }

  hideScroll = function(type) {

    document.getElementsByTagName('body')[0].style[type] = 'hidden';
    document.getElementById('container').style[type] = 'hidden';

  }

  hideScrollX = function() {

    hideScroll('overflowX');

  }

  hideScrollY = function() {

    hideScroll('overflowY');

  }

  getTokenFromPosition = function(position) {

    let bsl = new bslHelper(editor.getModel(), position);
    return bsl.getLastToken();

  }

  getLastToken = function() {

    return getTokenFromPosition(editor.getPosition());

  }

  hideSuggestionsList = function() {

    editor.trigger("editor", "hideSuggestWidget"); // https://github.com/salexdv/bsl_console/issues/209

  }

  hideSignatureList = function () {

    signatureVisible = false;
    let widget = document.querySelector('.parameter-hints-widget');

    if (widget)
      widget.style.display = 'none';

  }

  hideHoverList = function() {

    let hovers = document.querySelectorAll('.monaco-editor-hover .hover-row');
    hovers.forEach(function(hover){
      hover.remove();
    });

  }

  openSearchWidget = function() {
    
    getActiveEditor().trigger('', 'actions.find');
    setFindWidgetDisplay('inherit');    
    focusFindWidgetInput();

  }

  closeSearchWidget = function() {
    
    getActiveEditor().trigger('', 'closeFindWidget')
    setFindWidgetDisplay('none');

  }

  setFontSize = function(fontSize)  {
    
    editor.updateOptions({fontSize: fontSize});

  }

  setFontFamily = function(fontFamily)  {
    
    editor.updateOptions({fontFamily: fontFamily});

  }

  setFontWeight = function(fontWeight)  {

    editor.updateOptions({fontWeight: fontWeight});

  }

  setLineHeight = function(lineHeight) {

    editor.updateOptions({lineHeight: lineHeight});

  }

  setLetterSpacing = function(letterSpacing) {

    editor.updateOptions({letterSpacing: letterSpacing});

  }

  renderWhitespace = function(enabled) {

    let mode = enabled ? 'all' : 'none';
    editor.updateOptions({renderWhitespace: mode});

  }

  showStatusBar = function(overlapScroll = true) {
    
    if (!statusBarWidget)
      createStatusBarWidget(overlapScroll);    

  }

  hideStatusBar = function() {

    if (statusBarWidget) {
      if (editor.navi)
        editor.getModifiedEditor().removeOverlayWidget(statusBarWidget);
      else
        editor.removeOverlayWidget(statusBarWidget);
      statusBarWidget = null;
    }

  }

  addBookmark = function(lineNumber) {

    if (lineNumber <= getLineCount()) {

      let bookmark = editor.bookmarks.get(lineNumber);

      if (!bookmark)
        updateBookmarks(lineNumber);

      return !bookmark ? true : false;

    }
    else {
      
      editor.bookmarks.delete(lineNumber);
      return false;

    }

  }

  removeBookmark = function(lineNumber) {

    if (lineNumber < getLineCount()) {

      let bookmark = editor.bookmarks.get(lineNumber);

      if (bookmark)
        updateBookmarks(lineNumber);    
      
      return bookmark ? true : false;

    }
    else {

      editor.bookmarks.delete(lineNumber);
      return false;

    }

  }

  removeAllBookmarks = function() {

    editor.bookmarks.clear();
    updateBookmarks();

  }

  getBookmarks = function () {

    let sorted_bookmarks = getSortedBookmarks();
    return Array.from(sorted_bookmarks.keys());

  }

  setActiveSuggestLabel = function (label) {

    let element = document.querySelector('.monaco-list-rows .focused .monaco-icon-name-container');

    if (element)
      element.innerText = label;

  }

  setSuggestItemDetailById = function (rowId, detailInList, documentation = null) {

    let i = parseInt(rowId);
    let suggestWidget = getSuggestWidget();

    if (suggestWidget && i < suggestWidget.widget.list.view.items.length) {

      let suggest_item = suggestWidget.widget.list.view.items[i];
      suggest_item.element.completion.detail = detailInList;      
      
      if (documentation)
        suggest_item.element.completion.documentation = documentation;
     
      let detail_element = getChildWithClass(suggest_item.row.domNode,'details-label');

      if (detail_element)
        detail_element.innerText = detailInList

    }

  }

  setActiveSuggestDetail = function (detailInList, detailInSide = null, maxSideHeightInPixels = 800) {

    let listRowDetail = document.querySelector('.monaco-list-rows .focused .details-label');

    if (listRowDetail)
      listRowDetail.innerText = detailInList;

    let sideDetailHeader = document.querySelector('.suggest-widget.docs-side .details .header');
    
    if (sideDetailHeader) {
      
      if (!detailInSide)
        detailInSide = detailInList;

      sideDetailHeader.innerText = detailInSide;
      
      let sideDetailElement = document.querySelector('.suggest-widget.docs-side .details');      
      let contentHeightInPixels = sideDetailHeader.scrollHeight;
      let viewportHeightInPixels = Math.min(maxSideHeightInPixels, contentHeightInPixels);

      sideDetailElement.style.height = viewportHeightInPixels.toString() + 'px';

    }
    
  }

  hasTextFocus = function () {

    return editor.hasTextFocus();

  }

  setActiveSuggestionAcceptors = function (characters) {

    activeSuggestionAcceptors = characters.split('|');

  }

  nextMatch = function () {

    getActiveEditor().trigger('', 'editor.action.nextMatchFindAction');

  }

  previousMatch = function () {

    getActiveEditor().trigger('', 'editor.action.previousMatchFindAction');

  }

  setOption = function (optionName, optionValue) {

    setTimeout(() => {

      editor[optionName] = optionValue;
      editor_options[optionName] = optionValue;

      if (optionName == 'generateBeforeSignatureEvent')
        startStopSignatureObserver();

      if (optionName == 'generateSelectSuggestEvent')
        startStopSuggestSelectionObserver();

      if (optionName == 'disableDefinitionMessage')
        startStopDefinitionMessegeObserver();

      if (optionName == 'generateSuggestActivationEvent')
        startStopSuggestActivationObserver();
        
    }, 10);

  }

  getOption = function (optionName) {

    return editor[optionName];
    
  }

  disableKeyBinding = function (keybinding) {

    const bind_str = keybinding.toString();
    const key_name = 'kbinding_' + bind_str;
  
    if (editor[key_name])
      editor[key_name].set(true);
    else
      editor[key_name] = editor.createContextKey(key_name, true);

    editor.addCommand(keybinding, function() {sendEvent('EVENT_KEY_BINDING_' + bind_str)}, key_name);

  }

  enableKeyBinding = function (keybinding) {
  
    const key_name = 'kbinding_' + keybinding;
    const context_key = editor[key_name];
    
    if (context_key)
      context_key.set(false);
    
  }

  jumpToBracket = function () {

    editor.trigger('', 'editor.action.jumpToBracket');

  }

  selectToBracket = function () {

    editor.trigger('', 'editor.action.selectToBracket');

  }

  revealDefinition = function() {

    editor.trigger('', 'editor.action.revealDefinition');

  }

  peekDefinition = function() {

    editor.trigger('', 'editor.action.peekDefinition');

  }

  setOriginalText = function (originalText, setEmptyOriginalText = false) {

    editor.originalText = originalText;
    editor.calculateDiff = (originalText || setEmptyOriginalText);

    if (!editor.calculateDiff) {
      editor.diffCount = 0;
      editor.removeDiffWidget();
      editor.diff_decorations = [];
    }
    else
      calculateDiff();

    editor.updateDecorations([]);

  }

  getOriginalText = function () {

    return editor.originalText;    

  }

  revealLineInCenter = function (lineNumber) {

    let line = Math.min(lineNumber, getLineCount())
    editor.revealLineInCenter(lineNumber);    
    editor.setPosition(new monaco.Position(line, 1));

  }

  saveViewState = function () {

    return JSON.stringify(editor.saveViewState());

  }

  restoreViewState = function (state) {
    
    try {
			editor.restoreViewState(JSON.parse(state));
			return true;
		}
		catch (e) {      
			return { errorDescription: e.message };
		}

  }

  getDiffCount = function() {

    return editor.diffCount ? editor.diffCount : 0;

  }

  formatDocument = function() {

    editor.trigger('', 'editor.action.formatDocument');
  
  }

  isSuggestWidgetVisible = function () {

    let content_widget = getSuggestWidget();
    return content_widget ? content_widget.widget.suggestWidgetVisible.get() : false;

  }

  isParameterHintsWidgetVisible = function () {

    let content_widget = getParameterHintsWidget();
    return content_widget ? content_widget.widget.visible : false;

  }

  insertSnippet = function(snippet) {

    let controller = editor.getContribution("snippetController2");
    
    if (controller)
      controller.insert(snippet);

  }

  parseSnippets = function(stData, unionSnippets = false) {

    // Удаляем BOM если есть
    if (stData.charCodeAt(0) === 0xFEFF) {
      stData = stData.substring(1);
    }

    let parser = new SnippetsParser();
    parser.setStream(stData);
    parser.parse();
    let loaded_snippets = parser.getSnippets();

    if (loaded_snippets) {

      let snip_obj = loaded_snippets;

      if (unionSnippets)
        snippets = Object.assign(snippets, snip_obj);
      else
        snippets = snip_obj;

      return true;

    }
    
    return false;
    
  }

  setDefaultSnippets = function() {

    snippets = bslSnippets;

  }

  clearSnippets = function() {

    snippets = {};

  }

  updateSnippetByGUID = function (snippetGUID) {

    suggestWidget = getSuggestWidget();

    if (suggestWidget) {

      suggestWidget.widget.list.view.items.forEach((completionItem) => {

        if (completionItem.element.completion.guid == snippetGUID)
          completionItem.element.provider.resolveCompletionItem(editor.getModel(),
            editor.getPosition(),
            completionItem.element.completion
          );

      });

    }

  }

  setMarkers = function (markersJSON) {

    try {
      const markers_array = JSON.parse(markersJSON);
      const model = editor.navi ? editor.getModifiedEditor().getModel() : editor.getModel();
      setModelMarkers(model, markers_array)
      return true;
    }
    catch (e) {
      return { errorDescription: e.message };
    }

  }

  getMarkers = function( ) {

    return getSortedMarkers();

  }

  goNextMarker = function () {

    let sorted_markers = getSortedMarkers();

    if (sorted_markers.length - 1 <= currentMarker)
      currentMarker = -1;

    currentMarker++;
    goToCurrentMarker(sorted_markers);

  }

  goPreviousMarker = function () {

    let sorted_markers = getSortedMarkers();

    currentMarker--;

    if (currentMarker < 0)
    currentMarker = sorted_markers.length - 1;

    goToCurrentMarker(sorted_markers);

  }

  goToFuncDefinition = function (funcName) {

    if (funcName) {

      let pattern = '(процедура|procedure|функция|function)\\s*' + funcName + '\\(';
      let match = getActiveEditor().getModel().findPreviousMatch(pattern, editor.getPosition(), true);

      if (match) {
        editor.revealLineInCenter(match.range.startLineNumber);
        editor.setPosition(new monaco.Position(match.range.startLineNumber, match.range.startColumn));
        editor.focus();
        return true;
      }
    }

    return false;

  }

  fold = function() {

    editor.trigger('', 'editor.fold');

  }

  foldAll = function() {

    editor.trigger('', 'editor.foldAll');

  }

  unfold = function() {

    editor.trigger('', 'editor.unfold');

  }

  unfoldAll = function() {

    editor.trigger('', 'editor.unfoldAll');

  }

  scale = function(direction) {

    if (direction == 0)
      editor.trigger('', 'editor.action.fontZoomReset');
    else if (0 < direction)
      editor.trigger('', 'editor.action.fontZoomIn');
    else
      editor.trigger('', 'editor.action.fontZoomOut');

  }

  gotoLine = function() {

    editor.trigger('', 'editor.action.gotoLine');
    getQuickOpenWidget().widget.quickOpenWidget.inputElement.focus();

  }

  showVariablesDescription = function(variablesJSON) {    
    
    try {
      
      if (treeview != null)
        hideVariablesDisplay();

      const variables = JSON.parse(variablesJSON);
      treeview = new Treeview("#variables-tree", editor, "./tree/icons/");
      treeview.replaceData(variables);
      showVariablesDisplay();

      return true;

    }
    catch (e) {
      return { errorDescription: e.message };
    }

  }

  updateVariableDescription = function(variableId, variableJSON) { 

    try {

      const variables = JSON.parse(variableJSON);
      treeview.replaceData(variables, variableId);
      treeview.open(variableId);
      return true;

    }
    catch (e) {
      return { errorDescription: e.message };
    }

  }   
    
  setDefaultStyle = function() {

    setFontFamily("Courier New");
    setFontSize(14);
    setLineHeight(16);
    setLetterSpacing(0);

  }

  generateEventWithSuggestData = function(eventName, trigger, row, suggestRows = []) {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());
    let row_id = row ? row.getAttribute('data-index') : "";
    let insert_text = '';

    if (row_id) {

      let suggestWidget = getSuggestWidget();

      if (suggestWidget && row_id < suggestWidget.widget.list.view.items.length) {
        let suggest_item = suggestWidget.widget.list.view.items[row_id];
        insert_text = suggest_item.element.completion.insertText;
      }

    }

    eventParams = {
      trigger: trigger,
      current_word: bsl.word,
      last_word: bsl.lastRawExpression,
      last_expression: bsl.lastExpression,
      rows: suggestRows.length ? suggestRows : getSuggestWidgetRows(row),
      altKey: altPressed,
      ctrlKey: ctrlPressed,
      shiftKey: shiftPressed,
      row_id: row_id,
      insert_text: insert_text
    }

    if (row) {

      eventParams['kind'] = getChildWithClass(row, 'suggest-icon').className;
      eventParams['sideDetailIsOpened'] = (null != document.querySelector('.suggest-widget.docs-side .details .header'));

      if (eventName == 'EVENT_ON_ACTIVATE_SUGGEST_ROW' || eventName == 'EVENT_ON_DETAIL_SUGGEST_ROW')
        eventParams['focused'] = row.getAttribute('aria-label');
      else if (eventName == 'EVENT_ON_SELECT_SUGGEST_ROW')
        eventParams['selected'] = row.getAttribute('aria-label');

    }

    sendEvent(eventName, eventParams);

  }
  // #endregion

  // #region init editor
  editor = undefined;

  function createEditor(language_id, text, theme) {

    editor = monaco.editor.create(document.getElementById("container"), {
      theme: theme,
      value: text,
      language: language_id,
      contextmenu: true,
      wordBasedSuggestions: false,
      scrollBeyondLastLine: false,
      insertSpaces: false,
      trimAutoWhitespace: false,
      autoIndent: true,
      find: {
        addExtraSpaceOnTop: false
      },
      parameterHints: {
        cycle: true
      },
      customOptions: true
    });

    changeCommandKeybinding('editor.action.revealDefinition', monaco.KeyCode.F12);
    changeCommandKeybinding('editor.action.peekDefinition', monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12);
    changeCommandKeybinding('editor.action.deleteLines',  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_L);
    changeCommandKeybinding('editor.action.selectToBracket',  monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KEY_B);

    setDefaultStyle();

  }

  function registerCodeLensProviders() {

    setTimeout(() => {
  
      for (const [key, lang] of Object.entries(window.languages)) {
        
        let language = lang.languageDef;
  
        monaco.languages.registerCodeLensProvider(language.id, {
          onDidChange: lang.codeLenses.onDidChange, 
          provideCodeLenses: lang.codeLenses.provider, 
          resolveCodeLens: lang.codeLenses.resolver
        });
  
      }
  
    }, 50);
  
  }

  // Register extra languages (JSON, YAML)
  function registerExtraLanguages() {

    // Load and register YAML language (JSON is handled by Monaco's built-in language service)
    require(['vs/basic-languages/yaml/yaml'], function(yamlLang) {
      monaco.languages.register({ id: 'yaml', extensions: ['.yaml', '.yml'], aliases: ['YAML', 'yaml'] });
      monaco.languages.setMonarchTokensProvider('yaml', yamlLang.language);
      monaco.languages.setLanguageConfiguration('yaml', yamlLang.conf);
    });

  }

  // Register languages
  for (const [key, lang] of Object.entries(languages)) {
  
    let language = lang.languageDef;

    monaco.languages.register({ id: language.id });

    // Register a tokens provider for the language
    monaco.languages.setMonarchTokensProvider(language.id, language.rules);

    // Register providers for the new language
    monaco.languages.registerCompletionItemProvider(language.id, lang.completionProvider);
    monaco.languages.registerFoldingRangeProvider(language.id, lang.foldingProvider);      
    monaco.languages.registerSignatureHelpProvider(language.id, lang.signatureProvider);
    monaco.languages.registerHoverProvider(language.id, lang.hoverProvider);    
    monaco.languages.registerDocumentFormattingEditProvider(language.id, lang.formatProvider);
    monaco.languages.registerColorProvider(language.id, lang.colorProvider);
    monaco.languages.registerDefinitionProvider(language.id, lang.definitionProvider);

    if (lang.autoIndentation && lang.indentationRules)
      monaco.languages.setLanguageConfiguration(language.id, {indentationRules: lang.indentationRules});

    monaco.languages.setLanguageConfiguration(language.id, {brackets: lang.brackets, autoClosingPairs: lang.autoClosingPairs});

    if (!editor) {

      for (const [key, value] of Object.entries(language.themes)) {
        monaco.editor.defineTheme(value.name, value);
        monaco.editor.setTheme(value.name);
      }

      createEditor(language.id, getCode(), 'bsl-white');
      registerCodeLensProviders();
      setDefaultSnippets();
      registerExtraLanguages();

      // Attach AST service for structural code analysis
      if (typeof bslAstService !== 'undefined')
        bslAstService.attachEditor(editor);
    
      contextMenuEnabled = editor.getRawOptions().contextmenu;
      editor.originalText = '';

    }

  };
  
  for (const [action_id, action] of Object.entries(permanentActions)) {
    editor.addAction({
      id: action_id,
      label: action.label,
      keybindings: [action.key, action.cmd],
      precondition: null,
      keybindingContext: null,
      contextMenuGroupId: null,
      contextMenuOrder: action.order,
      run: action.callback
    });

  }

  initEditorEventListenersAndProperies();
  // #endregion

  // #region editor events
  function initEditorEventListenersAndProperies() {

    editor.sendEvent = sendEvent;
    editor.decorations = [];
    editor.bookmarks = new Map();
    editor.checkBookmarks = true;
    editor.diff_decorations = [];

    editor.updateDecorations = function (new_decorations) {

      let permanent_decor = [];

      editor.bookmarks.forEach(function (value) {
        permanent_decor.push(value);
      });

      permanent_decor = permanent_decor.concat(editor.diff_decorations);

      getQueryDelimiterDecorations(permanent_decor);

      editor.decorations = editor.deltaDecorations(editor.decorations, permanent_decor.concat(new_decorations));
    }

    editor.removeDiffWidget = function () {

      if (editor.diffZoneId) {

        editor.removeOverlayWidget(inlineDiffWidget);
        inlineDiffWidget = null;
        inlineDiffEditor = null;

        editor.changeViewZones(function (changeAccessor) {
          changeAccessor.removeZone(editor.diffZoneId);
          editor.diffZoneId = 0;
        });

      }

    }

    editor.onKeyDown(e => editorOnKeyDown(e));

    editor.onDidChangeModelContent(e => {
      
      calculateDiff();

      if (getOption('generateModificationEvent'))
        sendEvent('EVENT_CONTENT_CHANGED', '');

      checkBookmarksAfterRemoveLine(e);
      updateBookmarks(undefined);

      setOption('lastContentChanges', e);
          
    });

    editor.onKeyUp(e => {
      
      if (e.ctrlKey)
        ctrlPressed = false;

      if (e.altKey)
        altPressed = false;

      if (e.shiftKey)
        shiftPressed = false;

    });

    editor.onMouseDown(e => {

      if (e.event.leftButton && e.event.ctrlKey) {

        let position = e.target.position;

        if (position) {

          let target = editor.getModel().getWordAtPosition(position);

          if (target) {
            let current_selection = editor.getSelection();
            let target_selection = new monaco.Range(position.lineNumber, target.startColumn, position.lineNumber, target.endColumn);
            if (!current_selection.containsRange(target_selection))
              setSelection(position.lineNumber, target.startColumn, position.lineNumber, target.endColumn)
          }

        }

      }

      let element = e.target.element;
      checkOnLinkClick(element);

      if (e.event.detail == 2 && element.classList.contains('line-numbers')) {
        let line = e.target.position.lineNumber;
        updateBookmarks(line);
      }

      if (debugUsingDebugger && e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        let line = e.target.position.lineNumber;
        updateBreakpoints(line);
      }

      if (element.classList.contains('diff-navi')) {
        createDiffWidget(e);
      }    

    });

    editor.onDidScrollChange(e => {
          
      if (e.scrollTop == 0) {
        scrollToTop();
      }

    });
    
    editor.onDidType(text => {

      if (text === '\n') {
        checkNewStringLine();
        checkBookmarksAfterNewLine();
      }

    });

    editor.onDidChangeCursorSelection(e => {

      updateStatusBar();
      onChangeSnippetSelection(e);

    });

    editor.onDidLayoutChange(e => {

      setTimeout(() => { resizeStatusBar(); } , 50);

    })

  }
  // #endregion
    
  // #region non-public functions
  function disposeEditor() {

    if (editor) {

      if (editor.navi) {
        editor.getOriginalEditor().getModel().dispose();
        editor.getOriginalEditor().dispose();
        editor.getModifiedEditor().getModel().dispose();
        editor.getModifiedEditor().dispose();
      }
      else {
        editor.getModel().dispose();
      }

      editor.dispose();

    }

  }

  function generateSnippetEvent(e) {

    if (e.source == 'snippet') {

      let last_changes = getOption('lastContentChanges');
      let generate = getOption('generateSnippetEvent');

      if (generate && last_changes && last_changes.versionId == e.modelVersionId && e.modelVersionId == e.oldModelVersionId) {

        if (last_changes.changes.length) {

          let changes = last_changes.changes[0];
          let change_range = changes.range;
          let content_model = monaco.editor.createModel(changes.text);
          let content_range = content_model.getFullModelRange();

          let target_range = new monaco.Range(
            change_range.startLineNumber,
            change_range.startColumn,
            change_range.startLineNumber + content_range.endLineNumber - 1,
            content_range.endColumn
          );

          let event = {
            text: changes.text,
            range: target_range,
            position: editor.getPosition(),
            selection: getSelection(),
            selected_text: getSelectedText()
          }

          sendEvent('EVENT_ON_INSERT_SNIPPET', event);

        }

      }

    }

  }

  function onChangeSnippetSelection(e) {

    if (e.source == 'snippet' || e.source == 'api') {

      let text = editor.getModel().getValueInRange(e.selection);
      
      let events = new Map();
      events.set('ТекстЗапроса', 'EVENT_QUERY_CONSTRUCT');
      events.set('ФорматнаяСтрока', 'EVENT_FORMAT_CONSTRUCT');
      events.set('ВыборТипа', 'EVENT_TYPE_CONSTRUCT');
      events.set('КонструкторОписанияТипов', 'EVENT_TYPEDESCRIPTION_CONSTRUCT');

      let event = events.get(text);

      if (event) {

        let mod_event = getOption('generateModificationEvent');

        if (mod_event)
          setOption('generateModificationEvent', false);

        setText('', e.selection, false);
        sendEvent(event);

        if (mod_event)
          setOption('generateModificationEvent', true);

      }

    }

    generateSnippetEvent(e);

  }

  function getSuggestWidgetRows(element) {

    let rows = [];

    if (element) {

      for (let i = 0; i < element.parentElement.childNodes.length; i++) {              
        
        let row = element.parentElement.childNodes[i];
        
        if (row.classList.contains('monaco-list-row'))
          rows.push(row.getAttribute('aria-label'));

      }

    }

    return rows;

  }
  
  function goToCurrentMarker(sorted_marks) {

    let idx = 0;
    let count = getLineCount();
    let decorations = [];

    sorted_marks.forEach(function (value) {

      if (idx == currentMarker && value.startLineNumber <= count) {

        editor.revealLineInCenter(value.startLineNumber);
        editor.setPosition(new monaco.Position(value.startLineNumber, value.startColumn));

        let decor_class = 'code-marker';

        switch (value.severity) {
          case 8: decor_class += ' marker-error'; break;
          case 1: decor_class += ' marker-hint'; break;
          case 2: decor_class += ' marker-info'; break;
          case 4: decor_class += ' marker-warning'; break;
          default: decor_class += ' marker-error';
        }

        decorations.push({
          range: new monaco.Range(value.startLineNumber, 1, value.startLineNumber),
          options: {
            isWholeLine: true,
            linesDecorationsClassName: decor_class
          }
        });

      }

      idx++;

    });

    editor.updateDecorations(decorations);

  }

  function getSortedMarkers() {

    return monaco.editor.getModelMarkers().sort((a, b) => a.startLineNumber - b.startLineNumber)

  }
  
  function setModelMarkers(model, markers_array) {
    
    let markers_data = [];
    currentMarker = -1;
    
    markers_array.forEach(marker => {
      
      let severity;

      switch (marker.severity) {
        case "Error":
          severity = monaco.MarkerSeverity.Error;
          break;
        case "Hint":
          severity = monaco.MarkerSeverity.Hint;
          break;
        case "Info":
          severity = monaco.MarkerSeverity.Info;
          break;
        case "Warning":
          severity = monaco.MarkerSeverity.Warning;
          break;
        default:
          severity = monaco.MarkerSeverity.Error;
      }

      markers_data.push({
        startLineNumber: marker.startLineNumber ? marker.startLineNumber : marker.lineNumber,
        endLineNumber: marker.endLineNumber ? marker.endLineNumber : marker.lineNumber,
        startColumn: marker.startColumn ? marker.startColumn : model.getLineFirstNonWhitespaceColumn(marker.lineNumber),
        endColumn: marker.endColumn ? marker.endColumn : model.getLineFirstNonWhitespaceColumn(marker.lineNumber),
        severity: severity,
        message: marker.message,
        code: marker.code ? marker.code : '',
        source: marker.source ? marker.source : ''
      });

    });

    monaco.editor.setModelMarkers(model, "markers", markers_data);

  }

  function startStopDefinitionMessegeObserver() {

    if (definitionObserver != null) {
      definitionObserver.disconnect();
      definitionObserver = null;
    }

    let disable_message = getOption('disableDefinitionMessage');

    if (disable_message) {

      definitionObserver = new MutationObserver(function (mutations) {

        mutations.forEach(function (mutation) {

          if (mutation.target.classList.contains('overflowingContentWidgets') && mutation.addedNodes.length) {
            
            let element = mutation.addedNodes[0];

            if (element.classList.contains('monaco-editor-overlaymessage') && element.classList.contains('fadeIn')) {
              element.style.display = 'none';
            }

          }

        })

      });

      definitionObserver.observe(document, {
        childList: true,
        subtree: true
      });

    }

  }

  function startStopSuggestActivationObserver() {

    if (suggestObserver != null) {
      suggestObserver.disconnect();
      suggestObserver = null;
    }

    let fire_event = getOption('generateSuggestActivationEvent');

    onSuggestListMouseOver(fire_event);

    if (fire_event) {

      suggestObserver = new MutationObserver(function (mutations) {

        mutations.forEach(function (mutation) {

          if (mutation.target.classList.contains('monaco-list-rows') && mutation.addedNodes.length) {
            let element = mutation.addedNodes[0];
            if (element.classList.contains('monaco-list-row') && element.classList.contains('focused')) {
              removeSuggestListInactiveDetails();
              generateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'focus', element);
              let alwaysDisplaySuggestDetails = getOption('alwaysDisplaySuggestDetails');
              if (alwaysDisplaySuggestDetails) {
                document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
                  node.classList.add('inactive-detail');
                });
                document.querySelector('.monaco-list-rows .focused .details-label').classList.remove('inactive-detail');
              }
            }
          }
          else if (mutation.target.classList.contains('type') || mutation.target.classList.contains('docs')) {
            let element = document.querySelector('.monaco-list-rows .focused');
            if (element) {
              if (hasParentWithClass(mutation.target, 'details') && hasParentWithClass(mutation.target, 'suggest-widget')) {
                generateEventWithSuggestData('EVENT_ON_DETAIL_SUGGEST_ROW', 'focus', element);
              }
            }
          }

        })

      });

      suggestObserver.observe(document, {
        childList: true,
        subtree: true,
      });

    }

  }

  function startStopSuggestSelectionObserver() {

    let widget = getSuggestWidget().widget;

    if (widget) {

      let fire_event = getOption('generateSelectSuggestEvent');

      if (fire_event) {

        if (!widget.onListMouseDownOrTapOrig)
          widget.onListMouseDownOrTapOrig = widget.onListMouseDownOrTap;

        widget.onListMouseDownOrTap = function (e) {
          let element = getParentWithClass(e.browserEvent.target, 'monaco-list-row');

          if (element) {
            generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
          }

          widget.onListMouseDownOrTapOrig(e);

        }

      }
      else if (widget.onListMouseDownOrTapOrig) {

        widget.onListMouseDownOrTap = widget.onListMouseDownOrTapOrig;

      }

    }

  }

  function startStopSignatureObserver() {

    if (signatureObserver != null) {
      signatureObserver.disconnect();
      signatureObserver = null;
    }

    let fire_event = getOption('generateBeforeSignatureEvent');

    if (fire_event) {

      signatureObserver = new MutationObserver(function (mutations) {

        mutations.forEach(function (mutation) {

          if (mutation.target.classList.contains('overflowingContentWidgets') && mutation.addedNodes.length) {

            let element = mutation.addedNodes[0];

            if (element.classList.contains('parameter-hints-widget') && !signatureVisible) {
              element.style.display = 'none';
              signatureObserver.disconnect();
              signatureObserver = null;
            }

          }

        })

      });

      signatureObserver.observe(document, {
        childList: true,
        subtree: true
      });

    }

  }

  function changeCommandKeybinding(command, keybinding) {
  
    editor._standaloneKeybindingService.addDynamicKeybinding('-' + command);
    editor._standaloneKeybindingService.addDynamicKeybinding(command, keybinding);

  }

  function getQueryDelimiterDecorations(decorations) {

    if (queryMode && editor.renderQueryDelimiters) {

      const matches = editor.getModel().findMatches('^\\s*;\\s*$', false, true, false, null, true);
      
      let color = '#f2f2f2';
      let class_name  = 'query-delimiter';
      
      const current_theme = getCurrentThemeName();
      const is_dark_theme = (0 <= current_theme.indexOf('dark'));

      if (is_dark_theme) {
        class_name = 'query-delimiter-dark';
        color = '#2d2d2d'
      }

      for (let idx = 0; idx < matches.length; idx++) {
        let match = matches[idx];
        decorations.push({
          range: new monaco.Range(match.range.startLineNumber, 1, match.range.startLineNumber),
          options: {
            isWholeLine: true,
            className: class_name,
            overviewRuler: {
              color: color,
              darkColor: color,
              position: 7
            }
          }
        });

      }

    }

  }

  function getSuggestWidget() {

    return editor._contentWidgets['editor.widget.suggestWidget'];
  
  }

  function getParameterHintsWidget() {

    return editor._contentWidgets['editor.widget.parameterHintsWidget'];
  
  }

  function getFindWidget() {
  
    return getActiveEditor()._overlayWidgets['editor.contrib.findWidget'];

  }

  function getQuickOpenWidget() {
  
    return getActiveEditor()._overlayWidgets['editor.contrib.quickOpenEditorWidget'];

  }

  function getNativeLinkHref(element, isForwardDirection) {

    let href = '';

    if (element.classList.contains('detected-link-active')) {

      href = element.innerText;

  
      if (isForwardDirection && element.nextSibling || isForwardDirection == null)
        href += getNativeLinkHref(element.nextSibling, true);

      if (!isForwardDirection && element.previousSibling)
        href = getNativeLinkHref(element.previousSibling, false) + href;

    }

    return href;

  }

  function checkOnLinkClick(element) {

    if (element.tagName.toLowerCase() == 'a') {

      sendEvent("EVENT_ON_LINK_CLICK", { label: element.innerText, href: element.dataset.href });
      setTimeout(() => {
        editor.focus();
      }, 100);

    }
    else if (element.classList.contains('detected-link-active')) {

      let href = getNativeLinkHref(element, null);
      if (href) {
        sendEvent("EVENT_ON_LINK_CLICK", { label: href, href: href });
        setTimeout(() => {
          editor.focus();
        }, 100);
      }

    }

  }

  function deltaDecorationsForDiffEditor(standalone_editor) {

    let diffDecor = standalone_editor.diffDecor;
    let decorations = [];

    if (diffDecor.line)
      decorations.push({ range: new monaco.Range(diffDecor.line, 1, diffDecor.line), options: { isWholeLine: true, linesDecorationsClassName: 'diff-mark' } });

    if (diffDecor.position)
      decorations.push({ range: new monaco.Range(diffDecor.position, 1, diffDecor.position), options: { isWholeLine: true, linesDecorationsClassName: 'diff-editor-position' } });

    standalone_editor.diffDecor.decor = standalone_editor.deltaDecorations(standalone_editor.diffDecor.decor, decorations);

  }

  function diffEditorUpdateDecorations() {

    deltaDecorationsForDiffEditor(this.getModifiedEditor());
    deltaDecorationsForDiffEditor(this.getOriginalEditor());

  }

  function diffEditorOnDidChangeCursorPosition(e) {

    if (e.source != 'api') {      
      
      editor.getModifiedEditor().diffDecor.position = 0;
      editor.getOriginalEditor().diffDecor.position = 0;
      getActiveDiffEditor().diffDecor.position = e.position.lineNumber;
      editor.diffEditorUpdateDecorations();
      editor.diffCount = editor.getLineChanges().length;

      if (editor.getModifiedEditor().getPosition().equals(e.position))
        editor.getOriginalEditor().setPosition(e.position);
      else
        editor.getModifiedEditor().setPosition(e.position);

      updateStatusBar();

    }

  }

  function diffEditorOnDidLayoutChange(e) {

    setTimeout(() => { resizeStatusBar(); } , 50);

  }

  function getActiveDiffEditor() {

    let active_editor = null;

    if (editor.getModifiedEditor().diffDecor.position)
      active_editor = editor.getModifiedEditor();
    else if (editor.getOriginalEditor().diffDecor.position)
      active_editor = editor.getOriginalEditor();
    else
      active_editor = editor.getModifiedEditor().hasTextFocus() ? editor.getModifiedEditor() : editor.getOriginalEditor();

    return active_editor;

  }

  function getActiveEditor() {

    return editor.navi ? getActiveDiffEditor() : editor;

  }

  function diffEditorOnKeyDown(e) {

    if (e.ctrlKey && (e.keyCode == 36 || e.keyCode == 38)) {
      // Ctrl+F or Ctrl+H
      setFindWidgetDisplay('inherit');
    }
    else if (e.keyCode == 9) {
      // Esc
      closeSearchWidget();      
    }
    else if (e.keyCode == 61) {
      // F3
      let standalone_editor = getActiveDiffEditor();
      if (!e.altKey && !e.shiftKey) {
        if (e.ctrlKey) {
          standalone_editor.trigger('', 'actions.find');
          standalone_editor.focus();
          previousMatch();
        }
        else
          standalone_editor.trigger('', 'editor.action.findWithSelection');
        setFindWidgetDisplay('inherit');
        standalone_editor.focus();
        focusFindWidgetInput();
      }
    }

  }

  function generateOnKeyDownEvent(e) {

    let fire_event = getOption('generateOnKeyDownEvent');
    let filter = getOption('onKeyDownFilter');
    let filter_list = filter ? filter.split(',') : [];
    fire_event = fire_event && (!filter || 0 <= filter_list.indexOf(e.keyCode.toString()));

    if (fire_event) {

      let find_widget = getFindWidget();

      let event_params = {
        keyCode: e.keyCode,
        suggestWidgetVisible: isSuggestWidgetVisible(),
        parameterHintsWidgetVisible: isParameterHintsWidgetVisible(),
        findWidgetVisible: (find_widget && find_widget.position) ? true : false,
        ctrlPressed: e.ctrlKey,
        altPressed: e.altKey,
        shiftPressed: e.shiftKey,
        position: editor.getPosition()
      }

      sendEvent('EVENT_ON_KEY_DOWN', event_params);

    }

  }

  function editorOnKeyDown(e) {

    generateOnKeyDownEvent(e);

    editor.lastKeyCode = e.keyCode;

    if (e.keyCode == 16 && editor.getPosition().lineNumber == 1)
      // ArrowUp
      scrollToTop();
    else if (e.keyCode == 3 && getOption('generateSelectSuggestEvent')) {
      // Enter
      let element = document.querySelector('.monaco-list-row.focused');
      if (element) {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => {
          generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
        }, 10);
      }
    }
    else if (e.ctrlKey && (e.keyCode == 36 || e.keyCode == 38)) {
      // Ctrl+F or Ctrl+H
      setFindWidgetDisplay('inherit');
    }
    else if (e.keyCode == 9) {
      // Esc
      setFindWidgetDisplay('none');
      hideSuggestionsList();
    }
    else if (e.keyCode == 61) {
      // F3
      if (!e.altKey && !e.shiftKey) {
        if (e.ctrlKey) {
          editor.trigger('', 'actions.find');
          previousMatch();
        }
        else
          editor.trigger('', 'editor.action.findWithSelection');
        setFindWidgetDisplay('inherit');
        editor.focus();
        focusFindWidgetInput();
      }
    }
    else if (e.keyCode == 2) {
      // Tab
      let fire_event = getOption('generateSelectSuggestEvent');
      if (fire_event) {
        let element = document.querySelector('.monaco-list-row.focused');
        if (element) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
          }, 10);
        }
      }
    }

    if (e.altKey && e.keyCode == 87) {
      // fix https://github.com/salexdv/bsl_console/issues/147
      e.preventDefault();
      setText('[');
    }

    if (e.ctrlKey)
      ctrlPressed = true;

    if (e.altKey)
      altPressed = true;

    if (e.shiftKey)
      shiftPressed = true;

    checkEmptySuggestions();

  }

  function  initContextMenuActions() {

    contextActions.forEach(action => {
      action.dispose();
    });

    const actions = getActions(version1C);

    for (const [action_id, action] of Object.entries(actions)) {
      
      let menuAction = editor.addAction({
        id: action_id,
        label: action.label,
        keybindings: [action.key, action.cmd],
        precondition: null,
        keybindingContext: null,
        contextMenuGroupId: 'navigation',
        contextMenuOrder: action.order,
        run: action.callback
      });      

      contextActions.push(menuAction)
    }

  }

  function checkNewStringLine() {

    if (getCurrentLanguageId() == 'bsl') {

      const model = editor.getModel();
      const position = editor.getPosition();
      const line = position.lineNumber;
      const length = model.getLineLength(line);
      const expression = model.getValueInRange(new monaco.Range(line, position.column, line, length + 1));
      const column = model.getLineLastNonWhitespaceColumn(line - 1);
      const char = model.getValueInRange(new monaco.Range(line - 1, column - 1, line - 1, column));
      const token = getTokenFromPosition(new monaco.Position(line - 1, column));

      if (token == 'stringbsl' ||0 <= token.indexOf('string.invalid') || 0 <= token.indexOf('query') || char == '|') {

        if (token != 'query.quotebsl' || char == '|') {

          const range = new monaco.Range(line, position.column, line, length + 2);

          let operation = {
            range: range,
            text: '|' + expression,
            forceMoveMarkers: true
          };

          editor.executeEdits('nql', [operation]);
          editor.setPosition(new monaco.Position(line, position.column + 1));

        }

      }

    }

  }

  function hasParentWithClass(element, className) {

    if (0 <= element.className.split(' ').indexOf(className))
      return true;

    return element.parentNode && hasParentWithClass(element.parentNode, className);

  }

  function getParentWithClass(element, className) {

    if (element.className && 0 <= element.className.split(' ').indexOf(className))
      return element;

    if (element.parentNode)    
      return getParentWithClass(element.parentNode, className);
    else
      return null;

  }

  function getChildWithClass(element, className) {

    for (var i = 0; i < element.childNodes.length; i++) {
      
      let child = element.childNodes[i];

      if (child.className && 0 <= child.className.split(' ').indexOf(className))
        return child
      else if (child.childNodes.length) {
        child = getChildWithClass(child, className);
        if (child)
          return child;
      }

    }

    return null;

  }

  setFindWidgetDisplay = function(value) {

    let find_widget = getFindWidget();
    
    if (find_widget)
      find_widget.widget._domNode.style.display = value;

  }

  function setFindWidgetDisplay(value) {

    let find_widget = getFindWidget();
    
    if (find_widget)
      find_widget.widget._domNode.style.display = value;

  }

  function focusFindWidgetInput() {

    let find_widget = getFindWidget();

    if (find_widget)
      find_widget.widget.focusFindInput();

  }  

  function updateStatusBar() {
    
    if (statusBarWidget) {
      
      let status = '';

      if (editor.navi) {
        let standalone_editor = getActiveDiffEditor();
        status = 'Ln ' + standalone_editor.getPosition().lineNumber;
        status += ', Col ' + standalone_editor.getPosition().column;                
      }
      else {        
        status = 'Ln ' + getCurrentLine();
        status += ', Col ' + getCurrentColumn();
      }

      if (!engLang)
        status = status.replace('Ln', 'Стр').replace('Col', 'Кол');

      statusBarWidget.domNode.firstElementChild.innerText = status;
    }

  }

  function resizeStatusBar() {

    if (statusBarWidget) {

      let element = statusBarWidget.domNode;

      if (statusBarWidget.overlapScroll) {
        element.style.top = editor.getDomNode().clientHeight - 20 + 'px';
      }
      else {        
        let layout = getActiveEditor().getLayoutInfo();
        element.style.top = (editor.getDomNode().offsetHeight - 20 - layout.horizontalScrollbarHeight) + 'px';
      }

    }

  }

  function checkBookmarksAfterNewLine() {

    let line = getCurrentLine();
    let content = getLineContent(line);

    if (content)
      line--;

    let line_check = getLineCount();

    while (line <= line_check) {

      let bookmark = editor.bookmarks.get(line_check);

      if (bookmark) {
        bookmark.range.startLineNumber = line_check + 1;
        bookmark.range.endLineNumber = line_check + 1;
        editor.bookmarks.set(line_check + 1, bookmark);
        editor.bookmarks.delete(line_check);
      }

      line_check--;

    }

    updateBookmarks(undefined);

  }

  function checkBookmarksAfterRemoveLine(contentChangeEvent) {

    if (contentChangeEvent.changes.length && editor.checkBookmarks) {

      let changes = contentChangeEvent.changes[0];
      let range = changes.range;

      if (!changes.text && range.startLineNumber != range.endLineNumber) {

        let line = range.startLineNumber;
        let prev_bookmark = editor.bookmarks.get(range.endLineNumber);

        if (prev_bookmark) {

          for (l = line; l <= range.endLineNumber; l++) {
            editor.bookmarks.delete(l);
          }

          prev_bookmark.range.startLineNumber = line;
          prev_bookmark.range.endLineNumber = line;
          editor.bookmarks.set(line, prev_bookmark);

        }

        for (l = line + 1; l <= range.endLineNumber; l++) {
          editor.bookmarks.delete(l);
        }

        let line_check = range.endLineNumber;
        let diff = range.endLineNumber - line;

        while (line_check < getLineCount()) {

          let bookmark = editor.bookmarks.get(line_check);

          if (bookmark) {
            bookmark.range.startLineNumber = line_check - diff;
            bookmark.range.endLineNumber = line_check - diff;
            editor.bookmarks.set(line_check - diff, bookmark);
            editor.bookmarks.delete(line_check);
          }

          line_check++;

        }

      }

    }

  }

  function checkBookmarksCount() {

    let count = getLineCount();
    let keys = [];

    editor.bookmarks.forEach(function (value, key) {
      if (count < key)
        keys.push(key);
    });

    keys.forEach(function (key) {
      editor.bookmarks.delete(key);
    });

  }

  function checkEmptySuggestions() {

    let msg_element = document.querySelector('.suggest-widget .message');

    if (msg_element && msg_element.innerText && !msg_element.style.display) {

      let word = editor.getModel().getWordAtPosition(editor.getPosition());

      if (!word) {
        hideSuggestionsList();
        setTimeout(() => {
          triggerSuggestions();
        }, 10);
      }

    }

  }

  function getCurrentThemeName() {

    let queryPostfix = '-query';
    let currentTheme = editor._themeService.getTheme().themeName;
    let is_query = (queryMode || DCSMode);

    if (is_query && currentTheme.indexOf(queryPostfix) == -1)
      currentTheme += queryPostfix;
    else if (!is_query && currentTheme.indexOf(queryPostfix) >= 0)
      currentTheme = currentTheme.replace(queryPostfix, '');

    return currentTheme;

  }

  function isDiffEditorHasChanges() {
    
    return diffEditor.getOriginalEditor().getValue() != diffEditor.getModifiedEditor().getValue();

  }

  function getDiffChanges() {

    const changes = diffEditor.getLineChanges();
  
    if (Array.isArray(changes)) {
  
      editor.diffCount = changes.length;
      editor.diff_decorations = [];
  
      if (isDiffEditorHasChanges()) {

        changes.forEach(function (e) {
    
          const startLineNumber = e.modifiedStartLineNumber;
          const endLineNumber = e.modifiedEndLineNumber || startLineNumber;
    
          let color = '#f8a62b';
          let class_name = 'diff-changed';
          let range = new monaco.Range(startLineNumber, 1, endLineNumber, 1);
    
          if (e.originalEndLineNumber === 0) {
            color = '#10aa00';
            class_name = 'diff-new';
          } else if (e.modifiedEndLineNumber === 0) {
            color = '#dd0000';
            class_name = 'diff-removed';
            range = new monaco.Range(startLineNumber, Number.MAX_VALUE, startLineNumber, Number.MAX_VALUE);
          }
    
          editor.diff_decorations.push({
            range: range,
            options: {
              isWholeLine: true,
              linesDecorationsClassName: 'diff-navi ' + class_name,
              overviewRuler: {
                color: color,
                darkColor: color,
                position: 4
              }
            }
          });
        });

      }
  
      editor.updateDecorations([]);
      editor.diffTimer = 0;
  
    }
  
  }

  function calculateDiff() {

    if (editor.calculateDiff) {

      if (editor.diffTimer)
        clearTimeout(editor.diffTimer);

      editor.diffTimer = setTimeout(() => {
                
        if (!diffEditor) {
          diffEditor = monaco.editor.createDiffEditor(document.createElement("div"));
          diffEditor.onDidUpdateDiff(() => {
            getDiffChanges();
          });
        }

        diffEditor.setModel({
          original: monaco.editor.createModel(editor.originalText),
          modified: editor.getModel()
        });

      }, 50);

    }

  }

  function createStatusBarWidget(overlapScroll) {

    statusBarWidget = {
      domNode: null,
      overlapScroll: overlapScroll,
      getId: function () {
        return 'bsl.statusbar.widget';
      },
      getDomNode: function () {

        if (!this.domNode) {

          this.domNode = document.createElement('div');
          this.domNode.classList.add('statusbar-widget');
          if (this.overlapScroll) {
            this.domNode.style.right = '0';
            this.domNode.style.top = editor.getDomNode().offsetHeight - 20 + 'px';
          }
          else {
            let layout = getActiveEditor().getLayoutInfo();
            this.domNode.style.right = layout.verticalScrollbarWidth + 'px';
            this.domNode.style.top = (editor.getDomNode().offsetHeight - 20 - layout.horizontalScrollbarHeight) + 'px';
          }
          this.domNode.style.height = '20px';
          this.domNode.style.minWidth = '125px';
          this.domNode.style.textAlign = 'center';
          this.domNode.style.zIndex = 1;
          this.domNode.style.fontSize = '13px';

          let pos = document.createElement('div');
          pos.style.margin = 'auto 10px';
          this.domNode.appendChild(pos);

        }

        return this.domNode;

      },
      getPosition: function () {
        return null;
      }
    };

    if (editor.navi)
      editor.getModifiedEditor().addOverlayWidget(statusBarWidget);
    else
      editor.addOverlayWidget(statusBarWidget);

    updateStatusBar();

  }
  
  function createDiffWidget(e) {

    if (inlineDiffWidget) {
      
      editor.removeDiffWidget();

    }
    else {

      let element = e.target.element;
      let line_number = e.target.position.lineNumber;
      
      let reveal_line = false;
      
      if (line_number == getLineCount()) {
        line_number--;
        reveal_line = true;
      }

      let class_name = 'new-block';

      if (element.classList.contains('diff-changed'))
        class_name = 'changed-block';
      else if (element.classList.contains('diff-removed'))
        class_name = 'removed-block';

      editor.changeViewZones(function (changeAccessor) {

        let domNode = document.getElementById('diff-zone');

        if (!domNode) {
          domNode = document.createElement('div');
          domNode.setAttribute('id', 'diff-zone');
        }

        editor.removeDiffWidget();

        editor.diffZoneId = changeAccessor.addZone({
          afterLineNumber: line_number,
          afterColumn: 1,
          heightInLines: 10,
          domNode: domNode,
          onDomNodeTop: function (top) {
            if (inlineDiffWidget) {
              let layout = editor.getLayoutInfo();
              inlineDiffWidget.domNode.style.top = top + 'px';          
              inlineDiffWidget.domNode.style.width = (layout.contentWidth - layout.verticalScrollbarWidth) + 'px';
            }
          }
        });

      });

      setTimeout(() => {

        inlineDiffWidget = {
          domNode: null,
          getId: function () {
            return 'bsl.diff.widget';
          },
          getDomNode: function () {

            if (!this.domNode) {

              this.domNode = document.createElement('div');
              this.domNode.setAttribute("id", "diff-widget");

              let layout = editor.getLayoutInfo();
              let diff_zone = document.getElementById('diff-zone');
              let rect = diff_zone.getBoundingClientRect();

              this.domNode.style.left = (rect.left - 1) + 'px';
              this.domNode.style.top = rect.top + 'px';
              this.domNode.style.height = rect.height + 'px';
              this.domNode.style.width = (layout.contentWidth - layout.verticalScrollbarWidth) + 'px';

              let currentTheme = getCurrentThemeName();

              let header = document.createElement('div');
              header.classList.add('diff-header');
              header.classList.add(class_name);

              if (0 <= currentTheme.indexOf('dark'))
                header.classList.add('dark');

              header.innerText = engLang ? 'changes': 'изменения';

              let close_button = document.createElement('div');
              close_button.classList.add('diff-close');
              close_button.onclick = editor.removeDiffWidget;
              header.appendChild(close_button);

              this.domNode.appendChild(header);

              let body = document.createElement('div');
              body.classList.add('diff-body');
              body.classList.add(class_name);            
              this.domNode.appendChild(body);

              setTimeout(() => {

                let language_id = getCurrentLanguageId();              

                inlineDiffEditor = monaco.editor.createDiffEditor(body, {
                  theme: currentTheme,
                  language: language_id,
                  contextmenu: false,
                  automaticLayout: true,
                  renderSideBySide: false
                });

                let originalModel = monaco.editor.createModel(editor.originalText);
                let modifiedModel = editor.getModel();

                monaco.editor.setModelLanguage(originalModel, language_id);

                inlineDiffEditor.setModel({
                  original: originalModel,
                  modified: modifiedModel
                });

                inlineDiffEditor.navi = monaco.editor.createDiffNavigator(inlineDiffEditor, {
                  followsCaret: true,
                  ignoreCharChanges: true
                });

                setTimeout(() => {
                  inlineDiffEditor.revealLineInCenter(line_number);
                }, 10);

                if (reveal_line)
                  editor.revealLine(line_number + 1);

              }, 10);

            }

            return this.domNode;

          },
          getPosition: function () {
            return null;
          }
        };

        editor.addOverlayWidget(inlineDiffWidget);

      }, 50);

    }

  }

  function removeSuggestListInactiveDetails() {

    document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
      node.classList.remove('inactive-detail');
    });

    document.querySelectorAll('.monaco-list-rows .readMore').forEach(function (node) {
      node.classList.remove('inactive-more');
    });

  }
  
  function onSuggestListMouseOver(activationEventEnabled) {

    let widget = getSuggestWidget().widget;

    if (activationEventEnabled) {

      widget.listElement.onmouseoverOrig = widget.listElement.onmouseover;
      widget.listElement.onmouseover = function (e) {

        removeSuggestListInactiveDetails();

        let parent_row = getParentWithClass(e.target, 'monaco-list-row');

        if (parent_row) {

          if (!parent_row.classList.contains('focused')) {

            let details = getChildWithClass(parent_row, 'details-label');

            if (details) {
              details.classList.add('inactive-detail');
              generateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'hover', parent_row);
            }

            let read_more = getChildWithClass(parent_row, 'readMore');

            if (read_more)
              read_more.classList.add('inactive-more');

            if (typeof (widget.listElement.onmouseoverOrig) == 'function')
              widget.listElement.onmouseoverOrig(e);

          }

        }

      }

    }
    else {

      if (widget.listElement.onmouseoverOrig)
        widget.listElement.onmouseover = suggestWidget.widget.listElement.onmouseoverOrig;

    }

  }

  function eraseTextBeforeUpdate() {

    editor.checkBookmarks = false;
    bslHelper.setText('', editor.getModel().getFullModelRange(), false);
    editor.checkBookmarks = true;

  }

  function showVariablesDisplay() {

    showDisplayPanel();
    switchDisplayTab('variables');

  }

  function hideVariablesDisplay() {
    
    hideDisplayPanel();

  }

  function showDisplayPanel() {

    document.getElementById("container").style.height = "70%";
    getActiveEditor().layout();
    updateDisplayTabLabels();
    let element = document.getElementById("display");
    element.style.height = "30%";
    element.style.display = "block";
    // Reset collapsed state when showing panel
    debugPanelCollapsed = false;
    let collapseBtn = document.getElementById('display-collapse');
    if (collapseBtn) collapseBtn.classList.remove('collapsed');
    resnapDebugToolbar();

  }

  function hideDisplayPanel() {
    
    document.getElementById("container").style.height = "100%";
    getActiveEditor().layout();
    let element = document.getElementById("display");
    element.style.height = "0";
    element.style.display = "none";
    if (treeview) {
      treeview.dispose();
      treeview = null;
    }
    clearDebugLists();
    resnapDebugToolbar();

  }

  function updateDisplayTabLabels() {

    let tabs = document.querySelectorAll('#display-tabs .display-tab');
    let labels = engLang
      ? { variables: 'Variables', messages: 'Messages', errors: 'Errors', callstack: 'Call Stack' }
      : { variables: 'Переменные', messages: 'Сообщения', errors: 'Ошибки', callstack: 'Стек вызовов' };

    tabs.forEach(function(tab) {
      let key = tab.getAttribute('data-tab');
      let labelEl = tab.querySelector('.tab-label');
      if (labelEl && labels[key]) {
        labelEl.textContent = labels[key];
      }
    });

  }

  function switchDisplayTab(tabName) {

    document.querySelectorAll('#display-tabs .display-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('#display .display-content').forEach(function(content) {
      content.classList.toggle('active', content.id === tabName + '-display');
    });

  }

  function updateTabBadge(tabName, count) {

    let badge = document.getElementById('badge-' + tabName);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.add('visible');
    } else {
      badge.textContent = '';
      badge.classList.remove('visible');
    }

  }

  function clearDebugLists() {

    document.getElementById('messages-list').innerHTML = '';
    document.getElementById('errors-list').innerHTML = '';
    document.getElementById('callstack-list').innerHTML = '';
    updateTabBadge('variables', 0);
    updateTabBadge('messages', 0);
    updateTabBadge('errors', 0);
    updateTabBadge('callstack', 0);

  }

  showDebugPanel = function(dataJSON) {

    try {

      let data = typeof dataJSON === 'string' ? JSON.parse(dataJSON) : dataJSON;

      // Variables
      if (data.variables) {
        let variables = typeof data.variables === 'string' ? JSON.parse(data.variables) : data.variables;
        debugLastVariablesData = variables;
        rebuildVariablesTreeWithExpressions(variables);
      }

      // Messages
      let msgList = document.getElementById('messages-list');
      msgList.innerHTML = '';
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(function(msg) {
          let item = document.createElement('div');
          item.className = 'debug-list-item';
          item.textContent = String(msg);
          msgList.appendChild(item);
        });
        updateTabBadge('messages', data.messages.length);
      } else {
        msgList.innerHTML = '<div class="debug-list-empty">' + (engLang ? 'No messages' : 'Нет сообщений') + '</div>';
        updateTabBadge('messages', 0);
      }

      // Errors
      let errList = document.getElementById('errors-list');
      errList.innerHTML = '';
      if (data.errors && data.errors.length > 0) {
        data.errors.forEach(function(err) {
          let item = document.createElement('div');
          item.className = 'debug-list-item error-item';
          if (typeof err === 'object' && err !== null) {
            let errText = err.text || err['Название'] || '';
            let errLine = err.line || err['Строка'] || 0;
            if (errText) {
              item.textContent = errText;
            } else {
              item.textContent = JSON.stringify(err);
            }
            if (errLine) {
              item.dataset.line = errLine;
              item.style.cursor = 'pointer';
              let lineSpan = document.createElement('span');
              lineSpan.className = 'error-line';
              lineSpan.textContent = (engLang ? ' (line ' : ' (строка ') + errLine + ')';
              item.appendChild(lineSpan);
            }
          } else {
            item.textContent = String(err);
          }
          errList.appendChild(item);
        });
        updateTabBadge('errors', data.errors.length);
      } else {
        errList.innerHTML = '<div class="debug-list-empty">' + (engLang ? 'No errors' : 'Нет ошибок') + '</div>';
        updateTabBadge('errors', 0);
      }

      // Call Stack
      let stackList = document.getElementById('callstack-list');
      stackList.innerHTML = '';
      if (data.callStack && data.callStack.length > 0) {
        data.callStack.forEach(function(frame, index) {
          let item = document.createElement('div');
          item.className = 'debug-list-item callstack-item';
          if (typeof frame === 'object' && frame !== null) {
            let frameName = frame.name || frame['Название'] || '';
            let frameLine = frame.line || frame['Строка'] || 0;
            if (frameName) {
              let nameSpan = document.createElement('span');
              nameSpan.className = 'callstack-name';
              nameSpan.textContent = frameName;
              item.appendChild(nameSpan);
            } else {
              item.textContent = JSON.stringify(frame);
            }
            if (frameLine) {
              item.dataset.line = frameLine;
              let lineSpan = document.createElement('span');
              lineSpan.className = 'callstack-line';
              lineSpan.textContent = (engLang ? 'line ' : 'строка ') + frameLine;
              item.appendChild(lineSpan);
            }
          } else {
            item.textContent = String(frame);
          }
          item.dataset.index = index;
          stackList.appendChild(item);
        });
        updateTabBadge('callstack', data.callStack.length);
      } else {
        stackList.innerHTML = '<div class="debug-list-empty">' + (engLang ? 'No call stack' : 'Стек пуст') + '</div>';
        updateTabBadge('callstack', 0);
      }

      // Auto-select tab: errors if present, otherwise variables
      if (data.errors && data.errors.length > 0) {
        switchDisplayTab('errors');
      } else if (!document.querySelector('#display-tabs .display-tab.active')) {
        switchDisplayTab('variables');
      }

      showDisplayPanel();

      return true;

    }
    catch (e) {
      return { errorDescription: e.message };
    }

  }

  hideDebugPanel = function() {

    hideDisplayPanel();

  }

  function rebuildVariablesTree(variables) {
    if (treeview != null) {
      treeview.dispose();
      treeview = null;
    }
    let varCount = Object.keys(variables).length;
    treeview = new Treeview("#variables-tree", editor, "./tree/icons/");
    treeview.replaceData(variables);
    updateTabBadge('variables', varCount);
  }

  function rebuildVariablesTreeWithExpressions(variables) {
    // Merge VM variables with custom watch expressions
    let merged = {};
    // Copy all VM variables first
    Object.keys(variables).forEach(function(key) {
      merged[key] = variables[key];
    });
    // Append custom expressions (skip if already present by label)
    let counter = 0;
    debugCustomExpressions.forEach(function(expr) {
      let alreadyPresent = false;
      Object.keys(variables).forEach(function(key) {
        if (variables[key] && variables[key].label === expr) {
          alreadyPresent = true;
        }
      });
      if (!alreadyPresent) {
        merged['_watch_' + counter] = {
          label: expr,
          value: engLang ? 'Undefined' : 'Неопределено',
          type: '',
          path: '',
          class: 'final'
        };
        counter++;
      }
    });
    rebuildVariablesTree(merged);
  }

  function updateCommandBarVisibility() {
    // Command bar removed — function kept as no-op for compatibility
  }

  function setThemeVariablesDisplay(theme) {

    if (0 < theme.indexOf('dark'))
      document.getElementById("display").classList.add('dark');
    else
      document.getElementById("display").classList.remove('dark');

  }
  // #endregion

  // #region browser events
  document.onclick = function (e) {

    if (e.target.classList.contains('codicon-close')) {

      if (hasParentWithClass(e.target, 'find-widget'))
        setFindWidgetDisplay('none');

    }
    else if (e.target.id == 'event-button' && events_queue.length) {
      let eventData1C = events_queue.shift();
      e.eventData1C = eventData1C;
      console.debug(eventData1C.event, eventData1C.params);

    }

  }

  document.onkeypress = function (e) {

    editor.lastKeyCode = e.keyCode;

    let char = String.fromCharCode(e.keyCode);

    if (Array.isArray(activeSuggestionAcceptors) && 0 <= activeSuggestionAcceptors.indexOf(char.toLowerCase())) {

      let element = document.querySelector('.monaco-list-row.focused');

      if (element) {

        let fire_event = getOption('generateSelectSuggestEvent');

        if (fire_event) {
          generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'force-selection-' + char, element);
        }

        if (!editor.skipAcceptionSelectedSuggestion)
          editor.trigger('', 'acceptSelectedSuggestion');

        return editor.skipInsertSuggestionAcceptor ? false : true;

      }

    }

  };

  window.addEventListener('resize', function(event) {
    
    if (editor.autoResizeEditorLayout)
      editor.layout();
    else
      resizeStatusBar();    
    
  }, true);

  // display-close removed — collapse button handles panel toggling

  document.getElementById("display-tabs").addEventListener("click", (event) => {

    let tab = event.target.closest('.display-tab');
    if (tab) {
      switchDisplayTab(tab.getAttribute('data-tab'));
    }

  });

  document.getElementById("callstack-list").addEventListener("click", (event) => {

    let item = event.target.closest('.callstack-item');
    if (item && item.dataset.line) {
      let line = parseInt(item.dataset.line, 10);
      if (line > 0) {
        editor.revealLineInCenter(line);
        editor.setPosition(new monaco.Position(line, 1));
        flashEditorLine(line, 'flash-line-yellow', 1500);
      }
      // Highlight clicked item briefly
      document.querySelectorAll('.callstack-item').forEach(function(el) {
        el.classList.remove('callstack-highlight');
      });
      item.classList.add('callstack-highlight');
      setTimeout(function() { item.classList.remove('callstack-highlight'); }, 1500);
    }

  });

  document.getElementById("errors-list").addEventListener("click", (event) => {

    let item = event.target.closest('.error-item');
    if (item && item.dataset.line) {
      let line = parseInt(item.dataset.line, 10);
      if (line > 0) {
        editor.revealLineInCenter(line);
        editor.setPosition(new monaco.Position(line, 1));
        flashEditorLine(line, 'flash-line-red', 1500);
      }
    }

  });

  // Resize handle: drag to resize display panel
  (function() {
    var resizeHandle = document.getElementById('display-resize-handle');
    var isDragging = false;
    var startY = 0;
    var startContainerHeight = 0;
    var startDisplayHeight = 0;

    resizeHandle.addEventListener('mousedown', function(e) {
      var display = document.getElementById('display');
      if (display.style.display === 'none') return;
      if (debugPanelCollapsed) return;
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      var totalHeight = document.body.clientHeight;
      var container = document.getElementById('container');
      startContainerHeight = container.offsetHeight;
      startDisplayHeight = display.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var delta = startY - e.clientY;
      var totalHeight = document.body.clientHeight;
      var newDisplayHeight = startDisplayHeight + delta;
      var minDisplay = 28;
      var minContainer = 80;
      if (newDisplayHeight < minDisplay) newDisplayHeight = minDisplay;
      if (totalHeight - newDisplayHeight < minContainer) newDisplayHeight = totalHeight - minContainer;
      var displayPct = (newDisplayHeight / totalHeight * 100).toFixed(2) + '%';
      var containerPct = ((totalHeight - newDisplayHeight) / totalHeight * 100).toFixed(2) + '%';
      document.getElementById('container').style.height = containerPct;
      document.getElementById('display').style.height = displayPct;
      getActiveEditor().layout();
    });

    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resnapDebugToolbar();
    });
  })();

  // Collapse/expand button
  document.getElementById('display-collapse').addEventListener('click', function() {
    let display = document.getElementById('display');
    let container = document.getElementById('container');
    let btn = this;
    if (debugPanelCollapsed) {
      // Expand
      container.style.height = '70%';
      display.style.height = '30%';
      btn.classList.remove('collapsed');
      btn.title = engLang ? 'Collapse' : 'Свернуть';
      debugPanelCollapsed = false;
    } else {
      // Collapse to header only
      container.style.height = 'calc(100% - 28px)';
      display.style.height = '28px';
      btn.classList.add('collapsed');
      btn.title = engLang ? 'Expand' : 'Развернуть';
      debugPanelCollapsed = true;
    }
    getActiveEditor().layout();
    resnapDebugToolbar();
  });

  // Show display panel collapsed by default
  (function() {
    let display = document.getElementById('display');
    let container = document.getElementById('container');
    let collapseBtn = document.getElementById('display-collapse');
    display.style.display = 'block';
    display.style.height = '28px';
    container.style.height = 'calc(100% - 28px)';
    collapseBtn.classList.add('collapsed');
    collapseBtn.title = engLang ? 'Expand' : 'Развернуть';
    debugPanelCollapsed = true;
    updateDisplayTabLabels();
    getActiveEditor().layout();
  })();

  // Variables context menu
  var ctxMenu = document.getElementById('variables-context-menu');
  var ctxTarget = null;

  document.getElementById('variables-tree').addEventListener('contextmenu', function(e) {
    let summary = e.target.closest('summary');
    if (!summary) return;
    e.preventDefault();
    ctxTarget = summary;
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.style.display = 'block';
    // Apply dark theme
    if (document.getElementById('display').classList.contains('dark')) {
      ctxMenu.classList.add('dark');
    } else {
      ctxMenu.classList.remove('dark');
    }
  });

  document.addEventListener('click', function() {
    ctxMenu.style.display = 'none';
  });

  ctxMenu.addEventListener('click', function(e) {
    let item = e.target.closest('.ctx-menu-item');
    if (!item || !ctxTarget) return;
    let action = item.dataset.action;
    if (action === 'evaluate') {
      let label = ctxTarget.dataset.label || ctxTarget.textContent.trim().split(' ')[0];
      if (label) {
        sendEvent('EVENT_EVALUATE_EXPRESSION', label);
      }
    } else if (action === 'delete') {
      let label = ctxTarget.dataset.label || '';
      if (label) {
        let idx = debugCustomExpressions.indexOf(label);
        if (idx !== -1) debugCustomExpressions.splice(idx, 1);
      }
      let details = ctxTarget.closest('details');
      if (details) {
        details.remove();
        let remaining = document.querySelectorAll('#variables-tree > details').length;
        updateTabBadge('variables', remaining);
      }
    }
    ctxMenu.style.display = 'none';
    ctxTarget = null;
  });
  // #endregion

});

