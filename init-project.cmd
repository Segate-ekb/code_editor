@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

set "CHECK_MARK=✔️"
set "CROSS_MARK=❌"
set "INFO=ℹ️"
set "WARNING=⚠️"

REM Вопрос пользователю о настройке Git
:ask_git
set "response_git="
set /p response_git="%INFO% Хотите выполнить настройку Git? (y/n): "

if /i "%response_git%"=="y" (
    echo %INFO% Запуск настройки Git...
    call tools\git-global-init.cmd
    if !ERRORLEVEL! neq 0 (
        echo %CROSS_MARK% Ошибка настройки Git.
        exit /b 1
    )
    echo %CHECK_MARK% Настройка Git выполнена успешно.
) else if /i "%response_git%"=="n" (
    echo %INFO% Настройка Git пропущена.
) else (
    echo %WARNING% Некорректный ввод. Пожалуйста, введите y или n.
    goto ask_git
)

REM Далее выполняется основная настройка окружения

REM Проверяем наличие oscript
where oscript >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo %CROSS_MARK% oscript не найден.
    set oscript_installed=0
) else (
    echo %CHECK_MARK% oscript найден.
    set oscript_installed=1
)

REM Проверяем наличие opm
where opm >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo %CROSS_MARK% opm не найден.
    set opm_installed=0
) else (
    echo %CHECK_MARK% opm найден.
    set opm_installed=1
)

set oscript_path=%localappdata%\ovm\current\bin

REM Если oscript не установлен, загружаем и устанавливаем ovm
if !oscript_installed! neq 1 (
    
    echo %INFO% Загружаем ovm...
    powershell -Command "Invoke-WebRequest -Uri https://github.com/oscript-library/ovm/releases/latest/download/ovm.exe -OutFile ovm.exe"

    if exist ovm.exe (
        echo %INFO% Устанавливаем oscript и opm через ovm...
        ovm.exe install stable
        if !ERRORLEVEL! neq 0 (
            echo %CROSS_MARK% Ошибка установки oscript и opm через ovm.
            exit /b 1
        )
        ovm.exe use stable

        set "PATH=!PATH!;%oscript_path%"

        REM Повторная проверка oscript после установки
        if not exist "%oscript_path%\oscript.exe" (
            echo %CROSS_MARK% oscript все еще не найден.
            exit /b 1
        ) else (
            echo %CHECK_MARK% oscript установлен успешно.
        )

        REM Повторная проверка opm после установки
        if not exist "%oscript_path%\opm.bat" (
            echo %CROSS_MARK% opm все еще не найден.
            exit /b 1
        ) else (
            echo %CHECK_MARK% opm установлен успешно.
        )
    ) else (
        echo %CROSS_MARK% Не удалось загрузить ovm.
        exit /b 1
    )
)

REM Устанавливаем пакеты
echo %INFO% Устанавливаем пакеты зависимостей.
call "%oscript_path%\opm.bat" install --dev > install_log.txt 2>&1
if !ERRORLEVEL! neq 0 (
    echo %CROSS_MARK% Ошибка установки пакетов.
    type install_log.txt
    exit /b 1
)
del install_log.txt
echo %CHECK_MARK% Пакеты установлены успешно.


REM Установка precommit hook
echo %INFO% Устанавливаем precommit hook...
call precommit4onec install . > precommit_log.txt 2>&1
if !ERRORLEVEL! neq 0 (
    echo %CROSS_MARK% Ошибка установки precommit hook.
    type precommit_log.txt
    exit /b 1
)
del precommit_log.txt
echo %CHECK_MARK% precommit hook установлен успешно.


REM Цикл для запроса у пользователя о настройке файла окружения
:ask_user
set "response_env="
set /p response_env="%INFO% Хотите настроить файл окружения? (y/n): "

if /i "!response_env!"=="y" (
    echo %INFO% Настраиваем файл окружения...

    REM Копирование и переименование env.json.example в env.json
    if exist "env.json.example" (
        copy "env.json.example" "env.json"
        if !ERRORLEVEL! neq 0 (
            echo %CROSS_MARK% Ошибка копирования файла env.json.example.
            exit /b 1
        )
        echo %CHECK_MARK% Файл env.json создан.
    ) else (
        echo %CROSS_MARK% Файл env.json.example не найден.
        exit /b 1
    )

    REM Запуск oscript tools/init-project.os
    if exist "tools\init-project.os" (
        "%oscript_path%\oscript.exe" "tools\init-project.os"
        if !ERRORLEVEL! neq 0 (
            echo %CROSS_MARK% Ошибка при выполнении tools\init-project.os.
            exit /b 1
        )
        echo %CHECK_MARK% Проект инициализирован успешно.
    ) else (
        echo %CROSS_MARK% Скрипт tools\init-project.os не найден.
        exit /b 1
    )

) else if /i "!response_env!"=="n" (
    echo %INFO% Настройка файла окружения пропущена.
) else (
    echo %WARNING% Некорректный ввод. Пожалуйста, введите y или n.
    goto ask_user
)

REM Вопрос о первоначальной загрузке базы
:ask_prepare
set "response_prepare="
set /p response_prepare="%INFO% Хотите выполнить первоначальную загрузку базы? (y/n): "
if /i "!response_prepare!"=="y" (
    echo %INFO% Выполняем первоначальную загрузку базы...
    call prepare.cmd
    if !ERRORLEVEL! neq 0 (
        echo %CROSS_MARK% Ошибка выполнения prepare.cmd.
        exit /b 1
    )
    echo %CHECK_MARK% Первоначальная загрузка базы выполнена успешно.
) else if /i "!response_prepare!"=="n" (
    echo %INFO% Первоначальная загрузка базы пропущена.
) else (
    echo %WARNING% Некорректный ввод. Пожалуйста, введите y или n.
    goto ask_prepare
)

echo %CHECK_MARK% Настройка тестового окружения завершена успешно.
exit /b 0
