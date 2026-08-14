#Requires -Version 5.1
param([Parameter(Mandatory = $true)][string]$Root)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\..\common\SmcOpsi.psm1") -Force

# User-context only. Resolve home via Hermes CLI / HERMES_HOME / SID profile. Never guess C:\Users\<name>\.hermes.
$home = $env:HERMES_HOME
if (-not $home) {
    $cli = Get-Command hermes -ErrorAction SilentlyContinue
    if ($cli) {
        try { $home = (& hermes config path 2>$null | Select-Object -First 1) } catch {}
    }
}
if (-not $home) {
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $profile = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
    if ($profile) { $home = Join-Path $profile ".hermes" }
}
if (-not $home) { throw "USER_CONTEXT_PENDING: cannot resolve HERMES_HOME" }
if (Test-SmcSystemProfilePath -Path $home) { throw "refusing systemprofile Hermes Home" }

New-Item -ItemType Directory -Force -Path $home | Out-Null
$cli = Get-Command hermes -ErrorAction SilentlyContinue
if ($cli) {
    try { & hermes gateway status | Out-Null } catch {}
}
