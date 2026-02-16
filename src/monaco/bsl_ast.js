/**
 * bsl_ast.js — AST service for BSL code using lezer-bsl parser.
 *
 * Provides structural analysis of BSL code for the Monaco editor:
 *   - Incremental parsing (updates tree on each edit)
 *   - Finding nearest assignment to a variable before a given offset
 *   - Resolving expression chains (Pet.Получить("category").Получить("id"))
 *   - Extracting expression type from AST nodes
 *
 * Depends on: lezer-bsl.js (IIFE bundle exposing window.LezerBsl)
 *
 * Usage:
 *   const ast = new BslAstService();
 *   ast.attachEditor(monacoEditor);  // hooks into onDidChangeModelContent
 *   // ... later, from bsl_helper:
 *   let expr = ast.findNearestAssignment('данные', offset);
 *   // expr = { from, to, rhs: 'Order' } or { from, to, rhs: 'Pet.Получить("category")' }
 */

// Node type IDs from lezer-bsl terms
const AST_NODE = typeof LezerBsl !== 'undefined' ? {
	Module:            LezerBsl.terms.Module,
	ModuleBlock:       LezerBsl.terms.ModuleBlock,
	Block:             LezerBsl.terms.Block,
	AssignmentStmt:    LezerBsl.terms.AssignmentStmt,
	ForEachStmt:       LezerBsl.terms.ForEachStmt,
	VariableName:      LezerBsl.terms.VariableName,
	CallExpr:          LezerBsl.terms.CallExpr,
	MemberExpr:        LezerBsl.terms.MemberExpr,
	String:            LezerBsl.terms.String,
	ArgList:           LezerBsl.terms.ArgList,
	ProcedureDef:      LezerBsl.terms.ProcedureDef,
	FunctionDef:       LezerBsl.terms.FunctionDef,
} : {};


class BslAstService {

	constructor() {
		this._parser = null;
		this._tree = null;
		this._text = '';
		this._editor = null;
		this._disposable = null;
		this._debugPanel = null;
		this._debugContent = null;
		this._debugLines = [];
		this._debugMaxLines = 200;
		this.debug = false;  // Set bslAstService.debug = true to enable logging
	}

	// =========================================================================
	// Debug panel (floating overlay in the editor page)
	// =========================================================================

	_ensureDebugPanel() {

		if (this._debugPanel)
			return;

		if (typeof document === 'undefined')
			return;

		// Container
		let panel = document.createElement('div');
		panel.id = 'ast-debug-panel';
		panel.style.cssText = 
			'position:fixed; bottom:0; right:0; width:50%; height:260px;' +
			'background:#1e1e1e; color:#ccc; font:11px/1.4 Consolas,monospace;' +
			'border-top:2px solid #555; z-index:99999; display:flex; flex-direction:column;';

		// Header bar
		let header = document.createElement('div');
		header.style.cssText =
			'display:flex; align-items:center; justify-content:space-between;' +
			'padding:2px 8px; background:#333; color:#eee; font-size:11px; flex-shrink:0;' +
			'cursor:move; user-select:none;';
		header.innerHTML = '<span>Debug — [AST] [Schema]</span>';

		// Buttons
		let btns = document.createElement('span');

		let clearBtn = document.createElement('button');
		clearBtn.textContent = 'Clear';
		clearBtn.style.cssText = 'margin-left:8px; padding:1px 6px; font-size:10px; cursor:pointer;';
		clearBtn.onclick = () => { this._debugLines = []; this._debugContent.textContent = ''; };

		let closeBtn = document.createElement('button');
		closeBtn.textContent = 'X';
		closeBtn.style.cssText = 'margin-left:4px; padding:1px 6px; font-size:10px; cursor:pointer;';
		closeBtn.onclick = () => { panel.style.display = 'none'; };

		btns.appendChild(clearBtn);
		btns.appendChild(closeBtn);
		header.appendChild(btns);

		// Content area
		let content = document.createElement('pre');
		content.style.cssText =
			'flex:1; overflow:auto; margin:0; padding:4px 8px; white-space:pre-wrap; word-break:break-all;';

		panel.appendChild(header);
		panel.appendChild(content);
		document.body.appendChild(panel);

		this._debugPanel = panel;
		this._debugContent = content;

		// Drag support
		let dragging = false, startX, startY, startLeft, startTop;
		header.addEventListener('mousedown', (e) => {
			dragging = true;
			startX = e.clientX; startY = e.clientY;
			let rect = panel.getBoundingClientRect();
			startLeft = rect.left; startTop = rect.top;
			// Switch to top/left positioning
			panel.style.bottom = 'auto'; panel.style.right = 'auto';
			panel.style.left = startLeft + 'px'; panel.style.top = startTop + 'px';
			e.preventDefault();
		});
		document.addEventListener('mousemove', (e) => {
			if (!dragging) return;
			panel.style.left = (startLeft + e.clientX - startX) + 'px';
			panel.style.top = (startTop + e.clientY - startY) + 'px';
		});
		document.addEventListener('mouseup', () => { dragging = false; });

	}

