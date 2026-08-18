$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"
$guardScript = Join-Path $PSScriptRoot "lib/work-release-guard.mjs"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  Write-Host "==> $Label"
  & $Action
}

function Require-CleanGitTree {
  $status = git -C $repoRoot status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "git status failed"
  }
  if ($status) {
    throw "Refusing release build with a dirty git tree"
  }
}

function Require-ValidUpdateUrl {
  if (-not $env:SMC_WORK_UPDATE_URL) {
    throw "SMC_WORK_UPDATE_URL is required"
  }
  node $guardScript validate-url $env:SMC_WORK_UPDATE_URL
  if ($LASTEXITCODE -ne 0) {
    throw "Invalid SMC_WORK_UPDATE_URL"
  }
}

function Assert-Authenticode {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if ($env:SMC_WORK_RELEASE_ALLOW_UNSIGNED -eq "1") {
    Write-Warning "Skipping Authenticode gate because SMC_WORK_RELEASE_ALLOW_UNSIGNED=1"
    return $false
  }

  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne "Valid") {
    throw "Authenticode signature is not valid: $($signature.Status)"
  }
  return $true
}

function Get-PackageVersion {
  $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
  if (-not $packageJson.version) {
    throw "package.json missing version"
  }
  return [string]$packageJson.version
}

Push-Location $repoRoot
try {
  $version = Get-PackageVersion
  $distDir = Join-Path $repoRoot "dist"
  $releaseDir = Join-Path $repoRoot "release/work/$version"
  $installerName = "smc-work-$version-setup.exe"
  $blockmapName = "$installerName.blockmap"
  $installerPath = Join-Path $distDir $installerName
  $blockmapPath = Join-Path $distDir $blockmapName
  $latestPath = Join-Path $distDir "latest.yml"

  Invoke-Step "Check git state" { Require-CleanGitTree }
  Invoke-Step "Validate update URL" { Require-ValidUpdateUrl }
  Invoke-Step "Install dependencies" { npm ci }
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
  Invoke-Step "Run guards" { npm run guard }
  if ($LASTEXITCODE -ne 0) { throw "npm run guard failed" }
  Invoke-Step "Run typecheck" { npm run typecheck }
  if ($LASTEXITCODE -ne 0) { throw "npm run typecheck failed" }
  Invoke-Step "Run tests" { npm test }
  if ($LASTEXITCODE -ne 0) { throw "npm test failed" }
  Invoke-Step "Build Windows NSIS artifact" { npx electron-builder --win nsis --x64 --publish never }
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

  foreach ($path in @($installerPath, $blockmapPath, $latestPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Missing build artifact: $path"
    }
  }

  $signed = Assert-Authenticode -Path $installerPath

  if (Test-Path -LiteralPath $releaseDir) {
    Remove-Item -LiteralPath $releaseDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

  Copy-Item -LiteralPath $installerPath -Destination (Join-Path $releaseDir $installerName)
  Copy-Item -LiteralPath $blockmapPath -Destination (Join-Path $releaseDir $blockmapName)
  Copy-Item -LiteralPath $latestPath -Destination (Join-Path $releaseDir "latest.yml")

  $hash = (Get-FileHash -LiteralPath (Join-Path $releaseDir $installerName) -Algorithm SHA256).Hash.ToLowerInvariant()
  $gitCommit = (git -C $repoRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "git rev-parse HEAD failed"
  }

  @(
    "$hash  $installerName"
    "$((Get-FileHash -LiteralPath (Join-Path $releaseDir $blockmapName) -Algorithm SHA256).Hash.ToLowerInvariant())  $blockmapName"
    "$((Get-FileHash -LiteralPath (Join-Path $releaseDir 'latest.yml') -Algorithm SHA256).Hash.ToLowerInvariant())  latest.yml"
  ) | Set-Content -LiteralPath (Join-Path $releaseDir "SHA256SUMS.txt") -NoNewline:$false

  $manifest = [ordered]@{
    schema        = "smc.work.release.v1"
    version       = $version
    gitCommit     = $gitCommit
    platform      = "windows"
    arch          = "x64"
    updateChannel = "stable"
    updateUrl     = $env:SMC_WORK_UPDATE_URL
    installer     = $installerName
    sha256        = $hash
    signed        = [bool]$signed
    createdAt     = [DateTime]::UtcNow.ToString("o")
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $releaseDir "release-manifest.json")

  Invoke-Step "Validate release directory" { powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "validate-work-release.ps1") -ReleaseDir $releaseDir }
  if ($LASTEXITCODE -ne 0) { throw "validate-work-release.ps1 failed" }

  Write-Host "Release artifacts ready at $releaseDir"
} finally {
  Pop-Location
}
