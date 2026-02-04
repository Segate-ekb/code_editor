@chcp 65001
@setlocal enableextensions

@rem упаковка monaco в Template.bin перед обновлением
call pack-monaco.cmd || exit /b %errorlevel%

@rem обновление конфигурации основной разработческой ИБ без поддержки или на поддержке. по умолчанию в каталоге build/ib
call vrunner update-dev --src src/cf --disable-support %* || exit /b %errorlevel%

@rem обновление конфигурации основной разработческой ИБ из хранилища. для включения раскомментируйте код ниже
@rem call vrunner loadrepo %* || exit /b %errorlevel%
@rem call vrunner updatedb %* || exit /b %errorlevel%

@rem собрать внешние обработчики и отчеты в каталоге build
@rem call vrunner compileepf src/epf/МояВнешняяОбработка build %* || exit /b %errorlevel%
@rem call vrunner compileepf src/erf/МойВнешнийОтчет build %* || exit /b %errorlevel%