	/**
	 * Write a line to the debug panel (and console).
	 * @param {string} tag - e.g. '[AST]' or '[Schema]'
	 * @param {string} color - CSS color for the tag
	 * @param {string} level - 'log' or 'warn'
	 * @param {...*} args - message parts
	 */
	debugOut(tag, color, level, ...args) {

		if (!this.debug) return;

		let msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');

		// Console
		if (level === 'warn')
			console.warn('%c' + tag, 'color:' + color + '; font-weight:bold;', ...args);
		else
			console.log('%c' + tag, 'color:' + color + '; font-weight:bold;', ...args);

		// Panel
		this._ensureDebugPanel();
		if (!this._debugContent) return;

		let line = document.createElement('div');
		let tagSpan = document.createElement('span');
		tagSpan.style.cssText = 'color:' + color + '; font-weight:bold;';
		tagSpan.textContent = tag + ' ';
		line.appendChild(tagSpan);

		if (level === 'warn')
			line.style.color = '#fa0';

		line.appendChild(document.createTextNode(msg));
		this._debugContent.appendChild(line);

		// Trim old lines
		this._debugLines.push(line);
		while (this._debugLines.length > this._debugMaxLines) {
			let old = this._debugLines.shift();
			if (old.parentNode) old.parentNode.removeChild(old);
		}

		// Auto-scroll
		this._debugContent.scrollTop = this._debugContent.scrollHeight;

	}

	/**
	 * Show/hide the debug panel.
	 */
	showDebugPanel(visible) {
		this._ensureDebugPanel();
		if (this._debugPanel)
			this._debugPanel.style.display = (visible === false) ? 'none' : 'flex';
	}

	_log(...args) {
		this.debugOut('[AST]', '#0aa', 'log', ...args);
	}

	_warn(...args) {
		this.debugOut('[AST]', '#fa0', 'warn', ...args);
	}

	/**
	 * Initializes the lezer-bsl parser.
	 * Called lazily on first use.
	 */
	_ensureParser() {

		if (this._parser)
			return true;

		if (typeof LezerBsl === 'undefined' || !LezerBsl.LezerBslParser)
			return false;

		this._parser = new LezerBsl.LezerBslParser();
		return true;

	}

	/**
	 * Attach to a Monaco editor instance.
	 * Listens for content changes and performs incremental parsing.
	 *
	 * @param {object} monacoEditor - Monaco editor instance
	 */
	attachEditor(monacoEditor) {

		this.detach();
		this._editor = monacoEditor;

		if (!this._ensureParser()) {
			this._warn('_ensureParser() returned false — AST disabled');
			return;
		}

		// Initial full parse
		this._text = monacoEditor.getValue();
		this._tree = this._parser.parse(this._text);
		this._log('attachEditor: initial parse done,', this._text.length, 'chars');

		// Incremental updates
		this._disposable = monacoEditor.onDidChangeModelContent((e) => {

			if (!this._parser)
				return;

			let changes = [];
			for (let change of e.changes) {
				changes.push({
					rangeOffset: change.rangeOffset,
					rangeLength: change.rangeLength,
					text: change.text
				});
			}

			this._text = monacoEditor.getValue();
			this._tree = this._parser.update(this._text, changes);
			this._log('incremental update:', changes.length, 'change(s),', this._text.length, 'chars');

		});

	}

