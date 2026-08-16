#Requires -Version 5.1
param([Parameter(Mandatory = $true)][string]$Root)
# Never delete user Hermes data (.hermes / Profiles / Memory / Sessions / Credentials / Workspace).
# Uninstall only removes managed tasks, staging, versions, and task manifest.

$manifestPath = Get-SmcTaskManifestPath
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    foreach ($name in @($manifest.bootstrapTask, $manifest.gatewayTask)) {
        if ($name) { Remove-SmcManagedTask -TaskName ([string]$name) }
    }
}

foreach ($rel in @("staging", "versions", "scripts", "managed\policy", "state\journal.json", "state\task-manifest.json")) {
    $path = Join-Path $Root $rel
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$keep = @(
    Join-Path $env:USERPROFILE ".hermes"
)
foreach ($path in $keep) {
    if ($path) { Write-Output "retained:$path" }
}
