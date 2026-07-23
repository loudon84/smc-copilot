# Hermes Runtime install (Windows)
param(
    [string]$RepoRoot = $PSScriptRoot + "\..",
    [string]$PythonPath = "",
    [string]$NodePath = "",
    [string]$GitPath = "",
    [string]$VenvDir = "",
    [string]$HermesInstallDir = "",
    [string]$RuntimeDataDir = "",
    [switch]$UserDaemon
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

Write-Host "== runtime-install-windows =="
& "$PSScriptRoot\runtime-precheck-windows.ps1" `
    -PythonPath $PythonPath -NodePath $NodePath -GitPath $GitPath `
    -VenvDir $VenvDir -HermesInstallDir $HermesInstallDir

& "$PSScriptRoot\bootstrap-windows.ps1" -RepoRoot $RepoRoot

$envFile = Join-Path $RepoRoot ".env"
if (Test-Path $envFile) {
    if ($PythonPath) { Add-Content $envFile "`nTOOLCHAIN_PYTHON_PATH=$PythonPath" }
    if ($NodePath) { Add-Content $envFile "`nTOOLCHAIN_NODE_PATH=$NodePath" }
    if ($GitPath) { Add-Content $envFile "`nTOOLCHAIN_GIT_PATH=$GitPath" }
    if ($VenvDir) { Add-Content $envFile "`nTOOLCHAIN_VENV_DIR=$VenvDir" }
    if ($HermesInstallDir) { Add-Content $envFile "`nHERMES_INSTALL_DIR=$HermesInstallDir" }
    if ($RuntimeDataDir) { Add-Content $envFile "`nRUNTIME_DATA_DIR=$RuntimeDataDir" }
}

if ($UserDaemon) {
    Write-Host "Installing user daemon (Task Scheduler ONLOGON)..."
    & uv run python -m local_service.windows_user_daemon install
}

Write-Host "Runtime install scaffolding complete."
Write-Host "Start: uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765"
