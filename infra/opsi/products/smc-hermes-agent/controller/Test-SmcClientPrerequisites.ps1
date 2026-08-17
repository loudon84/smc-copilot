#Requires -Version 5.1
param(
    [string]$PythonRange = ">=3.12,<3.13",
    [string]$NodeRange = ">=22,<23"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$moduleRoot = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $moduleRoot "scripts\common\SmcOpsi.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "SmcController.psm1") -Force

function Write-PrerequisiteJson {
    param(
        [string]$PythonVersion,
        [string]$PythonArchitecture,
        [bool]$VenvAvailable,
        [string]$NodeVersion,
        [bool]$NpmAvailable
    )
    $payload = [ordered]@{
        platform     = "windows"
        architecture = "amd64"
        python       = [ordered]@{
            version      = $PythonVersion
            architecture = $PythonArchitecture
            venv         = $VenvAvailable
            status       = "PASS"
        }
        node         = [ordered]@{
            version = $NodeVersion
            npm     = $NpmAvailable
            status  = "PASS"
        }
    }
    ConvertTo-Json -InputObject $payload -Depth 6
}

try {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw "PREREQUISITE_FAILED: Python missing" }
    $pyVer = & python -c "import platform,sys; print(sys.version.split()[0]); print(platform.machine())" 2>$null
    $lines = @($pyVer)
    $actualPy = [string]$lines[0]
    $arch = [string]$lines[1]
    if ($arch -notmatch 'AMD64|x86_64|x64') { throw "PREREQUISITE_FAILED: Python architecture must be AMD64 actual=$arch" }
    if (-not (Test-SmcVersionRange -Actual $actualPy -Range $PythonRange)) {
        throw "PREREQUISITE_FAILED: Python $PythonRange actual=$actualPy"
    }
    $venvAvailable = $true
    & python -c "import venv" 2>$null
    if ($LASTEXITCODE -ne 0) { $venvAvailable = $false; throw "PREREQUISITE_FAILED: Python venv module missing" }
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw "PREREQUISITE_FAILED: Node missing" }
    $nodeVer = [string](& node -v 2>$null)
    if (-not (Test-SmcVersionRange -Actual $nodeVer -Range $NodeRange)) {
        throw "PREREQUISITE_FAILED: Node $NodeRange actual=$nodeVer"
    }
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) { throw "PREREQUISITE_FAILED: npm missing" }
    Write-PrerequisiteJson -PythonVersion $actualPy -PythonArchitecture $arch -VenvAvailable $venvAvailable -NodeVersion $nodeVer -NpmAvailable $true
    exit 0
}
catch {
    Write-Error $_
    exit 1
}
