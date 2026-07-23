# Hermes Runtime uninstall (Windows) — preserves ~/.hermes by default
param(
    [string]$RepoRoot = $PSScriptRoot + "\..",
    [switch]$RemoveRuntimeData,
    [switch]$RemoveHermesUserData
)

$ErrorActionPreference = "Stop"
Write-Host "== runtime-uninstall-windows =="

try {
    & uv run python -m local_service.windows_user_daemon uninstall
} catch {
    Write-Host "User daemon uninstall skipped: $_"
}

if ($RemoveRuntimeData) {
    $runtime = Join-Path $env:LOCALAPPDATA "HermesRuntime"
    if (Test-Path $runtime) {
        Write-Host "Removing Runtime 服务态数据: $runtime"
        Remove-Item -Recurse -Force $runtime
    }
    $hermesAgent = "D:\Programs\HermesAgent"
    if (Test-Path $hermesAgent) {
        Write-Host "Removing Hermes 程序安装目录: $hermesAgent"
        Remove-Item -Recurse -Force $hermesAgent
    }
} else {
    Write-Host "保留 Runtime 服务态: %LOCALAPPDATA%\HermesRuntime"
    Write-Host "保留 Hermes 程序目录: D:\Programs\HermesAgent（如需删除请加 -RemoveRuntimeData）"
}

if ($RemoveHermesUserData) {
    $hermes = Join-Path $env:USERPROFILE ".hermes"
    if (Test-Path $hermes) {
        Write-Host "Removing Hermes user data: $hermes"
        Remove-Item -Recurse -Force $hermes
    }
} else {
    Write-Host "Keeping Hermes user data (~/.hermes) by default"
}

Write-Host "Uninstall complete"