	/**
	 * Detach from the current editor.
	 */
	detach() {

		if (this._disposable) {
			this._disposable.dispose();
			this._disposable = null;
		}

		this._editor = null;
		this._tree = null;
		this._text = '';

	}

	/**
	 * Force a full re-parse of the current editor content.
	 */
	reparse() {

		if (!this._editor || !this._ensureParser())
			return;

		this._text = this._editor.getValue();
		this._tree = this._parser.parse(this._text);

	}

	/**
	 * Get the current AST tree (may be null if not attached).
	 */
	getTree() {
		return this._tree;
	}

	/**
	 * Get a substring of the source text.
	 */
	getText(from, to) {
		return this._text.substring(from, to);
	}

	/**
	 * Convert a Monaco position (line, column) to an offset in the text.
	 * @param {number} lineNumber - 1-based line
	 * @param {number} column - 1-based column
	 * @returns {number} 0-based offset
	 */
	positionToOffset(lineNumber, column) {
		if (this._editor) {
			let model = this._editor.getModel();
			if (model)
				return model.getOffsetAt({ lineNumber: lineNumber, column: column });
		}
		return 0;
	}

	// =========================================================================
	// Assignment resolution
	// =========================================================================

	/**
	 * Find all AssignmentStmt nodes for a given variable name.
	 * Returns them sorted by position (ascending).
	 *
	 * @param {string} varName - variable name (case-insensitive)
	 * @returns {Array<{from: number, to: number, varFrom: number, varTo: number, exprFrom: number, exprTo: number}>}
	 */
	findAllAssignments(varName) {

		if (!this._tree || !this._text)
			return [];

		let results = [];
		let nameLower = varName.toLowerCase();
		this._log('findAllAssignments:', JSON.stringify(varName));
		let cursor = this._tree.cursor();

		do {

			if (cursor.type.id === AST_NODE.AssignmentStmt) {

				// Enter AssignmentStmt to find VariableName child
				let stmtFrom = cursor.from;
				let stmtTo = cursor.to;

				if (cursor.firstChild()) {

					if (cursor.type.id === AST_NODE.VariableName) {

						let vText = this._text.substring(cursor.from, cursor.to);

						if (vText.toLowerCase() === nameLower) {

							// Find Expression child (skip AssignOp)
							let exprFrom = -1, exprTo = -1;
							let savedVarFrom = cursor.from, savedVarTo = cursor.to;

							while (cursor.nextSibling()) {
								if (cursor.name === 'Expression') {
									exprFrom = cursor.from;
									exprTo = cursor.to;
									break;
								}
							}

							results.push({
								from: stmtFrom,
								to: stmtTo,
								varFrom: savedVarFrom,
								varTo: savedVarTo,
								exprFrom: exprFrom,
								exprTo: exprTo
							});

						}

					}

					cursor.parent();

				}

			}

		} while (cursor.next());

		// --- Also find ForEachStmt where varName is the loop variable ---
		// Structure: ForEachStmt > for, each, VariableName, in, Collection(>expr), do, Block, endDo
		cursor = this._tree.cursor();
		do {
			if (cursor.type.id === AST_NODE.ForEachStmt) {
				let stmtFrom = cursor.from;
				let stmtTo = cursor.to;

				if (cursor.firstChild()) {
					// Walk children to find VariableName and Collection
					let loopVar = null;
					let collectionFrom = -1, collectionTo = -1;

					do {
						if (cursor.type.id === AST_NODE.VariableName && !loopVar) {
							let vText = this._text.substring(cursor.from, cursor.to);
							if (vText.toLowerCase() === nameLower) {
								loopVar = { from: cursor.from, to: cursor.to };
							}
						}
						if (cursor.name === 'Collection') {
							collectionFrom = cursor.from;
							collectionTo = cursor.to;
						}
					} while (cursor.nextSibling());

					if (loopVar && collectionFrom >= 0) {
						results.push({
							from: stmtFrom,
							to: stmtTo,
							varFrom: loopVar.from,
							varTo: loopVar.to,
							exprFrom: collectionFrom,
							exprTo: collectionTo,
							isForEach: true
						});
					}

					cursor.parent();
				}
			}
		} while (cursor.next());

		// Re-sort by position (assignments + forEach mixed)
		results.sort((a, b) => a.from - b.from);

		this._log('  found', results.length, 'assignment(s):', results.map(a =>
			'{offset:' + a.from + '-' + a.to + ', expr:' + JSON.stringify(this._text.substring(a.exprFrom, a.exprTo)) + '}'
		));
		return results;

	}

