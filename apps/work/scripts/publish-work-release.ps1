$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

param(
  [string]$ReleaseDir,
  [string]$RemoteHost = $env:SMC_WORK_RELEASE_HOST,
  [string]$RemoteUser = $env:SMC_WORK_RELEASE_USER,
  [string]$RemoteRoot = $env:SMC_WORK_RELEASE_REMOTE_ROOT,
  [string]$LocalRoot = $env:SMC_WORK_RELEASE_LOCAL_ROOT,
  [string]$RemotePromoteScript = $env:SMC_WORK_RELEASE_PROMOTE_SCRIPT
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"

function Get-PackageVersion {
  $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
  if (-not $packageJson.version) {
    throw "package.json missing version"
  }
  return [string]$packageJson.version
}

$version = Get-PackageVersion
if (-not $ReleaseDir) {
  $ReleaseDir = Join-Path $repoRoot "release/work/$version"
}

if (-not (Test-Path -LiteralPath $ReleaseDir)) {
  throw "Release directory not found: $ReleaseDir"
}

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "validate-work-release.ps1") -ReleaseDir $ReleaseDir
if ($LASTEXITCODE -ne 0) {
  throw "Local release validation failed"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stagingId = "$version-$timestamp"
$remoteReleaseRoot = if ($RemoteRoot) { $RemoteRoot.TrimEnd("/") } else { "/data/smc-release/work" }
$remoteStagingDir = "$remoteReleaseRoot/staging/$stagingId"

if ($LocalRoot) {
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

Write-Host "Published $version to $RemoteHost via staging $stagingId"
