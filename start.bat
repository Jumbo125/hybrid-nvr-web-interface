@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "SCRIPT_DIR=%CD%"
set "LANG_DIR=%SCRIPT_DIR%\lang"
set "LANG_CODE=%INSTALL_LANG%"
set "PYTHON=%SCRIPT_DIR%\venv\Scripts\python.exe"
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

if not exist "%PYTHON%" (
    call :t_echo run_install_first
    set "EXIT_CODE=1"
    goto finish_failure
)

call :t_echo starting_server
call :t_echo start_successful
"%PYTHON%" -m uvicorn app.main:app --host 0.0.0.0 --port 9500 --workers 1
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto finish_failure

echo.
call :t_echo server_stopped_cleanly
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


:finish_success
echo.
call :t_echo press_any_key_to_close
pause >nul
exit /b 0


:finish_failure
echo.
call :t_echo start_failed
call :t_echo press_any_key_to_close
pause >nul
exit /b %EXIT_CODE%
