@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "SCRIPT_DIR=%CD%"
set "LANG_DIR=%SCRIPT_DIR%\lang"
set "LANG_CODE=%INSTALL_LANG%"
set "VENV_DIR=%SCRIPT_DIR%\venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "PY_CMD="
set "EXIT_CODE=0"

:parse_args
if "%~1"=="" goto after_args
if /I "%~1"=="--lang" (
    if "%~2"=="" (
        echo Error: --lang requires a value ^(de^|en^) / Fehler: --lang braucht einen Wert ^(de^|en^)
        set "EXIT_CODE=1"
        goto finish_failure
    )
    set "LANG_CODE=%~2"
    shift
    shift
    goto parse_args
)
echo Unknown parameter / Unbekannter Parameter: %~1
set "EXIT_CODE=1"
goto finish_failure

:after_args
if not defined LANG_CODE (
    call :choose_language || (
        set "EXIT_CODE=1"
        goto finish_failure
    )
)

call :load_language "%LANG_CODE%" || (
    set "EXIT_CODE=1"
    goto finish_failure
)

call :find_python

call :t_echo check_python
if not defined PY_CMD (
    call :install_python || (
        set "EXIT_CODE=1"
        goto finish_failure
    )
    call :find_python
)

if not defined PY_CMD (
    call :t_echo python_install_failed
    set "EXIT_CODE=1"
    goto finish_failure
)

if not exist "requirements.txt" (
    call :t_echo requirements_missing
    set "EXIT_CODE=1"
    goto finish_failure
)

call :create_or_repair_venv || (
    set "EXIT_CODE=1"
    goto finish_failure
)
call :ensure_pip_in_venv || (
    set "EXIT_CODE=1"
    goto finish_failure
)
call :install_requirements || (
    set "EXIT_CODE=1"
    goto finish_failure
)

echo.
call :t_echo installation_finished
call :t_echo installation_successful
call :t_echo start_project_with
call :t_echo start_script_name
goto finish_success


:choose_language
if not exist "%LANG_DIR%\*.bat" (
    echo No language files found in "%LANG_DIR%" / Keine Sprachdateien in "%LANG_DIR%" gefunden.
    exit /b 1
)

set "LANG_COUNT=0"
echo Please choose language / Bitte Sprache waehlen:
echo.

for %%F in ("%LANG_DIR%\*.bat") do (
    set /a LANG_COUNT+=1
    set "LANG_NAME="
    call "%%~fF" __meta__ >nul 2>&1
    if not defined LANG_NAME set "LANG_NAME=%%~nF"
    set "LANG_CODE_!LANG_COUNT!=%%~nF"
    echo   [!LANG_COUNT!] !LANG_NAME! (%%~nF)
)

echo.
set "CHOICE="
set /p CHOICE=Selection / Auswahl: 

if not defined CHOICE (
    echo Invalid selection / Ungueltige Auswahl
    exit /b 1
)

set "NONNUM="
for /f "delims=0123456789" %%A in ("%CHOICE%") do set "NONNUM=%%A"

if not defined NONNUM (
    if %CHOICE% GEQ 1 if %CHOICE% LEQ %LANG_COUNT% (
        call set "LANG_CODE=%%LANG_CODE_%CHOICE%%%"
        exit /b 0
    )
)

set "LANG_CODE="
for /L %%N in (1,1,%LANG_COUNT%) do (
    if /I "%CHOICE%"=="!LANG_CODE_%%N!" set "LANG_CODE=!LANG_CODE_%%N!"
)

if defined LANG_CODE exit /b 0

echo Invalid selection / Ungueltige Auswahl
exit /b 1


:load_language
if not exist "%LANG_DIR%\%~1.bat" (
    set "AVAILABLE_LANGS="
    for %%F in ("%LANG_DIR%\*.bat") do (
        if defined AVAILABLE_LANGS (
            set "AVAILABLE_LANGS=!AVAILABLE_LANGS!, %%~nF"
        ) else (
            set "AVAILABLE_LANGS=%%~nF"
        )
    )
    echo Unknown language: %~1 / Unbekannte Sprache: %~1
    if defined AVAILABLE_LANGS echo Available / Verfuegbar: !AVAILABLE_LANGS!
    exit /b 1
)

call "%LANG_DIR%\%~1.bat" __load__ || exit /b 1
exit /b 0


