#Requires -Version 5.1
param([string]$RequestId = "")
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
$path = Get-SmcJournalPath
if (-not (Test-Path -LiteralPath $path)) { return $null }
$journal = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
if ($RequestId -and $journal.requestId -ne $RequestId) { throw "journal request mismatch" }
if ($journal.phase -in @("commit")) { return $journal }
return $journal
