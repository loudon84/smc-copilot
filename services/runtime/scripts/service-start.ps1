$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

Write-Host "Starting HermesLocalService..."
uv run ai-copilot-service start
Write-Host "Done."