	/**
	 * Find the nearest assignment to `varName` that occurs BEFORE `offset`.
	 * This is the key method for resolving variable types at a specific
	 * cursor position — it handles reassignment correctly.
	 *
	 * @param {string} varName - variable name (case-insensitive)
	 * @param {number} offset - cursor offset (0-based)
	 * @returns {object|null} { from, to, exprFrom, exprTo, exprText }
	 */
	findNearestAssignment(varName, offset) {

		this._log('findNearestAssignment:', JSON.stringify(varName), 'before offset', offset);
		let all = this.findAllAssignments(varName);
		let best = null;

		for (let a of all) {
			// For regular assignments: the whole statement must end before cursor
			// For ForEach: the loop variable is scoped to the loop body,
			// so the cursor must be inside the ForEachStmt (from..to)
			// and after the collection expression
			if (a.isForEach) {
				if (a.exprTo <= offset && offset <= a.to) {
					best = a;
				}
			} else {
				if (a.to <= offset) {
					best = a;
				}
			}
		}

		if (best && best.exprFrom >= 0) {
			best.exprText = this._text.substring(best.exprFrom, best.exprTo);
		}

		if (best)
			this._log('  → nearest:', JSON.stringify(best.exprText), 'at offset', best.from + '-' + best.to);
		else
			this._warn('  → no assignment found before offset', offset);

		return best;

	}

	// =========================================================================
	// Expression analysis
	// =========================================================================

	/**
	 * Extract a structured representation of an expression at a given offset range.
	 * Walks the AST subtree and returns a chain description.
	 *
	 * Examples:
	 *   "Order"                          → { type: 'variable', name: 'Order' }
	 *   "Pet.Получить("category")"       → { type: 'call', base: {type:'member', object:{type:'variable',name:'Pet'}, property:'Получить'}, args:['category'] }
	 *   "Данные["id"]"                   → { type: 'index', object: {type:'variable',name:'Данные'}, key: 'id' }
	 *
	 * Simplified chain format for schema resolution:
	 *   "Pet.Получить("category")"       → { base: 'pet', chain: ['category'] }
	 *   "Pet.Получить("category").Получить("id")" → { base: 'pet', chain: ['category', 'id'] }
	 *   "Order"                          → { base: 'order', chain: [] }
	 *   "Pet.category"                   → { base: 'pet', chain: ['category'] }
	 *   "Данные["id"]"                   → { base: 'данные', chain: ['id'] }
	 *
	 * @param {number} from - start offset of expression
	 * @param {number} to - end offset of expression
	 * @returns {object|null} { base: string, chain: string[] }
	 */
	resolveExpressionChain(from, to) {

		if (!this._tree)
			return null;

		let exprText = this._text.substring(from, to);
		this._log('resolveExpressionChain:', JSON.stringify(exprText), '(offsets', from + '-' + to + ')');

		let node = this._tree.resolveInner(from, 1);

		// Navigate up to find the Expression or Collection node
		while (node && node.name !== 'Expression' && node.name !== 'Collection' && node.from >= from) {
			node = node.parent;
		}

		if (!node) {
			this._warn('  → no Expression node found');
			return null;
		}

		this._log('  node:', node.name, '[' + node.from + '-' + node.to + ']');
		let result = this._walkExprChain(node);
		this._log('  → chain result:', JSON.stringify(result));
		return result;

	}

