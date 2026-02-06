# JavaScript API

Прямой доступ к JavaScript-функциям Monaco-редактора. Вызываются через `View()` (объект `window` iframe):

```bsl
Элементы.HTML.Документ.defaultView.setText("...");
```

> **Важно:** используйте BSL-обёртки из `конс_ПодключаемаяКонсольКлиент` — напрямую JS нужен только в специфичных случаях.

## Текст

| Функция | Параметры | Описание |
|---------|-----------|----------|
| `setText(txt, range, usePadding)` | Строка, Range?, Булево? | Установить текст |
| `updateText(txt, clearUndoHistory)` | Строка, Булево? | Заменить весь текст |
| `setContent(text)` | Строка | Заменить без событий изменения |
| `getText()` | — | Получить текст |
| `eraseText()` | — | Очистить |
| `selectedText(text, keepSelection)` | Строка?, Булево? | Getter/setter выделения |
| `getSelectedText()` | — | Выделенный текст |
| `findText(string)` | Строка | Найти текст |

## Позиция и выделение

| Функция | Описание |
|---------|----------|
| `getCurrentLine()` | Номер строки курсора |
| `getCurrentColumn()` | Колонка курсора |
| `getLineCount()` | Количество строк |
| `getLineContent(lineNumber)` | Содержимое строки |
| `setSelection(startLine, startCol, endLine, endCol)` | Установить выделение |
| `setSelectionByLength(start, end)` | Выделение по смещению (1-based) |
| `revealLineInCenter(lineNumber)` | Прокрутить к строке |
| `saveViewState()` / `restoreViewState(state)` | Сохранить/восстановить позицию |

## Строки

| Функция | Описание |
|---------|----------|
| `setLineContent(lineNumber, text)` | Заменить содержимое строки |
| `insertLine(lineNumber, text)` | Вставить строку |
| `addLine(text)` | Добавить строку в конец |

## Оформление

| Функция | Описание |
|---------|----------|
| `setTheme(theme)` | `bsl-white`, `bsl-dark`, `hc-light`, `hc-dark` |
| `setFontSize(size)` | Размер шрифта |
| `setFontFamily(family)` | Семейство шрифта |
| `setFontWeight(weight)` | Жирность |
| `setLineHeight(height)` | Высота строки |
| `setLetterSpacing(spacing)` | Межбуквенный интервал |
| `setDefaultStyle()` | Courier New, 14px, lineHeight 16 |
| `scale(direction)` | Масштаб: `0`=сброс, `>0`=увеличить, `<0`=уменьшить |

## Режимы

| Функция | Описание |
|---------|----------|
| `setReadOnly(readOnly)` | Режим только чтение |
| `setLanguageMode(mode)` | `bsl`, `bsl_query`, `dcs_query`, `json`, `xml`, `yaml` |
| `switchLang(language)` | Язык подсказок: `"en"` / `"ru"` / без параметра=переключить |
| `enableQuickSuggestions(enabled)` | Быстрые подсказки |
| `minimap(enabled)` | Миникарта |
| `renderWhitespace(enabled)` | Непечатаемые символы |

## Навигация

| Функция | Описание |
|---------|----------|
| `gotoLine()` | Диалог "Перейти к строке" |
| `jumpToBracket()` | К парной скобке |
| `selectToBracket()` | Выделить до парной скобки |
| `goToFuncDefinition(funcName)` | К определению функции/процедуры |
| `fold()` / `foldAll()` | Свернуть регион / все |
| `unfold()` / `unfoldAll()` | Развернуть регион / все |

## Закладки

| Функция | Описание |
|---------|----------|
| `addBookmark(lineNumber)` | Добавить закладку |
| `removeBookmark(lineNumber)` | Удалить закладку |
| `removeAllBookmarks()` | Удалить все |
| `getBookmarks()` | Массив номеров строк |
| `goNextBookmark()` | К следующей |
| `goPreviousBookmark()` | К предыдущей |

## Ошибки и маркеры

