# Hermes Runtime smoke test (Windows)
param(
    [string]$BaseUrl = "http://127.0.0.1:8765"
)

$ErrorActionPreference = "Stop"
Write-Host "== runtime-smoke-test-windows =="
Write-Host "BaseUrl: $BaseUrl"

function Assert-Ok([string]$Path) {
    $url = "$BaseUrl$Path"
    Write-Host "GET $url"
    $resp = Invoke-RestMethod -Uri $url -Method GET
    return $resp
}

Assert-Ok "/api/v1/health" | Out-Null
$caps = Assert-Ok "/api/v1/runtime/capabilities"
Write-Host "features: $($caps.features -join ', ')"
$status = Assert-Ok "/api/v1/runtime/status"
Write-Host "runtime status=$($status.status) hermesInstalled=$($status.hermesInstalled)"
$instances = Assert-Ok "/api/v1/instances"
Write-Host "instances: $($instances.Count)"

Write-Host "Smoke test passed"
