#Requires -Version 5.1
param([string]$RequestId = "")
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
$controllerMod = Join-Path $PSScriptRoot "..\..\controller\SmcController.psm1"
if (Test-Path -LiteralPath $controllerMod -and $RequestId) {
    Import-Module $controllerMod -Force
    return (Resume-SmcJournalV2 -RequestId $RequestId)
}
$path = Get-SmcJournalPath
if (-not (Test-Path -LiteralPath $path)) { return $null }
$journal = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
if ($RequestId -and $journal.requestId -ne $RequestId) { throw "journal request mismatch" }
if ($journal.phase -in @("commit", "finalized")) { return $journal }
$next = "rolled_back"
$checks = @()
if ($journal.checkpoints) { $checks = @($journal.checkpoints) }
if ($journal.phase -in @("owner_committed", "gateway_healthy") -or $checks -contains "gateway_healthy") { $next = "resumed" }
elseif ($journal.phase -in @("runtime_activated", "controller_installed") -or $checks -contains "runtime_activated") { $next = "recovering" }
Write-SmcJsonAtomic -Path $path -Object ([ordered]@{
        requestId       = $journal.requestId
        payloadDigest   = $journal.payloadDigest
        phase           = $next
        previousOwner   = $journal.previousOwner
        previousVersion = $journal.previousVersion
        resumed         = $true
        updatedAt       = [DateTime]::UtcNow.ToString("o")
    })
return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
