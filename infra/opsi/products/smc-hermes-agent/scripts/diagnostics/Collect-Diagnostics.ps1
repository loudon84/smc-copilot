#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$ClientId
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

$bundleRoot = Join-Path $Root "diagnostics\$RequestId"
New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null

$forbidden = @("chat", "session", "memory", "workspace", ".env")
$files = @()
$logCap = 500
$sources = @(
    @{ name = "adapter.log"; path = Join-Path $Root "logs\adapter.log" }
)

foreach ($src in $sources) {
    if (-not (Test-Path -LiteralPath $src.path)) { continue }
    $raw = Get-Content -LiteralPath $src.path -TotalCount $logCap -ErrorAction SilentlyContinue
    $text = Protect-SmcText -Text (($raw | ForEach-Object { $_ }) -join "`n")
    foreach ($word in $forbidden) {
        if ($text -match $word -and $word -eq ".env") {
            throw "refusing to collect .env"
        }
    }
    $out = Join-Path $bundleRoot $src.name
    Set-Content -LiteralPath $out -Value $text -Encoding utf8
    $sha = Get-FileHash -LiteralPath $out -Algorithm SHA256
    $item = Get-Item -LiteralPath $out
    if ($item.Length -gt 1MB) { throw "diagnostic file too large" }
    $files += @{ name = $src.name; sha256 = $sha.Hash.ToLowerInvariant(); bytes = [int]$item.Length }
}

$diag = @{
    schema             = "smc.hermes.diagnostic.v1"
    requestId          = $RequestId
    clientId           = $ClientId
    issueCode          = "COLLECTED"
    severity           = "INFO"
    recommendedAction  = "Review redacted bundle"
    redacted           = $true
    files              = $files
}
$diagJson = Protect-SmcText -Text ($diag | ConvertTo-Json -Compress -Depth 6)
Set-Content -LiteralPath (Join-Path $bundleRoot "diagnostic.json") -Value $diagJson -Encoding utf8