	/**
	 * Resolve an expression chain from an AST node.
	 * Recursively walks CallExpr/MemberExpr/VariableName to extract
	 * the base variable and key chain.
	 *
	 * @param {object} node - Lezer SyntaxNode
	 * @returns {object|null} { base: string, chain: string[] }
	 */
	_walkExprChain(node) {

		if (!node) return null;

		let name = node.name;

		// Leaf: VariableName → base variable
		if (name === 'VariableName') {
			return {
				base: this._text.substring(node.from, node.to).toLowerCase(),
				chain: []
			};
		}

		// Expression / Collection wrapper → unwrap to child
		if (name === 'Expression' || name === 'Collection') {
			let child = node.firstChild;
			return child ? this._walkExprChain(child) : null;
		}

		// MemberExpr → object.property or object[index]
		if (name === 'MemberExpr') {
			let obj = node.firstChild;
			if (!obj) return null;

			let result = this._walkExprChain(obj);
			if (!result) return null;

			// Look for PropertyName or Index sibling
			let prop = obj.nextSibling;
			while (prop) {
				if (prop.name === 'PropertyName') {
					result.chain.push(this._text.substring(prop.from, prop.to).toLowerCase());
					return result;
				}
				if (prop.name === 'Index') {
					let indexChild = prop.firstChild;
					if (indexChild && indexChild.name === 'String') {
						// String key: ["key"]
						let raw = this._text.substring(indexChild.from, indexChild.to);
						let key = raw.replace(/^"|"$/g, '');
						result.chain.push(key);
					} else if (indexChild && indexChild.name === 'Number') {
						// Numeric index: [0], [1] → array element access
						result.chain.push('[]');
					} else {
						// Variable/expression index: [i] → assume array element
						result.chain.push('[]');
					}
					return result;
				}
				prop = prop.nextSibling;
			}

			return result;
		}

		// CallExpr → callee(args) — callee is typically MemberExpr (obj.Method)
		if (name === 'CallExpr') {
			let callee = node.firstChild;
			if (!callee) return null;

			let result = this._walkExprChain(callee);
			if (!result) return null;

			// The last element of chain is the method name (e.g., "получить")
			// Check if it's a known getter method; if so, replace it with the arg key
			let methodName = result.chain.length > 0 ? result.chain[result.chain.length - 1] : null;
			let getterMethods = ['получить', 'get', 'вставить', 'insert', 'свойство', 'property', 'установить', 'set', 'удалить', 'delete'];

			if (methodName && getterMethods.indexOf(methodName) >= 0) {
				// Remove method name from chain
				result.chain.pop();

				// Extract first argument from ArgList
				let argList = callee.nextSibling;
				while (argList) {
					if (argList.name === 'ArgList') {
						let arg = argList.firstChild;
						while (arg) {
							if (arg.name === 'String') {
								let raw = this._text.substring(arg.from, arg.to);
								let key = raw.replace(/^"|"$/g, '');
								result.chain.push(key);
								break;
							}
							if (arg.name === 'Number') {
								// Numeric arg: .Получить(0) → array element
								result.chain.push('[]');
								break;
							}
							arg = arg.nextSibling;
						}
						break;
					}
					argList = argList.nextSibling;
				}

				return result;
			}

			// Not a getter method — just return the chain as-is
			return result;
		}

		// ParenthesizedExpr → unwrap
		if (name === 'ParenthesizedExpr') {
			let child = node.firstChild;
			return child ? this._walkExprChain(child) : null;
		}

		// BinaryExpr (e.g. comparison: a = b) → try to walk the last operand
		// This happens when "var = expr" is parsed as comparison inside a wrapper
		if (name === 'BinaryExpr') {
			let lastChild = node.lastChild;
			if (lastChild) {
				this._log('  BinaryExpr fallback → walking last child:', lastChild.name);
				return this._walkExprChain(lastChild);
			}
		}

		this._warn('  _walkExprChain: unhandled node type:', name);
		return null;

	}

	// =========================================================================
	// High-level schema helpers
	// =========================================================================

