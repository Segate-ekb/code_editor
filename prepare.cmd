@chcp 65001
@setlocal enableextensions

@rem Сборка основной разработческой ИБ. по умолчанию в каталоге build/ib
call vrunner init-dev --src src/cf %* || exit /b %errorlevel%

@rem обновление конфигурации основной разработческой ИБ из хранилища. для включения раскомментируйте код ниже
@rem call vrunner loadrepo %* || exit /b %errorlevel%
@rem call vrunner updatedb %* || exit /b %errorlevel%

@rem собрать внешние обработчики и отчеты в каталоге build
@rem call vrunner compileepf src/epf/МояВнешняяОбработка build %* || exit /b %errorlevel%
@rem call vrunner compileepf src/erf/МойВнешнийОтчет build %* || exit /b %errorlevel%
