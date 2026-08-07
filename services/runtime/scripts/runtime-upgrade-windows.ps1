# Hermes Runtime upgrade (Windows) — service package only; Hermes Agent via API
param(
    [string]$RepoRoot = $PSScriptRoot + "\.."
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

Write-Host "== runtime-upgrade-windows =="
& uv sync --extra service
& uv run alembic upgrade head
Write-Host "Service package upgraded. Trigger Hermes Agent update via POST /api/v1/runtime/update"