:t_get_line
setlocal EnableDelayedExpansion
set "text=!MSG_%~2!"
if not defined text set "text=%~2"
if not "%~3"=="" set "text=!text:{1}=%~3!"
if not "%~4"=="" set "text=!text:{2}=%~4!"
if not "%~5"=="" set "text=!text:{3}=%~5!"
for /f "delims=" %%A in ("!text!") do endlocal & set "%~1=%%~A"
exit /b 0


:t_echo
call :t_get_line __line "%~1" "%~2" "%~3" "%~4"
echo !__line!
exit /b 0


:print_status_key
call :t_get_line __status_line "%~1" "%~3" "%~4" "%~5"
if "%~2"=="0" (
    echo [!MSG_ok!]     !__status_line!
) else (
    echo [!MSG_error!] !__status_line!
)
exit /b %~2


:find_python
set "PY_CMD="
py -3 -V >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=py -3"
    goto :eof
)

python -V >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python"
    goto :eof
)

python3 -V >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python3"
    goto :eof
)
goto :eof


:install_python
call :t_echo python_not_found_installing

where winget >nul 2>&1
if errorlevel 1 (
    call :t_echo winget_missing
    call :t_echo python_manual_install
    echo https://www.python.org/downloads/windows/
    exit /b 1
)

winget install --exact --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    call :t_echo python_install_fallback
    winget install --exact --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        call :t_echo python_install_failed
        exit /b 1
    )
)

if exist "%LocalAppData%\Programs\Python\Launcher" set "PATH=%PATH%;%LocalAppData%\Programs\Python\Launcher"
if exist "%LocalAppData%\Programs\Python\Python312" set "PATH=%PATH%;%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts"
if exist "%LocalAppData%\Programs\Python\Python311" set "PATH=%PATH%;%LocalAppData%\Programs\Python\Python311;%LocalAppData%\Programs\Python\Python311\Scripts"
if exist "%ProgramFiles%\Python312" set "PATH=%PATH%;%ProgramFiles%\Python312;%ProgramFiles%\Python312\Scripts"
if exist "%ProgramFiles%\Python311" set "PATH=%PATH%;%ProgramFiles%\Python311;%ProgramFiles%\Python311\Scripts"

call :print_status_key install_python_status 0
exit /b 0


:create_or_repair_venv
if exist "%VENV_PY%" (
    "%VENV_PY%" -m pip --version >nul 2>&1
    if not errorlevel 1 (
        call :t_echo venv_exists_ok
        exit /b 0
    )
)

if exist "%VENV_DIR%" (
    call :t_echo venv_incomplete_remove
    rmdir /s /q "%VENV_DIR%"
)

call :t_echo venv_create
%PY_CMD% -m venv "%VENV_DIR%"
if errorlevel 1 (
    call :print_status_key venv_create_status 1
    call :t_echo venv_create_failed
    exit /b 1
)

call :print_status_key venv_create_status 0
exit /b 0


:ensure_pip_in_venv
"%VENV_PY%" -m pip --version >nul 2>&1
if not errorlevel 1 (
    call :print_status_key pip_in_venv_present 0
    exit /b 0
)

call :t_echo pip_missing_in_venv
"%VENV_PY%" -m ensurepip --upgrade >nul 2>&1
if errorlevel 1 (
    call :print_status_key ensurepip_result 1
) else (
    call :print_status_key ensurepip_result 0
)

"%VENV_PY%" -m pip --version >nul 2>&1
if not errorlevel 1 (
    call :print_status_key pip_in_venv_provided 0
    exit /b 0
)

call :t_echo pip_setup_failed
exit /b 1


:install_requirements
call :t_echo upgrade_pip
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 (
    call :print_status_key pip_upgrade 1
    exit /b 1
)
call :print_status_key pip_upgrade 0

call :t_echo install_requirements
"%VENV_PY%" -m pip install -r requirements.txt
if errorlevel 1 (
    call :print_status_key requirements_file_name 1
    exit /b 1
)
call :print_status_key requirements_file_name 0
exit /b 0


:finish_success
echo.
call :t_echo press_any_key_to_close
pause >nul
exit /b 0


:finish_failure
echo.
call :t_echo installation_failed
call :t_echo press_any_key_to_close
pause >nul
exit /b %EXIT_CODE%
