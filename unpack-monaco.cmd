@echo off
chcp 65001 >nul

rem Скрипт распаковки Template.bin (ZIP-архив) в src/monaco
rem Используется после декомпиляции

set "MONACO_DIR=%~dp0src\monaco"
set "TEMPLATE_BIN=%~dp0src\cf\CommonTemplates\конс_КонсольКода\Ext\Template.bin"

echo Распаковка Template.bin в monaco...

rem Проверяем наличие Template.bin
if not exist "%TEMPLATE_BIN%" (
    echo ОШИБКА: Файл %TEMPLATE_BIN% не найден
    exit /b 1
)

rem Удаляем старую папку monaco если есть
if exist "%MONACO_DIR%" (
    rmdir /s /q "%MONACO_DIR%"
)

rem Создаем папку monaco
mkdir "%MONACO_DIR%"

rem Распаковываем ZIP-архив с помощью PowerShell
powershell -NoProfile -Command "Expand-Archive -Path '%TEMPLATE_BIN%' -DestinationPath '%MONACO_DIR%' -Force"

if %ERRORLEVEL% neq 0 (
    echo ОШИБКА: Не удалось распаковать архив
    exit /b 1
)

echo Готово: %MONACO_DIR%
