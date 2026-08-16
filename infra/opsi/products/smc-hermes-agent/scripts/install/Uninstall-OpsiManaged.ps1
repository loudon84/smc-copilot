#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$ManagedUserSid = ""
)
# Never delete user Hermes data (.hermes / Profiles / Memory / Sessions / Credentials / Workspace).
# Two-phase uninstall restores previous owner and retains tombstone/result until read-back.

Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force
$controllerMod = Join-Path $PSScriptRoot "..\..\controller\SmcController.psm1"
if (Test-Path -LiteralPath $controllerMod) { Import-Module $controllerMod -Force }

$manifestPath = Get-SmcTaskManifestPath
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    foreach ($name in @($manifest.bootstrapTask, $manifest.gatewayTask, $manifest.userControllerTask, $manifest.recoveryTask)) {
        if ($name) { Remove-SmcManagedTask -TaskName ([string]$name) }
    }
}
if ($ManagedUserSid) {
    Remove-SmcManagedTask -TaskName "SMC-Hermes-Controller-User-$ManagedUserSid"
    Remove-SmcManagedTask -TaskName "SMC-Hermes-Gateway-$ManagedUserSid"
    Remove-SmcManagedTask -TaskName "SMC-Hermes-User-Bootstrap-$ManagedUserSid"
}

if (Get-Command Restore-SmcPreviousOwner -ErrorAction SilentlyContinue) {
    Restore-SmcPreviousOwner
}
else {
    $ownership = Join-Path $Root "state\ownership.json"
    $ownerFile = Join-Path (Split-Path $Root) "control-owner.json"
    $previous = ""
    if (Test-Path -LiteralPath $ownership) {
        try { $previous = [string]((Get-Content -LiteralPath $ownership -Raw | ConvertFrom-Json).previous) } catch {}
    }
    if ($previous) {
        Write-SmcJsonAtomic -Path $ownerFile -Object @{ hermes = $previous }
    }
    elseif (Test-Path -LiteralPath $ownerFile) {
        Remove-Item -LiteralPath $ownerFile -Force
    }
}

foreach ($rel in @("staging", "versions", "scripts", "controller", "runtime", "desired", "observed", "transactions", "commands", "managed\policy", "state\journal.json", "state\task-manifest.json")) {
    $path = Join-Path $Root $rel
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-SmcJsonAtomic -Path (Join-Path $Root "results\uninstall-tombstone.json") -Object @{
    status           = "SUCCEEDED"
    retainedUserData = $true
}

$keep = @(
    Join-Path $env:USERPROFILE ".hermes"
)
foreach ($path in $keep) {
    if ($path) { Write-Output "retained:$path" }
}
