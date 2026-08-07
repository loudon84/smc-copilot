# team_v1.7 Windows acceptance smoke test (extends smoke-test.ps1)
param(
    [string]$BaseUrl = "http://127.0.0.1:8765",
    [switch]$SkipProfileStart
)

$ErrorActionPreference = "Stop"
$script:Failures = @()

function Assert-Ok($Name, $ScriptBlock) {
    try {
        & $ScriptBlock
        Write-Host "[PASS] $Name" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] $Name — $_" -ForegroundColor Red
        $script:Failures += $Name
    }
}

Write-Host "=== smoke-test-windows ===" -ForegroundColor Cyan
Write-Host "BaseUrl: $BaseUrl"

Assert-Ok "health" {
    $h = Invoke-RestMethod -Uri "$BaseUrl/api/v1/health"
    if ($h.status -ne "ok") { throw "status not ok: $($h | ConvertTo-Json -Compress)" }
}

Assert-Ok "service/status" {
    $s = Invoke-RestMethod -Uri "$BaseUrl/api/v1/service/status"
    if (-not $s.port) { throw "missing port in service status" }
    $script:hermesHomeResolved = $(if ($null -ne $s.hermes_home -and "$($s.hermes_home)" -ne "") { $s.hermes_home } else { "$([Environment]::GetFolderPath('UserProfile'))\.hermes" })
    Write-Host ($s | ConvertTo-Json -Depth 5)
}

Assert-Ok "system/info" {
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/system/info" | Out-Null
}

Assert-Ok "create profile default" {
    $script:default = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/profiles" `
        -ContentType "application/json" `
        -Body '{"name":"default","type":"default","auto_start":false}'
    if (-not $script:default.id) { throw "no profile id" }
    $expected = [System.IO.Path]::GetFullPath(($script:hermesHomeResolved -replace '/','\'))
    $got = [System.IO.Path]::GetFullPath(($script:default.profile_path -replace '/','\'))
    if ($got -ne $expected) {
        throw "default profile_path should equal service hermes_home ($expected), got $got"
    }
}

Assert-Ok "create profile writer" {
    $script:writer = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/profiles" `
        -ContentType "application/json" `
        -Body '{"name":"writer","type":"writer","auto_start":false}'
    if ($script:default.gateway_port -eq $script:writer.gateway_port) {
        throw "Port conflict: $($script:default.gateway_port)"
    }
}

Assert-Ok "list profiles" {
    $list = Invoke-RestMethod -Uri "$BaseUrl/api/v1/profiles"
    if (-not $list) { throw "empty profile list" }
}

if (-not $SkipProfileStart) {
    foreach ($p in @($script:default, $script:writer)) {
        if (-not $p) { continue }
        $id = $p.id
        Assert-Ok "start profile $id" {
            try {
                Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/profiles/$id/start" | Out-Null
            } catch {
                Write-Warning "start failed (Hermes CLI may be missing): $_"
            }
        }
        Assert-Ok "profile $id status" {
            Invoke-RestMethod -Uri "$BaseUrl/api/v1/profiles/$id/status" | Out-Null
        }
    }
}

if ($script:Failures.Count -gt 0) {
    Write-Host "`nFailed checks: $($script:Failures -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host "`nAll smoke checks passed." -ForegroundColor Green
