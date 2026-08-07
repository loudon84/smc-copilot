# V1.6 smoke test against running smc-copilot-serve
param(
    [string]$BaseUrl = "http://127.0.0.1:8765"
)

$ErrorActionPreference = "Stop"

Write-Host "health..."
Invoke-RestMethod -Uri "$BaseUrl/api/v1/health" | ConvertTo-Json

Write-Host "service status..."
Invoke-RestMethod -Uri "$BaseUrl/api/v1/service/status" | ConvertTo-Json -Depth 5

Write-Host "create profile default..."
$default = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/profiles" -ContentType "application/json" -Body '{"name":"default","type":"default","auto_start":true}'
$default | ConvertTo-Json
$defaultId = $default.id
$defaultPort = $default.gateway_port

Write-Host "create profile writer..."
$writer = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/profiles" -ContentType "application/json" -Body '{"name":"writer","type":"writer","auto_start":true}'
$writer | ConvertTo-Json
$writerId = $writer.id
$writerPort = $writer.gateway_port

if ($defaultPort -eq $writerPort) {
    throw "Port conflict: default and writer both assigned $defaultPort"
}
Write-Host "Ports OK: default=$defaultPort writer=$writerPort"

Write-Host "list profiles..."
Invoke-RestMethod -Uri "$BaseUrl/api/v1/profiles" | ConvertTo-Json -Depth 5

Write-Host "start profiles (requires Hermes or mock gateway configured)..."
foreach ($id in @($defaultId, $writerId)) {
    try {
        Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/profiles/$id/start" | ConvertTo-Json
    } catch {
        Write-Warning "start failed for $id (expected if Hermes CLI not installed): $_"
    }
}

Write-Host "smoke done."
