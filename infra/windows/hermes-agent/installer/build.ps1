param(
    [Parameter(Mandatory = $true)][string]$ReleaseVersion,
    [string]$OutputDir = "",
    [switch]$Smoke
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$agentRoot = Split-Path -Parent $PSScriptRoot
$installerDir = $PSScriptRoot
$dist = if ($OutputDir) { $OutputDir } else { Join-Path $installerDir "dist" }
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$payload = Join-Path $dist "payload"
New-Item -ItemType Directory -Force -Path $payload | Out-Null

if ($Smoke) {
    $fixture = Join-Path $agentRoot "tests\fixtures\release-v2-smoke"
    if (-not (Test-Path -LiteralPath $fixture)) {
        $repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $agentRoot))
        $generator = Join-Path $repoRoot "tools\release\hermes\build_installer_smoke_fixture.py"
        if (-not (Test-Path -LiteralPath $generator)) {
            throw "smoke fixture missing and generator not found: $fixture"
        }
        & python $generator --dest $fixture | Out-Null
    }
    foreach ($name in @("hermes-windows-amd64.zip", "release-manifest.json", "release-manifest.sig")) {
        Copy-Item -Path (Join-Path $fixture $name) -Destination (Join-Path $payload $name) -Force
    }
} else {
    throw "non-smoke installer build requires WiX toolchain (use -Smoke in CI)"
}

Copy-Item -LiteralPath (Join-Path $installerDir "InstallerCore.psm1") -Destination (Join-Path $dist "InstallerCore.psm1") -Force
Copy-Item -LiteralPath (Join-Path $installerDir "verify_release_v2.py") -Destination (Join-Path $dist "verify_release_v2.py") -Force
Copy-Item -Recurse -LiteralPath (Join-Path $agentRoot "scripts") -Destination (Join-Path $dist "scripts") -Force

$bootstrap = @"
#Requires -Version 5.1
Set-StrictMode -Version Latest
`$ErrorActionPreference = 'Stop'
Import-Module (Join-Path `$PSScriptRoot 'InstallerCore.psm1') -Force
`$payload = Join-Path `$PSScriptRoot 'payload'
exit (Invoke-SmcHermesLifecycle -ArgumentList (@('/payload-root', `$payload) + `$args))
"@
$bootstrap | Set-Content -LiteralPath (Join-Path $dist "bootstrap.ps1") -Encoding utf8

$launcher = @"
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" %*
exit /b %ERRORLEVEL%
"@
$launcher | Set-Content -LiteralPath (Join-Path $dist "bootstrap.cmd") -Encoding ascii

$exeName = "smc-hermes-agent_${ReleaseVersion}_windows-amd64.exe"
$bundle = Join-Path $dist $exeName
$zipPath = "$bundle.zip"
Compress-Archive -Path (Join-Path $dist "bootstrap.cmd"), (Join-Path $dist "bootstrap.ps1"), (Join-Path $dist "InstallerCore.psm1"), (Join-Path $dist "verify_release_v2.py"), (Join-Path $dist "payload"), (Join-Path $dist "scripts") -DestinationPath $zipPath -Force
Move-Item -LiteralPath $zipPath -Destination $bundle -Force
Write-Output $bundle
