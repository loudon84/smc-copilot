param(
    [Parameter(Mandatory = $true)][string]$ReleaseVersion,
    [string]$OutputDir = "",
    [string]$PayloadSource = "",
    [switch]$Smoke
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-WiXVersion {
    param([Parameter(Mandatory = $true)][string]$ReleaseVersion)
    if ($ReleaseVersion -match '^(\d+)\.(\d+)\.(\d+)(?:-smc\.(\d+))?') {
        $rev = if ($Matches[4]) { [int]$Matches[4] } else { 0 }
        return "{0}.{1}.{2}.{3}" -f [int]$Matches[1], [int]$Matches[2], [int]$Matches[3], $rev
    }
    throw "ReleaseVersion must look like 0.22.0-smc.1 (got: $ReleaseVersion)"
}

function Resolve-WixExe {
    $cmd = Get-Command wix -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\wix.exe"),
        (Join-Path $env:USERPROFILE ".dotnet\tools\wix.exe"),
        "C:\Program Files\WiX Toolset v6.0\bin\wix.exe",
        "C:\Program Files\WiX Toolset v5.0\bin\wix.exe"
    )
    foreach ($path in $candidates) {
        if ($path -and (Test-Path -LiteralPath $path)) { return $path }
    }
    throw "WiX CLI (wix.exe) is required for native Burn/MSI builds"
}

$agentRoot = Split-Path -Parent $PSScriptRoot
$installerDir = $PSScriptRoot
$dist = if ($OutputDir) { $OutputDir } else { Join-Path $installerDir "dist" }
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$staging = Join-Path $dist "staging"
$payload = Join-Path $staging "payload"
$scriptsOut = Join-Path $staging "scripts"
New-Item -ItemType Directory -Force -Path $payload | Out-Null
New-Item -ItemType Directory -Force -Path $scriptsOut | Out-Null

if ($PayloadSource) {
    $payloadRoot = $PayloadSource
} elseif ($Smoke) {
    $fixture = Join-Path $agentRoot "tests\fixtures\release-v2-smoke"
    if (-not (Test-Path -LiteralPath (Join-Path $fixture "hermes-windows-amd64.zip"))) {
        $repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $agentRoot))
        $generator = Join-Path $repoRoot "tools\release\hermes\build_installer_smoke_fixture.py"
        if (-not (Test-Path -LiteralPath $generator)) {
            throw "smoke fixture missing and generator not found: $fixture"
        }
        & python $generator --dest $fixture | Out-Null
    }
    $payloadRoot = $fixture
} else {
    throw "non-smoke installer build requires -PayloadSource pointing at hermes-windows-amd64.zip + release-manifest.json(+.sig)"
}

foreach ($name in @("hermes-windows-amd64.zip", "release-manifest.json", "release-manifest.sig")) {
    $src = Join-Path $payloadRoot $name
    if (-not (Test-Path -LiteralPath $src)) {
        if ($name -eq "release-manifest.sig") {
            Set-Content -LiteralPath (Join-Path $payload $name) -Value "" -Encoding ascii
            continue
        }
        throw "payload file missing: $src"
    }
    Copy-Item -LiteralPath $src -Destination (Join-Path $payload $name) -Force
}
$publicKey = Join-Path $payloadRoot "release-public-key.pem"
if (Test-Path -LiteralPath $publicKey) {
    Copy-Item -LiteralPath $publicKey -Destination (Join-Path $payload "release-public-key.pem") -Force
}

Copy-Item -LiteralPath (Join-Path $installerDir "bootstrap.ps1") -Destination (Join-Path $staging "bootstrap.ps1") -Force
Copy-Item -LiteralPath (Join-Path $installerDir "InstallerCore.psm1") -Destination (Join-Path $staging "InstallerCore.psm1") -Force
Copy-Item -LiteralPath (Join-Path $agentRoot "scripts\SmcHermesManaged.psm1") -Destination (Join-Path $scriptsOut "SmcHermesManaged.psm1") -Force

$wixVersion = ConvertTo-WiXVersion -ReleaseVersion $ReleaseVersion
$wix = Resolve-WixExe
$msiPath = Join-Path $dist "smc-hermes-agent_$ReleaseVersion`_windows-amd64.msi"
$exeName = "smc-hermes-agent_${ReleaseVersion}_windows-amd64.exe"
$bundlePath = Join-Path $dist $exeName
$balExt = "WixToolset.BootstrapperApplications.wixext"

& $wix --version | Out-Null
$extList = & $wix extension list 2>&1 | Out-String
if ($extList -notmatch [regex]::Escape($balExt)) {
    & $wix extension add $balExt | Out-Null
}

$productBuild = & $wix build `
    (Join-Path $installerDir "Product.wxs") `
    -arch x64 `
    -d "ProductVersion=$wixVersion" `
    -d "StagingDir=$staging" `
    -o $msiPath 2>&1
if ($LASTEXITCODE -ne 0) { throw "WiX MSI build failed: $($productBuild | Out-String)" }

$bundleBuild = & $wix build `
    (Join-Path $installerDir "Bundle.wxs") `
    -arch x64 `
    -ext $balExt `
    -d "BundleVersion=$wixVersion" `
    -d "MsiPath=$msiPath" `
    -o $bundlePath 2>&1
if ($LASTEXITCODE -ne 0) { throw "WiX Burn bundle build failed: $($bundleBuild | Out-String)" }

$pe = [System.IO.File]::ReadAllBytes($bundlePath)
if ($pe.Length -lt 2 -or $pe[0] -ne 0x4D -or $pe[1] -ne 0x5A) {
    throw "Release FAILED: installer is not a PE (MZ) executable"
}
$msiBytes = [System.IO.File]::ReadAllBytes($msiPath)
if ($msiBytes.Length -lt 8 -or $msiBytes[0] -ne 0xD0 -or $msiBytes[1] -ne 0xCF) {
    throw "Release FAILED: MSI is not a valid OLE compound document"
}

# Endpoint must not ship Build/CI Python verifier.
$forbidden = @(
    (Join-Path $staging "verify_release_v2.py"),
    (Join-Path $dist "verify_release_v2.py")
)
foreach ($path in $forbidden) {
    if (Test-Path -LiteralPath $path) {
        throw "Release FAILED: Endpoint payload must not include verify_release_v2.py"
    }
}

Write-Output $bundlePath
