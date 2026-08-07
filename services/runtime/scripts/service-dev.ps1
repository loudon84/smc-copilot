$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

Write-Host "Running HermesLocalService in dev mode (foreground)..."
uv run ai-copilot-service run
