#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$PayloadDigest,
    [string]$Phase = "controller_verified",
    [string]$PreviousVersion = "",
    [string]$TargetVersion = "",
    [string]$PreviousOwner = "",
    [string]$TargetSid = "",
    [int]$Attempt = 1
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
$controllerMod = Join-Path $PSScriptRoot "..\..\controller\SmcController.psm1"
if (Test-Path -LiteralPath $controllerMod) {
    Import-Module $controllerMod -Force
    Start-SmcJournalV2 -RequestId $RequestId -DesiredDigest $PayloadDigest -Operation $Phase -PreviousOwner $PreviousOwner -PreviousVersion $PreviousVersion | Out-Null
    return
}
$path = Get-SmcJournalPath
Write-SmcJsonAtomic -Path $path -Object ([ordered]@{
        schema          = "smc.opsi.transaction.v2"
        requestId       = $RequestId
        payloadDigest   = $PayloadDigest
        desiredDigest   = $PayloadDigest
        attempt         = $Attempt
        phase           = $Phase
        previousVersion = $PreviousVersion
        targetVersion   = $TargetVersion
        previousOwner   = $PreviousOwner
        targetSid       = $TargetSid
        startedAt       = [DateTime]::UtcNow.ToString("o")
        error           = ""
    })
