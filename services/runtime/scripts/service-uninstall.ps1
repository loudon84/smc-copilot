#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

Write-Host "Stopping HermesLocalService..."
try { uv run ai-copilot-service stop } catch { Write-Warning $_ }

Write-Host "Removing HermesLocalService..."
uv run ai-copilot-service remove
Write-Host "Done."
