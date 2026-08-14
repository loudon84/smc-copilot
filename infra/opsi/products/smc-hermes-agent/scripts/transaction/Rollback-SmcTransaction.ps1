#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$ErrorMessage = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
$journalPath = Get-SmcJournalPath
if (-not (Test-Path -LiteralPath $journalPath)) { return }
$journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
$previous = [string]$journal.previousVersion
$owner = [string]$journal.previousOwner
if ($previous) {
    $src = Join-Path $Root "versions\previous"
    $current = Join-Path $Root "versions\current"
    if (Test-Path -LiteralPath $src) {
        if (Test-Path -LiteralPath $current) { Remove-Item -LiteralPath $current -Recurse -Force }
        Copy-Item -LiteralPath $src -Destination $current -Recurse -Force
    }
    Write-SmcJsonAtomic -Path (Join-Path $Root "state\version.json") -Object @{
        version   = $previous
        owner     = if ($owner) { $owner } else { "opsi" }
        updatedAt = [DateTime]::UtcNow.ToString("o")
        rolledBack = $true
    }
}
if ($owner -and $owner -ne "opsi") {
    $ownerPath = Join-Path (Split-Path $Root) "control-owner.json"
    Write-SmcJsonAtomic -Path $ownerPath -Object @{ hermes = $owner }
}
Write-SmcJsonAtomic -Path $journalPath -Object ([ordered]@{
        requestId = $journal.requestId
        phase     = "rollback"
        error     = (Protect-SmcText -Text $ErrorMessage)
        finishedAt = [DateTime]::UtcNow.ToString("o")
    })
