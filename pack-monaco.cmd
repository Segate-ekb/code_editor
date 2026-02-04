@echo off
chcp 65001 >nul

rem Скрипт упаковки содержимого src/monaco в Template.bin (ZIP-архив)
rem Используется при сборке проекта

set "MONACO_DIR=%~dp0src\monaco"
set "TEMPLATE_BIN=%~dp0src\cf\CommonTemplates\конс_КонсольКода\Ext\Template.bin"
set "TEMP_ZIP=%~dp0build\monaco.zip"

echo Упаковка monaco в Template.bin...

rem Проверяем наличие папки monaco
if not exist "%MONACO_DIR%" (
    echo ОШИБКА: Папка %MONACO_DIR% не найдена
    exit /b 1
)

rem Создаем папку build если её нет
if not exist "%~dp0build" mkdir "%~dp0build"

rem Удаляем старый архив если есть
if exist "%TEMP_ZIP%" del /f "%TEMP_ZIP%"

rem Создаем ZIP-архив с помощью PowerShell
powershell -NoProfile -Command "Compress-Archive -Path '%MONACO_DIR%\*' -DestinationPath '%TEMP_ZIP%' -Force"

if %ERRORLEVEL% neq 0 (
    echo ОШИБКА: Не удалось создать архив
    exit /b 1
)

rem Создаем папку для Template.bin если её нет
if not exist "%~dp0src\cf\CommonTemplates\конс_КонсольКода\Ext" (
    mkdir "%~dp0src\cf\CommonTemplates\конс_КонсольКода\Ext"
)

rem Копируем архив как Template.bin
copy /y "%TEMP_ZIP%" "%TEMPLATE_BIN%" >nul

if %ERRORLEVEL% neq 0 (
    echo ОШИБКА: Не удалось скопировать архив в Template.bin
    exit /b 1
)

rem Удаляем временный файл
del /f "%TEMP_ZIP%"

echo Готово: %TEMPLATE_BIN%
