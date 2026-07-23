# Hermes Runtime install (Windows)
# 源码须 clone 到 D:\Programs\...；Hermes 版本默认 D:\Programs\HermesAgent\<version>\
# 未指定 VenvDir 时，venv 为 D:\Programs\HermesAgent\<version>\venv
# 服务态仍写入 %LOCALAPPDATA%\HermesRuntime（不改动）
param(
    [string]$RepoRoot = $PSScriptRoot + "\..",
    [string]$PythonPath = "",
    [string]$NodePath = "",
    [string]$GitPath = "",
    [string]$VenvDir = "",
    [string]$HermesInstallDir = "D:\Programs\HermesAgent",
    [string]$RuntimeDataDir = "",
    [switch]$UserDaemon,
    [switch]$SkipProgramsCheck
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

$ProgramsRoot = "D:\Programs"
if (-not $SkipProgramsCheck) {
    $repoFull = [System.IO.Path]::GetFullPath($RepoRoot)
    $rootFull = [System.IO.Path]::GetFullPath($ProgramsRoot)
    if (-not $repoFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "RepoRoot 必须位于 $ProgramsRoot 下（当前: $repoFull）。请将 copilot-serve clone 到 D:\Programs\copilot-serve"
    }
}

Write-Host "== runtime-install-windows =="
& "$PSScriptRoot\runtime-precheck-windows.ps1" `
    -RepoRoot $RepoRoot `
    -PythonPath $PythonPath -NodePath $NodePath -GitPath $GitPath `
    -VenvDir $VenvDir -HermesInstallDir $HermesInstallDir

& "$PSScriptRoot\bootstrap-windows.ps1" -RepoRoot $RepoRoot

$envFile = Join-Path $RepoRoot ".env"
if (Test-Path $envFile) {
    function Set-EnvLine([string]$Key, [string]$Value) {
        if (-not $Value) { return }
        $content = Get-Content $envFile -Raw
        $line = "$Key=$Value"
        if ($content -match "(?m)^$Key=") {
            $content = [regex]::Replace($content, "(?m)^$Key=.*$", $line)
            Set-Content -Path $envFile -Value $content -Encoding UTF8 -NoNewline
        } else {
            Add-Content $envFile "`n$line"
        }
    }
    if ($PythonPath) { Set-EnvLine "TOOLCHAIN_PYTHON_PATH" $PythonPath }
    if ($NodePath) { Set-EnvLine "TOOLCHAIN_NODE_PATH" $NodePath }
    if ($GitPath) { Set-EnvLine "TOOLCHAIN_GIT_PATH" $GitPath }
    # 空 VenvDir：安装时使用 <HERMES_INSTALL_DIR>/<version>/venv
    if ($VenvDir) { Set-EnvLine "TOOLCHAIN_VENV_DIR" $VenvDir }
    Set-EnvLine "HERMES_INSTALL_DIR" $HermesInstallDir
    # 服务态：空则代码默认 %LOCALAPPDATA%\HermesRuntime
    if ($RuntimeDataDir) { Set-EnvLine "RUNTIME_DATA_DIR" $RuntimeDataDir }
}

if ($UserDaemon) {
    Write-Host "Installing user daemon (Task Scheduler ONLOGON)..."
    & uv run python -m local_service.windows_user_daemon install
}

Write-Host "Runtime install scaffolding complete."
Write-Host "  Hermes install: $HermesInstallDir\<version>\ (under D:\Programs)"
Write-Host "  Hermes venv: $(if ($VenvDir) { $VenvDir } else { '<HERMES_INSTALL_DIR>\<version>\venv' })"
Write-Host "  Runtime service data: %LOCALAPPDATA%\HermesRuntime (unchanged)"
Write-Host "Start: uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8765"
