$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot/..

uv run ai-copilot-service status

$BaseUrl = "http://127.0.0.1:8765"
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/service/status" | ConvertTo-Json -Depth 5
} catch {
    Write-Warning "Local API not reachable at $BaseUrl : $_"
}