	/**
	 * Check if an assignment (or the line directly above it) contains
	 * a controlling comment  // @schema TypeName
	 *
	 * @param {number} stmtFrom - start offset of the assignment statement
	 * @param {number} stmtTo   - end offset of the assignment statement
	 * @returns {string|null} type name from comment, or null
	 */
	_extractSchemaComment(stmtFrom, stmtTo) {

		if (!this._text) return null;

		// Find the full line containing the assignment
		let lineEnd = this._text.indexOf('\n', stmtTo);
		if (lineEnd < 0) lineEnd = this._text.length;
		let lineStart = this._text.lastIndexOf('\n', stmtFrom);
		lineStart = lineStart < 0 ? 0 : lineStart + 1;

		let lineText = this._text.substring(lineStart, lineEnd);

		// Check the assignment line itself
		let schemaRe = /\/\/\s*@schema\s+([\w\u0410-\u044F\u0401\u0451]+)/i;
		let m = lineText.match(schemaRe);
		if (m) return m[1];

		// Check the line directly above
		if (lineStart > 0) {
			let prevLineEnd = lineStart - 1;  // points to '\n'
			let prevLineStart = this._text.lastIndexOf('\n', prevLineEnd - 1);
			prevLineStart = prevLineStart < 0 ? 0 : prevLineStart + 1;
			let prevLine = this._text.substring(prevLineStart, prevLineEnd).trim();
			m = prevLine.match(schemaRe);
			if (m) return m[1];
		}

		return null;

	}

	/**
	 * Given a cursor offset and a variable name (from the text before cursor),
	 * find the nearest assignment before cursor and resolve it to a schema chain.
	 *
	 * @param {string} varName - variable name (already lowercased)
	 * @param {number} cursorOffset - 0-based offset of cursor in document
	 * @returns {object|null} { base: string, chain: string[] } or null
	 */
	inferVariableType(varName, cursorOffset) {

		this._log('inferVariableType:', JSON.stringify(varName), 'at cursor offset', cursorOffset);
		let assignment = this.findNearestAssignment(varName, cursorOffset);

		if (!assignment || assignment.exprFrom < 0) {
			this._warn('  → no valid assignment, returning null');
			return null;
		}

		// Check for controlling comment: // @schema TypeName
		// on the same line as the assignment, or on the line directly above
		let schemaType = this._extractSchemaComment(assignment.from, assignment.to);
		if (schemaType) {
			this._log('  @schema comment found:', JSON.stringify(schemaType));
			return { base: schemaType.toLowerCase(), chain: [] };
		}

		let result = this.resolveExpressionChain(assignment.exprFrom, assignment.exprTo);
		// ForEach loop: the variable gets the *element* type of the collection,
		// so append '[]' marker to unwrap array
		if (result && assignment.isForEach) {
			this._log('  forEach detected, appending [] to chain');
			result.chain.push('[]');
		}
		this._log('inferVariableType result:', JSON.stringify(result));
		return result;

	}

	/**
	 * Parse an expression that appears in textBeforePosition (the current line
	 * up to cursor) and return its chain resolution.
	 *
	 * This is used for chained expressions like: Pet.Получить("category").Получить("
	 * We need to resolve "Pet.Получить("category")" part.
	 *
	 * @param {string} exprText - source text of the expression
	 * @returns {object|null} { base: string, chain: string[] }
	 */
	parseExpressionText(exprText) {

		this._log('parseExpressionText:', JSON.stringify(exprText));

		if (!this._ensureParser())
			return null;

		// Wrap in a dummy assignment so the parser treats it as a statement
		let wrappedCode = '__x__ = ' + exprText + ';';
		let tree;

		try {
			// Use a fresh parse (not incremental — this is a small snippet)
			tree = LezerBsl.parser.parse(wrappedCode);
		} catch (e) {
			this._warn('  parse error:', e.message);
			return null;
		}

		// Find the AssignmentStmt → Expression
		let cursor = tree.cursor();
		while (cursor.next()) {
			if (cursor.name === 'Expression') {
				let result = this._walkExprChainFromText(cursor.node, wrappedCode);
				this._log('  → parsed chain:', JSON.stringify(result));
				return result;
			}
		}

		this._warn('  → no Expression node found in wrapped code');
		return null;

	}

	/**
	 * Walk expression chain using a separate text (for parseExpressionText).
	 */
	_walkExprChainFromText(node, text) {

		let savedText = this._text;
		this._text = text;
		let result = this._walkExprChain(node);
		this._text = savedText;

		return result;

	}

	// =========================================================================
	// Token export for 1C compiler (bypass 1C lexer)
	// =========================================================================

