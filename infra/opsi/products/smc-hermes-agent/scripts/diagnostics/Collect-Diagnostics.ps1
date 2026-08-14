#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$ClientId,
    [int]$LogLines = 200
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if ($LogLines -gt 500) { $LogLines = 500 }
$bundleRoot = Join-Path $Root "diagnostics\$RequestId"
New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null

$forbidden = @(".env", "credentials", "session.db", "state.db")
$files = @()
$sources = @(
    @{ name = "adapter.log"; path = Join-Path $Root "logs\adapter.log" }
    @{ name = "status.json"; path = Join-Path $Root "state\hermes.json" }
)

foreach ($src in $sources) {
    $leaf = Split-Path $src.path -Leaf
    foreach ($word in $forbidden) {
        if ($src.path -match [regex]::Escape($word)) { throw "refusing forbidden diagnostic path" }
    }
    if (-not (Test-Path -LiteralPath $src.path)) { continue }
    $raw = Get-Content -LiteralPath $src.path -TotalCount $LogLines -ErrorAction SilentlyContinue
    $text = Protect-SmcText -Text (($raw | ForEach-Object { $_ }) -join "`n")
    $out = Join-Path $bundleRoot $src.name
    Set-Content -LiteralPath $out -Value $text -Encoding utf8
    $item = Get-Item -LiteralPath $out
    if ($item.Length -gt 5MB) { throw "diagnostic bundle too large" }
    $sha = Get-FileHash -LiteralPath $out -Algorithm SHA256
    $files += @{ name = $src.name; sha256 = $sha.Hash.ToLowerInvariant(); bytes = [int]$item.Length }
}

$diag = [ordered]@{
    schema            = "smc.hermes.diagnostic.v1"
    requestId         = $RequestId
    clientId          = $ClientId
    issueCode         = "COLLECTED"
    severity          = "INFO"
    recommendedAction = "Review redacted bundle"
    redacted          = $true
    files             = $files
}
$diagJson = ConvertTo-SmcCanonicalJson -Object $diag
if ([System.Text.Encoding]::UTF8.GetByteCount($diagJson) -gt 5MB) { throw "diagnostic bundle too large" }
Set-Content -LiteralPath (Join-Path $bundleRoot "diagnostic.json") -Value $diagJson -Encoding utf8
$digest = Get-SmcSha256Text -Text $diagJson
$compact = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($diagJson))
$max = 200000
$chunks = [Math]::Ceiling($compact.Length / [double]$max)
if ($chunks -lt 1) { $chunks = 1 }
for ($i = 0; $i -lt $chunks; $i++) {
    $len = [Math]::Min($max, $compact.Length - ($i * $max))
    $part = $compact.Substring($i * $max, $len)
    $line = "SMC_DIAGNOSTIC request_id=$RequestId client_id=$ClientId index=$i total=$chunks digest=$digest chunk=$part"
    Write-Output $line
    Add-Content -LiteralPath (Join-Path $Root "logs\instlog-marker.txt") -Value $line -Encoding ascii
}
