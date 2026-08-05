# Hermes Runtime smoke test (Windows) — v1.3.1 FR-17
param(
    [string]$BaseUrl = "http://127.0.0.1:8765",
    [switch]$RequireHermes,
    [switch]$RequireGateway
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

if ($RequireHermes -and -not $status.hermesInstalled) {
    throw "RequireHermes: hermesInstalled is false"
}

$versions = Assert-Ok "/api/v1/runtime/versions"
$active = $versions | Where-Object { $_.status -eq "active" } | Select-Object -First 1
if ($RequireHermes) {
    if (-not $active) { throw "RequireHermes: no active runtime version" }
    if ($active.executablePath -match "stub") { throw "RequireHermes: active executable looks like stub" }
    Write-Host "active version=$($active.version) exe=$($active.executablePath)"
}

$instances = Assert-Ok "/api/v1/instances"
Write-Host "instances: $($instances.Count)"
$default = $instances | Where-Object { $_.name -eq "default" } | Select-Object -First 1

if ($RequireGateway) {
    if (-not $default) { throw "RequireGateway: default instance missing" }
    $health = Assert-Ok "/api/v1/instances/$($default.id)/health"
    if (-not $health.healthy -or $health.status -ne "running") {
        throw "RequireGateway: default instance not running/healthy (status=$($health.status) healthy=$($health.healthy))"
    }
    $gwPort = $health.gatewayPort
    Write-Host "Gateway health on port $gwPort ..."
    $gwHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$gwPort/health" -Method GET
    if ($gwHealth.status -ne "ok") {
        throw "Gateway /health did not return status=ok"
    }
    $modelsOk = $false
    if ($env:HERMES_API_SERVER_KEY) {
        $modelsHeaders = @{ Authorization = "Bearer $($env:HERMES_API_SERVER_KEY)" }
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:$gwPort/v1/models" -Method GET -Headers $modelsHeaders
        $modelsOk = $true
    } else {
        try {
            $null = Invoke-RestMethod -Uri "$BaseUrl/api/v1/instances/$($default.id)/chat/models" -Method GET
            $modelsOk = $true
            Write-Host "Gateway models via Runtime Instance Chat OK"
        } catch {
            Write-Host "Instance Chat models not available; trying direct /v1/models"
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:$gwPort/v1/models" -Method GET
            $modelsOk = $true
        }
    }
    if (-not $modelsOk) { throw "Gateway /v1/models probe failed" }
    Write-Host "Gateway /health and /v1/models OK"
}

$jobs = Assert-Ok "/api/v1/runtime/jobs"
$failed = @($jobs | Where-Object { $_.status -eq "failed" })
if ($RequireHermes -and $failed.Count -gt 0) {
    Write-Host "WARN: $($failed.Count) failed runtime jobs present"
}

Write-Host "Smoke test passed"
exit 0