	/**
	 * Mapping from Lezer node names to 1C terminal names.
	 * Used by exportTokens() to produce a token stream compatible
	 * with the 1C parser (конс_АСТ_ПарсерКлиентСервер).
	 */
	static get LEZER_TO_1C_TOKENS() {
		return {
			// Keywords
			'if':              'Ключ_Если',
			'then':            'Ключ_Тогда',
			'elseIf':          'Ключ_ИначеЕсли',
			'else':            'Ключ_Иначе',
			'endIf':           'Ключ_КонецЕсли',
			'for':             'Ключ_Для',
			'each':            'Ключ_Каждого',
			'in':              'Ключ_Из',
			'to':              'Ключ_По',
			'while':           'Ключ_Пока',
			'do':              'Ключ_Цикл',
			'endDo':           'Ключ_КонецЦикла',
			'procedure':       'Ключ_Процедура',
			'endProcedure':    'Ключ_КонецПроцедуры',
			'function':        'Ключ_Функция',
			'endFunction':     'Ключ_КонецФункции',
			'var':             'Ключ_Перем',
			'goto':            'Ключ_Перейти',
			'return':          'Ключ_Возврат',
			'continue':        'Ключ_Продолжить',
			'break':           'Ключ_Прервать',
			'or':              'Ключ_Или',
			'and':             'Ключ_И',
			'not':             'Ключ_Не',
			'try':             'Ключ_Попытка',
			'except':          'Ключ_Исключение',
			'raise':           'Ключ_ВызватьИсключение',
			'endTry':          'Ключ_КонецПопытки',
			'new':             'Ключ_Новый',
			'export':          'Ключ_Экспорт',
			'val':             'Ключ_Знач',
			'addHandler':      'Ключ_ДобавитьОбработчик',
			'removeHandler':   'Ключ_УдалитьОбработчик',
			'execute':         'Ключ_Выполнить',
			// Literals
			'true':            'Лит_Истина',
			'false':           'Лит_Ложь',
			'null':            'Лит_Null',
			'undefined':       'Лит_Неопределено',
			'Number':          'Лит_Число',
			'String':          'Лит_Строка',
			'MultilineStringStart':    'Лит_Строка',
			'MultilineStringContinue': 'Лит_Строка',
			'Date':            'Лит_Дата',
			'VariableName':    'Лит_Идентификатор',
			// Annotations — the entire node text becomes a single removable token
			'Annotation':      'Спец_Директива',
		};
	}

	/**
	 * Mapping for punctuation characters to 1C terminal names.
	 */
	static get PUNCT_TO_1C() {
		return {
			'=':   'Оп_Равно',
			'<>':  'Оп_НеРавно',
			'<':   'Оп_Меньше',
			'<=':  'Оп_МеньшеРавно',
			'>':   'Оп_Больше',
			'>=':  'Оп_БольшеРавно',
			'+':   'Оп_Плюс',
			'-':   'Оп_Минус',
			'*':   'Оп_Умножить',
			'/':   'Оп_Делить',
			'%':   'Оп_Остаток',
			'(':   'Разд_СкобкаЛевая',
			')':   'Разд_СкобкаПравая',
			'[':   'Разд_КвадратнаяЛевая',
			']':   'Разд_КвадратнаяПравая',
			'.':   'Разд_Точка',
			',':   'Разд_Запятая',
			';':   'Разд_ТочкаСЗапятой',
			':':   'Разд_Двоеточие',
			'~':   'Разд_Тильда',
			'?':  'Разд_Тернарный',
		};
	}

