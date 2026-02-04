@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

set "CHECK_MARK=✔️"
set "CROSS_MARK=❌"
set "INFO=ℹ️"

REM Запрос имени пользователя и email
set "user_name="
set "user_email="

echo %INFO% Введите имя пользователя для Git:
set /p user_name="> "

echo %INFO% Введите email для Git:
set /p user_email="> "

REM Запрос установки для текущего проекта или глобально
:ask_scope
set "response="
set /p response="%INFO% Хотите установить настройки Git для текущего проекта или глобально? (p/g): "

if /i "%response%"=="p" (
    echo %INFO% Установка настроек Git для текущего проекта...

    git config user.name "%user_name%"
    if %ERRORLEVEL% neq 0 (
        echo %CROSS_MARK% Ошибка установки имени пользователя для текущего проекта.
        exit /b 1
    )
    git config user.email "%user_email%"
    if %ERRORLEVEL% neq 0 (
        echo %CROSS_MARK% Ошибка установки email для текущего проекта.
        exit /b 1
    )
    
    git config core.quotePath false
    git config alias.co checkout
    git config alias.br branch
    git config alias.ci commit
    git config alias.st status
    git config alias.unstage "reset HEAD --"
    git config alias.last "log -1 HEAD"
    git config core.autocrlf true
    git config core.safecrlf false
    git config http.postBuffer 1048576000
    
    echo %CHECK_MARK% Настройки Git для текущего проекта успешно применены.

) else if /i "%response%"=="g" (
    echo %INFO% Установка глобальных настроек Git...

    git config --global user.name "%user_name%"
    if %ERRORLEVEL% neq 0 (
        echo %CROSS_MARK% Ошибка установки имени пользователя глобально.
        exit /b 1
    )
    git config --global user.email "%user_email%"
    if %ERRORLEVEL% neq 0 (
        echo %CROSS_MARK% Ошибка установки email глобально.
        exit /b 1
    )

    git config --global core.quotePath false
    git config --global alias.co checkout
    git config --global alias.br branch
    git config --global alias.ci commit
    git config --global alias.st status
    git config --global alias.unstage "reset HEAD --"
    git config --global alias.last "log -1 HEAD"
    git config --global core.autocrlf true
    git config --global core.safecrlf false
    git config --global http.postBuffer 1048576000

    echo %CHECK_MARK% Глобальные настройки Git успешно применены.

) else (
    echo %CROSS_MARK% Некорректный ввод. Пожалуйста, введите p или g.
    goto ask_scope
)

@echo
@echo %INFO% Настройки Git завершены.
exit /b 0
