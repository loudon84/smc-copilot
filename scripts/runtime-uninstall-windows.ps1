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
        Write-Host "Removing Runtime data: $runtime"
        Remove-Item -Recurse -Force $runtime
    }
} else {
    Write-Host "Keeping Runtime data under %LOCALAPPDATA%\HermesRuntime"
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
