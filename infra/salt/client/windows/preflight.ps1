#Requires -Version 5.1
<#
.SYNOPSIS
  Windows 11 x64 preflight for SMC Salt Minion bootstrap (PRD v2.1).
#>
param(
    [int]$MinWindowsBuild = 22000,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-WindowsBuild {
    try {
        return [int](Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").CurrentBuildNumber
    } catch {
        return 0
    }
}

$arch = $env:PROCESSOR_ARCHITECTURE
$build = Get-WindowsBuild
$ok = ($arch -eq "AMD64") -and ($build -ge $MinWindowsBuild)

$result = [ordered]@{
    ok              = $ok
    arch            = $arch
    windowsBuild    = $build
    minWindowsBuild = $MinWindowsBuild
    dryRun          = [bool]$DryRun
    admin           = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $ok) {
    $result.error = "preflight_failed"
    $result.message = "Requires Windows 11 x64 (build >= $MinWindowsBuild), AMD64."
}

$result | ConvertTo-Json -Compress
if (-not $ok) { exit 2 }
exit 0
