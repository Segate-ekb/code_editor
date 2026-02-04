/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * monaco-languages version: 2.1.1
 * Released under the MIT license
 * https://github.com/Microsoft/monaco-languages/blob/master/LICENSE.md
 *-----------------------------------------------------------------------------*/
define("vs/basic-languages/json/json",["require","exports"],(function(e,n){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.language=n.conf=void 0,n.conf={brackets:[["{","}"],["[","]"]],autoClosingPairs:[{open:"{",close:"}"},{open:"[",close:"]"},{open:'"',close:'"'}],surroundingPairs:[{open:"{",close:"}"},{open:"[",close:"]"},{open:'"',close:'"'}]},n.language={defaultToken:"",tokenPostfix:".json",escapes:/\\(?:[btnfr\\"\/]|u[0-9A-Fa-f]{4})/,tokenizer:{root:[[/[{}]/,"delimiter.bracket"],[/[\[\]]/,"delimiter.array"],[/(".*?"|'.*?')\s*(?=:)/,"type"],[/"([^"\\]|\\.)*$/,"string.invalid"],[/"/,"string","@string"],[/[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?/,"number"],[/true|false/,"keyword"],[/null/,"keyword"],[/[,]/,"delimiter.comma"],[/[:]/,"delimiter.colon"]],string:[[/[^\\"]+/,"string"],[/@escapes/,"string.escape"],[/\\./,"string.escape.invalid"],[/"/,"string","@pop"]]}}}));
