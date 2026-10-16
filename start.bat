@echo off
setlocal EnableExtensions
title Universal Farm - Local Server
set "PYTHONUTF8=1"
set "PYTHONUNBUFFERED=1"
cd /d "%~dp0" || goto bad_directory

REM Keep this file ASCII with CRLF line endings for Windows cmd.exe.
python -c "import sys; sys.exit(sys.version_info.major != 3)" >nul 2>nul
if errorlevel 1 goto try_py
python "%~dp0serve.py" %*
goto end

:try_py
py -3 -c "import sys; sys.exit(sys.version_info.major != 3)" >nul 2>nul
if errorlevel 1 goto no_python
py -3 "%~dp0serve.py" %*
goto end

:no_python
echo Python 3 was not found.
echo Install Python 3 and enable "Add python.exe to PATH", then run start.bat again.
goto end

:bad_directory
echo Could not open the game directory: "%~dp0"

:end
pause
endlocal
