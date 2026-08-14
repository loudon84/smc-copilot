#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$PayloadDigest
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
$path = Get-SmcJournalPath
Write-SmcJsonAtomic -Path $path -Object ([ordered]@{
        requestId     = $RequestId
        payloadDigest = $PayloadDigest
        phase         = "commit"
        finishedAt    = [DateTime]::UtcNow.ToString("o")
    })
