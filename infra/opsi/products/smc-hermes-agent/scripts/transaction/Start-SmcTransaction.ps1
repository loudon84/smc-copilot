#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$PayloadDigest,
    [string]$Phase = "prepare",
    [string]$PreviousVersion = "",
    [string]$TargetVersion = "",
    [string]$PreviousOwner = "",
    [string]$TargetSid = "",
    [int]$Attempt = 1
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
$path = Get-SmcJournalPath
Write-SmcJsonAtomic -Path $path -Object ([ordered]@{
        requestId       = $RequestId
        payloadDigest   = $PayloadDigest
        attempt         = $Attempt
        phase           = $Phase
        previousVersion = $PreviousVersion
        targetVersion   = $TargetVersion
        previousOwner   = $PreviousOwner
        targetSid       = $TargetSid
        startedAt       = [DateTime]::UtcNow.ToString("o")
        error           = ""
    })
