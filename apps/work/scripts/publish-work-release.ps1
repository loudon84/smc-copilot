param(
  [string]$ReleaseDir,
  [string]$RemoteHost = $env:SMC_WORK_RELEASE_HOST,
  [string]$RemoteUser = $env:SMC_WORK_RELEASE_USER,
  [string]$RemoteRoot = $env:SMC_WORK_RELEASE_REMOTE_ROOT,
  [string]$LocalRoot = $env:SMC_WORK_RELEASE_LOCAL_ROOT,
  [string]$RemotePromoteScript = $env:SMC_WORK_RELEASE_PROMOTE_SCRIPT
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"
$publicFeedUrl = "https://release.superic.com/work/stable/"

function Get-PackageVersion {
  $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
  if (-not $packageJson.version) {
    throw "package.json missing version"
  }
  return [string]$packageJson.version
}

function Assert-PublishableRelease {
  param(
    [Parameter(Mandatory = $true)]$Manifest
  )

  if ($env:SMC_WORK_RELEASE_ALLOW_UNSIGNED -eq "1") {
    throw "PUBLISH_DENIED: Unsigned release cannot be published"
  }
  if (-not $env:SMC_WORK_EXPECTED_PUBLISHER) {
    throw "PUBLISH_DENIED: SMC_WORK_EXPECTED_PUBLISHER is required"
  }
  if ($Manifest.signed -ne $true) {
    throw "PUBLISH_DENIED: release-manifest.json signed must be true"
  }
}

function Confirm-PublishedFeed {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$InstallerName
  )

  $latestUrl = "${publicFeedUrl}latest.yml"
  $installerUrl = "$publicFeedUrl$InstallerName"

  try {
    $latest = Invoke-WebRequest -Uri $latestUrl -Method GET -UseBasicParsing -TimeoutSec 30
    if ($latest.StatusCode -ne 200) {
      throw "latest.yml status $($latest.StatusCode)"
    }
    $escapedVersion = [regex]::Escape($Version)
    if ($latest.Content -notmatch "(?m)^version:\s*$escapedVersion\s*$") {
      throw "latest.yml version is not $Version"
    }

    $installer = Invoke-WebRequest -Uri $installerUrl -Method HEAD -UseBasicParsing -TimeoutSec 30
    if ($installer.StatusCode -ne 200) {
      throw "installer HEAD status $($installer.StatusCode)"
    }
    $contentLengthHeader = $installer.Headers["Content-Length"]
    $contentLength = if ($contentLengthHeader -is [array]) { $contentLengthHeader[0] } else { $contentLengthHeader }
    if (-not $contentLength -or [int64]$contentLength -le 0) {
      throw "installer HEAD missing Content-Length"
    }
  } catch {
    throw "PUBLISH_NOT_CONFIRMED: $($_.Exception.Message)"
  }
}

$version = Get-PackageVersion
if (-not $ReleaseDir) {
  $ReleaseDir = Join-Path $repoRoot "release/work/$version"
}

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  throw "Release directory not found: $ReleaseDir"
}

$manifestPath = Join-Path $ReleaseDir "release-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "release-manifest.json not found"
}
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$isLocalStaging = [bool]$LocalRoot

if (-not $isLocalStaging) {
  Assert-PublishableRelease -Manifest $manifest
}

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "validate-work-release.ps1") -ReleaseDir $ReleaseDir
if ($LASTEXITCODE -ne 0) {
  throw "Local release validation failed"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stagingId = "$version-$timestamp"
$remoteReleaseRoot = if ($RemoteRoot) { $RemoteRoot.TrimEnd("/") } else { "/data/smc-release/work" }
$remoteStagingDir = "$remoteReleaseRoot/staging/$stagingId"
$installerName = "smc-copilot-$version-setup.exe"

if ($isLocalStaging) {
  $stagingDir = Join-Path $LocalRoot "staging\$stagingId"
  New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
  Copy-Item -Path (Join-Path $ReleaseDir "*") -Destination $stagingDir -Recurse -Force
  Write-Host "Staged release locally at $stagingDir"
  return
}

if (-not $RemoteHost -or -not $RemoteUser) {
  throw "Set either SMC_WORK_RELEASE_LOCAL_ROOT or both SMC_WORK_RELEASE_HOST and SMC_WORK_RELEASE_USER"
}
if (-not $RemotePromoteScript) {
  throw "SMC_WORK_RELEASE_PROMOTE_SCRIPT is required for remote publish"
}

ssh "$RemoteUser@$RemoteHost" "mkdir -p '$remoteStagingDir'"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create remote staging directory"
}

scp "$ReleaseDir\*" "$RemoteUser@$RemoteHost`:$remoteStagingDir/"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload release artifacts"
}

$promoteCommand = "RELEASE_ROOT='$remoteReleaseRoot' '$RemotePromoteScript' '$version' '$stagingId'"
ssh "$RemoteUser@$RemoteHost" $promoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "Remote promote failed"
}

Confirm-PublishedFeed -Version $version -InstallerName $installerName

Write-Host "Published $version to $RemoteHost via staging $stagingId"
