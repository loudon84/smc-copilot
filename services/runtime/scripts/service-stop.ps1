$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

Write-Host "Stopping HermesLocalService..."
uv run ai-copilot-service stop
Write-Host "Done."
