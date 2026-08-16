#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$HermesVersion,
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$ManagedUserSid = "",
    [switch]$Update
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "..\common\SmcOpsi.psm1") -Force

if (-not (Test-SmcExactVersion -Version $HermesVersion)) {
    throw "HermesVersion must be exact (not latest)"
}

$layout = Get-SmcProductLayout -AnchorPath $PSScriptRoot
$scriptPathArtifacts = Join-Path $layout.Artifacts "hermes-$HermesVersion-windows.zip"
$programDataArtifacts = Join-Path $Root "managed\artifacts\hermes-$HermesVersion-windows.zip"
$artifact = $null
if (Test-Path -LiteralPath $scriptPathArtifacts) { $artifact = $scriptPathArtifacts }
elseif (Test-Path -LiteralPath $programDataArtifacts) { $artifact = $programDataArtifacts }
if (-not $artifact) {
    throw "artifact missing: hermes-$HermesVersion-windows.zip (fail closed)"
}

$manifestPath = "$artifact.manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) { $manifestPath = ($artifact -replace '\.zip$', '.manifest.json') }
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "artifact manifest missing" }
$sigPath = "$artifact.sig"
if (-not (Test-Path -LiteralPath $sigPath)) { $sigPath = ($artifact -replace '\.zip$', '.sig') }
if (-not (Test-Path -LiteralPath $sigPath)) { throw "artifact signature missing" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne $HermesVersion) { throw "manifest version mismatch" }
$pub = Join-Path $layout.Keys "release-public-key.pem"
$allowedKeyIds = @("smc-opsi-release-ed25519-v1", "smc-opsi-release-ed25519-v2")
$keyId = "smc-opsi-release-ed25519-v1"
if ($manifest.keyId) { $keyId = [string]$manifest.keyId }
if ($keyId -eq "TEST-ONLY-ed25519") {
    $smokePub = Join-Path $layout.Keys "smoke-public-key.pem"
    if (-not (Test-Path -LiteralPath $smokePub)) { throw "smoke public key missing" }
    $pub = $smokePub
    $allowedKeyIds += "TEST-ONLY-ed25519"
}
elseif (-not (Test-Path -LiteralPath $pub)) {
    throw "release public key missing"
}
if ($allowedKeyIds -notcontains $keyId) { throw "untrusted artifact keyId" }
Assert-SmcArtifactSignature -Artifact $artifact -ManifestPath $manifestPath -SignaturePath $sigPath -PublicKeyPath $pub -ExpectedKeyId $keyId

$stagingDir = Join-Path $env:ProgramData "SMC\opsi\staging\$HermesVersion"
if (Test-Path -LiteralPath $stagingDir) { Remove-Item -LiteralPath $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
Copy-Item -LiteralPath $artifact, $manifestPath, $sigPath -Destination $stagingDir -Force

$current = Join-Path $Root "versions\current"
$previous = Join-Path $Root "versions\previous"
$versionJson = Join-Path $Root "state\version.json"
$previousVersion = ""
if (Test-Path -LiteralPath $versionJson) {
    try { $previousVersion = [string]((Get-Content -LiteralPath $versionJson -Raw | ConvertFrom-Json).version) } catch {}
}
if ($Update -and (Test-Path -LiteralPath $current)) {
    if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
    Copy-Item -LiteralPath $current -Destination $previous -Recurse -Force
}

$extract = Join-Path $stagingDir "payload"
New-Item -ItemType Directory -Force -Path $extract | Out-Null
Expand-Archive -LiteralPath (Join-Path $stagingDir (Split-Path $artifact -Leaf)) -DestinationPath $extract -Force
New-Item -ItemType Directory -Force -Path $current | Out-Null
Copy-Item -Path (Join-Path $extract "*") -Destination $current -Recurse -Force

if (Test-SmcSystemProfilePath -Path $current) {
    throw "refusing systemprofile install path"
}

$entrypoint = "hermes.exe"
if ($manifest.entrypoint) { $entrypoint = [string]$manifest.entrypoint }
$cliDigest = ""
if ($manifest.cliSha256) { $cliDigest = [string]$manifest.cliSha256 }
$cli = Resolve-SmcHermesCli -Root $Root -Entrypoint $entrypoint -ExpectedDigest $cliDigest
$verOut = & $cli --version 2>$null | Select-Object -First 1
if ("$verOut" -notmatch [regex]::Escape($HermesVersion)) {
    throw "CLI version mismatch: expected $HermesVersion"
}

Write-SmcJsonAtomic -Path $versionJson -Object @{
    version          = $HermesVersion
    previousVersion  = $previousVersion
    packageRevision  = [string]$manifest.packageRevision
    artifactDigest   = [string]$manifest.sha256
    entrypoint       = $entrypoint
    owner            = "pending"
    updatedAt        = [DateTime]::UtcNow.ToString("o")
}
