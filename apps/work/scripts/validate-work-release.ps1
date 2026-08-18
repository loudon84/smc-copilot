param(
  [string]$ReleaseDir,
  [string]$PackageJsonPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "package.json")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$guardScript = Join-Path $PSScriptRoot "lib/work-release-guard.mjs"

function Get-PackageVersion {
  $packageJson = Get-Content -Raw -LiteralPath $PackageJsonPath | ConvertFrom-Json
  if (-not $packageJson.version) {
    throw "package.json missing version"
  }
  return [string]$packageJson.version
}

function Assert-Authenticode {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if ($env:SMC_WORK_RELEASE_ALLOW_UNSIGNED -eq "1") {
    Write-Warning "Skipping Authenticode gate because SMC_WORK_RELEASE_ALLOW_UNSIGNED=1"
    return
  }

  $expectedPublisher = $env:SMC_WORK_EXPECTED_PUBLISHER
  if (-not $expectedPublisher) {
    throw "SMC_WORK_EXPECTED_PUBLISHER is required for signed release validation"
  }

  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne "Valid") {
    throw "Authenticode signature is not valid: $($signature.Status)"
  }
  $subject = [string]$signature.SignerCertificate.Subject
  if ($subject -notmatch $expectedPublisher) {
    throw "Unexpected release publisher: $subject"
  }
}

if (-not $ReleaseDir) {
  $version = Get-PackageVersion
  $ReleaseDir = Join-Path (Split-Path -Parent $PSScriptRoot) "release/work/$version"
}

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  throw "Release directory not found: $ReleaseDir"
}

$version = Get-PackageVersion
$installerName = "smc-copilot-$version-setup.exe"
$installerPath = Join-Path $ReleaseDir $installerName
$manifestPath = Join-Path $ReleaseDir "release-manifest.json"

node $guardScript validate-release $ReleaseDir $version
if ($LASTEXITCODE -ne 0) {
  throw "Release artifact validation failed"
}

Assert-Authenticode -Path $installerPath

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.schema -ne "smc.work.release.v1") {
  throw "release-manifest.json schema mismatch"
}
if ($manifest.version -ne $version) {
  throw "release-manifest.json version mismatch"
}
if ($manifest.installer -ne $installerName) {
  throw "release-manifest.json installer mismatch"
}
if (-not $manifest.updateUrl) {
  throw "release-manifest.json missing updateUrl"
}

node $guardScript validate-url ([string]$manifest.updateUrl)
if ($LASTEXITCODE -ne 0) {
  throw "release-manifest.json updateUrl is invalid"
}

$actualSha = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($manifest.sha256 -ne $actualSha) {
  throw "release-manifest.json sha256 mismatch"
}

Write-Host "Release validation passed for $ReleaseDir"
