@echo off
REM Process-scoped Bypass — does not change machine ExecutionPolicy (v1.3.1 FR-12)
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%runtime-install-windows.ps1" %*
exit /b %ERRORLEVEL%
