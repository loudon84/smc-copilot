#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

Write-Host "Installing HermesLocalService..."
uv run ai-copilot-service install
Write-Host "Done."
