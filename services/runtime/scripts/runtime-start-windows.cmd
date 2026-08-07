@echo off
REM Start Runtime Service with process-scoped Bypass
setlocal
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
cd /d "%REPO_ROOT%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Set-Location '%REPO_ROOT%'; uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765"
exit /b %ERRORLEVEL%
