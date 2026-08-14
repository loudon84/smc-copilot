#Requires -Version 5.1
param([Parameter(Mandatory = $true)][string]$Root)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

# Uninstall OPSI-managed files and logon triggers only. Never delete user Hermes data.
$taskName = "SMC-Hermes-User-Bootstrap"
try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}

foreach ($rel in @("staging", "versions", "scripts", "managed\policy", "state\journal.json")) {
    $path = Join-Path $Root $rel
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$keep = @(
    Join-Path $env:USERPROFILE ".hermes"
)
# Explicitly do not touch Profiles/Config/Skills/Plugins/Memory/Sessions/Credentials/Workspace.
foreach ($path in $keep) {
    if ($path) { Write-Output "retained:$path" }
}