	/**
	 * Export the current lezer parse tree as a flat token stream
	 * compatible with the 1C lexer output format.
	 *
	 * Each token: {Терминал, Значение, НомерСтроки, Позиция}
	 *
	 * This allows the 1C compiler to skip its own lexer and go
	 * directly to parsing, saving ~30% of compilation time.
	 *
	 * @returns {Array<object>|null} array of token objects, or null if no tree
	 */
	exportTokens() {

		if (!this._tree || !this._text)
			return null;

		this._log('exportTokens: exporting', this._text.length, 'chars');

		let tokens = [];
		let text = this._text;
		let nodeToToken = BslAstService.LEZER_TO_1C_TOKENS;
		let punctToToken = BslAstService.PUNCT_TO_1C;

		// Pre-compute line start offsets for fast O(log n) line/column lookup
		let lineStarts = [0];
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '\n') lineStarts.push(i + 1);
		}

		function getLineCol(offset) {
			let lo = 0, hi = lineStarts.length - 1;
			while (lo < hi) {
				let mid = (lo + hi + 1) >> 1;
				if (lineStarts[mid] <= offset) lo = mid;
				else hi = mid - 1;
			}
			return [lo + 1, offset - lineStarts[lo] + 1]; // [line, col] 1-based
		}

		// Step 1: Collect leaf nodes from the tree.
		// The lezer-bsl grammar produces NO anonymous nodes — all 140 node types
		// are named. Punctuation (;, (, ), etc.) is consumed during parsing but
		// creates NO tree nodes. So we collect tree leaves for semantic tokens
		// and fill gaps between them with punctuation from the source text.
		let leaves = [];
		let stack = [];
		this._tree.iterate({
			enter(node) {
				// Atomic token nodes: map entire node as one 1C terminal,
				// don't descend into children (e.g. Annotation, VariableName)
				if (nodeToToken[node.name]) {
					leaves.push({ name: node.name, from: node.from, to: node.to });
					if (stack.length > 0) stack[stack.length - 1].hasChild = true;
					return false;
				}
				stack.push({ name: node.name, from: node.from, to: node.to, hasChild: false });
			},
			leave(node) {
				let n = stack.pop();
				// Non-atomic leaf (e.g. CompareOp, ArithOp, Name)
				if (!n.hasChild && n.from < n.to) leaves.push(n);
				if (stack.length > 0) stack[stack.length - 1].hasChild = true;
			}
		});

		// Step 2: Gap scanner — emit punctuation tokens from raw source text
		// for characters between tree leaves.
		function scanGap(from, to) {
			let pos = from;
			while (pos < to) {
				let ch = text[pos];
				// Skip whitespace
				if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { pos++; continue; }
				// Try 2-char operators first (<=, >=, <>, ?( )
				if (pos + 1 < to) {
					let ch2 = ch + text[pos + 1];
					let t2 = punctToToken[ch2];
					if (t2) {
						let [l, p] = getLineCol(pos);
						tokens.push({ t: t2, v: ch2, l: l, p: p });
						pos += 2;
						continue;
					}
				}
				// Try 1-char operators
				let t1 = punctToToken[ch];
				if (t1) {
					let [l, p] = getLineCol(pos);
					tokens.push({ t: t1, v: ch, l: l, p: p });
					pos++;
					continue;
				}
				// Unknown character — skip
				pos++;
			}
		}

		// Step 3: Interleave tree tokens with gap-scanned punctuation
		let prevEnd = 0;
		for (let leaf of leaves) {
			// Fill gap before this leaf with punctuation
			scanGap(prevEnd, leaf.from);

			// Skip comments and preprocessor — they are removable by the 1C parser
			if (leaf.name === 'Comment' || leaf.name === 'Preproc') {
				prevEnd = leaf.to;
				continue;
			}

			let value = text.substring(leaf.from, leaf.to);
			let terminal = nodeToToken[leaf.name];
			if (!terminal) terminal = punctToToken[value];
			if (!terminal && /^[a-zA-Zа-яА-ЯёЁ_]/.test(value)) {
				terminal = 'Лит_Идентификатор';
			}
			if (terminal) {
				let [line, col] = getLineCol(leaf.from);
				tokens.push({
					t: terminal,  // Терминал (Имя)
					v: value,     // Значение
					l: line,      // НомерСтроки
					p: col        // Позиция
				});
			} else {
				// Non-mappable leaf (e.g. empty ParamList "()", error nodes) —
				// scan its content for punctuation tokens
				scanGap(leaf.from, leaf.to);
			}
			prevEnd = leaf.to;
		}

		// Fill final gap (any trailing punctuation after the last leaf)
		scanGap(prevEnd, text.length);

		// Append EOF token
		tokens.push({
			t: 'Спец_КонецФайла',
			v: '',
			l: lineStarts.length,
			p: 1
		});

		this._log('exportTokens: produced', tokens.length, 'tokens');
		return tokens;

	}

}

// Global singleton
var bslAstService = new BslAstService();
