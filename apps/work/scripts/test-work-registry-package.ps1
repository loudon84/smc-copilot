$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$guardScript = Join-Path $PSScriptRoot "lib/work-release-guard.mjs"
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$profileRoot = Join-Path $tempRoot ("smc-work-registry-package-" + [guid]::NewGuid().ToString("N"))
$profilePath = Join-Path $profileRoot "registry-profile.json"
$packageOutput = Join-Path $profileRoot "package-output"
$registryConfigPath = Join-Path $packageOutput "win-unpacked\resources\work-registry-config.json"
$previousProfile = [Environment]::GetEnvironmentVariable("SMC_WORK_REGISTRY_BUILD_PROFILE_FILE", "Process")
$previousUpdateUrl = [Environment]::GetEnvironmentVariable("SMC_WORK_UPDATE_URL", "Process")
$previousWinCscLink = [Environment]::GetEnvironmentVariable("WIN_CSC_LINK", "Process")

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  Write-Host "==> $Label"
  & $Action
}

function Assert-ExitCode {
  param([Parameter(Mandatory = $true)][string]$Message)
  if ($LASTEXITCODE -ne 0) { throw $Message }
}

New-Item -ItemType Directory -Path $profileRoot | Out-Null

try {
  @{
    schemaVersion = 1
    registryId = "package-proof-registry"
    indexUrl = "https://registry.example.invalid/index.json"
    modelsUrl = "https://registry.example.invalid/models.json"
    contentBaseUrl = "https://registry.example.invalid/content"
    treeUrl = "https://registry.example.invalid/tree"
    webBaseUrl = "https://registry.example.invalid/web"
  } | ConvertTo-Json | Set-Content -LiteralPath $profilePath -Encoding utf8

  Push-Location $repoRoot
  try {
    $env:SMC_WORK_UPDATE_URL = "https://release.superic.com/work/stable/"
    $env:WIN_CSC_LINK = ""
    $env:SMC_WORK_REGISTRY_BUILD_PROFILE_FILE = $profilePath
    Invoke-Step "Assemble enterprise unpacked package" { npm run build }
    Assert-ExitCode "enterprise build failed"
    & node scripts/run-electron-builder.mjs --win --dir "--config.directories.output=$packageOutput" "--config.win.signAndEditExecutable=false"
    Assert-ExitCode "enterprise package assembly failed"
    & node $guardScript validate-registry-config $registryConfigPath enterprise $profilePath
    Assert-ExitCode "enterprise Registry descriptor verification failed"

    Remove-Item Env:SMC_WORK_REGISTRY_BUILD_PROFILE_FILE
    Invoke-Step "Assemble Community unpacked package" { npm run build }
    Assert-ExitCode "Community build failed"
    & node scripts/run-electron-builder.mjs --win --dir "--config.directories.output=$packageOutput" "--config.win.signAndEditExecutable=false"
    Assert-ExitCode "Community package assembly failed"
    & node $guardScript validate-registry-config $registryConfigPath community
    Assert-ExitCode "Community Registry descriptor verification failed"
  } finally {
    Pop-Location
  }
} finally {
  [Environment]::SetEnvironmentVariable("SMC_WORK_REGISTRY_BUILD_PROFILE_FILE", $null, "Process")
  Push-Location $repoRoot
  try {
    & node scripts/generate-work-registry-config.mjs
    Assert-ExitCode "Community Registry resource cleanup failed"
  } finally {
    Pop-Location
  }
  [Environment]::SetEnvironmentVariable("SMC_WORK_REGISTRY_BUILD_PROFILE_FILE", $previousProfile, "Process")
  [Environment]::SetEnvironmentVariable("SMC_WORK_UPDATE_URL", $previousUpdateUrl, "Process")
  [Environment]::SetEnvironmentVariable("WIN_CSC_LINK", $previousWinCscLink, "Process")
  if (Test-Path -LiteralPath $profileRoot) {
    $resolvedProfileRoot = (Resolve-Path -LiteralPath $profileRoot).Path
    if (-not $resolvedProfileRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove a profile directory outside the temporary directory"
    }
    Remove-Item -LiteralPath $resolvedProfileRoot -Recurse -Force
  }
}