| Функция | Описание |
|---------|----------|
| `markError(line, column)` | Мигающая подсветка ошибки |
| `setMarkers(markersJSON)` | Установить маркеры (JSON) |
| `getMarkers()` | Получить маркеры |
| `goNextMarker()` / `goPreviousMarker()` | Навигация по маркерам |

## Сравнение (diff)

| Функция | Описание |
|---------|----------|
| `compare(text, sideBySide, highlight)` | Открыть diff-редактор. Пустой текст — закрыть |
| `nextDiff()` / `previousDiff()` | Навигация по различиям |
| `getDiffCount()` | Количество различий |
| `setOriginalText(text)` | Установить оригинал для inline-diff |

## Автодополнение

| Функция | Описание |
|---------|----------|
| `updateMetadata(json, path)` | Обновить метаданные |
| `updateCustomFunctions(json)` | Обновить функции |
| `updateSnippets(json, replace)` | Обновить сниппеты |
| `parseCommonModule(name, text, isGlobal)` | Разобрать общий модуль |
| `parseMetadataModule(text, path)` | Разобрать модуль объекта/менеджера |
| `clearMetadata()` | Сбросить метаданные |
| `triggerSuggestions()` | Показать подсказки |
| `showCustomSuggestions(suggestionsJSON)` | Показать кастомные подсказки |
| `setCustomHovers(hoversJSON)` | Установить hover-подсказки |
| `setCustomSignatures(sigJSON)` | Установить сигнатуры |
| `setCustomCodeLenses(lensJSON)` | Установить CodeLens |

## Опции (runtime)

| Функция | Описание |
|---------|----------|
| `setOption(name, value)` | Установить опцию |
| `getOption(name)` | Получить опцию |

### Доступные опции

| Имя | Тип | Описание |
|-----|-----|----------|
| `generateModificationEvent` | Булево | Генерировать `EVENT_CONTENT_CHANGED` при изменении текста |
| `generateBeforeSignatureEvent` | Булево | Перехватывать показ сигнатур |
| `generateSelectSuggestEvent` | Булево | Генерировать события выбора подсказки |
| `generateSuggestActivationEvent` | Булево | Генерировать события при фокусе на строке подсказок |
| `generateSnippetEvent` | Булево | Генерировать `EVENT_ON_INSERT_SNIPPET` |
| `generateOnKeyDownEvent` | Булево | Генерировать `EVENT_ON_KEY_DOWN` |
| `onKeyDownFilter` | Строка | Фильтр клавиш (через запятую) |
| `disableDefinitionMessage` | Булево | Скрыть сообщение "Go to Definition" |
| `alwaysDisplaySuggestDetails` | Булево | Всегда показывать детали подсказок |
| `renderQueryDelimiters` | Булево | Визуальные разделители секций запроса |

## UI-элементы

| Функция | Описание |
|---------|----------|
| `showStatusBar()` / `hideStatusBar()` | Строка состояния |
| `showLineNumbers()` / `hideLineNumbers()` | Номера строк |
| `hideScrollX()` / `hideScrollY()` | Скрыть полосы прокрутки |
| `openSearchWidget()` / `closeSearchWidget()` | Виджет поиска |
| `addContextMenuItem(label, eventName)` | Добавить пункт контекстного меню |
| `disableContextMenu()` | Убрать контекстное меню |
| `showVariablesDescription(json)` | Показать панель переменных |

## События (JS → 1C)

| Событие | Когда | Параметры |
|---------|-------|-----------|
| `EVENT_CONTENT_CHANGED` | Текст изменён | — |
| `EVENT_GET_METADATA` | Запрос метаданных для автодополнения | `{metadata, trigger}` |
| `EVENT_QUERY_CONSTRUCT` | Запуск конструктора запроса | — |
| `EVENT_FORMAT_CONSTRUCT` | Запуск конструктора строки формата | — |
| `EVENT_ON_LINK_CLICK` | Клик по ссылке | `{label, href}` |
| `EVENT_ON_KEY_DOWN` | Нажатие клавиши (если включено) | `{keyCode, ctrlPressed, ...}` |
| `EVENT_ON_INSERT_SNIPPET` | Вставка сниппета (если включено) | `{text, range, position}` |
