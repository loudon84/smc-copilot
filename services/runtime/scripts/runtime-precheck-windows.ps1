# Hermes Runtime precheck (Windows) — FR-13 install-path policy
# Defaults: user-level %LOCALAPPDATA%\Programs\SMC\{CopilotRuntime,HermesAgent}
# Service data stays at %LOCALAPPDATA%\HermesRuntime (not validated here).
# Node/Git are optional (warn-only); Python optional when using bundled runtime.
param(
    [string]$RepoRoot = "",
    [string]$PythonPath = "",
    [string]$NodePath = "",
    [string]$GitPath = "",
    [string]$VenvDir = "",
    [string]$HermesInstallDir = "",
    [int]$Port = 8765,
    [switch]$AllowExistingRuntime,
    [switch]$RequirePython,
    [switch]$BundledRuntime
)

$ErrorActionPreference = "Stop"

$LocalAppData = $env:LOCALAPPDATA
if (-not $LocalAppData) {
    $LocalAppData = Join-Path $env:USERPROFILE "AppData\Local"
}
$UserSmcRoot = Join-Path $LocalAppData "Programs\SMC"
$DefaultCopilotRuntime = Join-Path $UserSmcRoot "CopilotRuntime"
$DefaultHermesInstall = Join-Path $UserSmcRoot "HermesAgent"
$LegacyProgramsRoot = "D:\Programs"

if (-not $HermesInstallDir) {
    $HermesInstallDir = $DefaultHermesInstall
}

Write-Host "== runtime-precheck-windows =="
Write-Host "User SMC root: $UserSmcRoot"
Write-Host "Default CopilotRuntime: $DefaultCopilotRuntime"
Write-Host "Default HermesAgent: $DefaultHermesInstall"
Write-Host "Runtime service data: $LocalAppData\HermesRuntime (unchanged)"
Write-Host "Legacy detection: $LegacyProgramsRoot\copilot-serve, $LegacyProgramsRoot\HermesAgent (migration only)"

function Test-LegacyPaths {
    $legacyCopilot = Join-Path $LegacyProgramsRoot "copilot-serve"
    $legacyHermes = Join-Path $LegacyProgramsRoot "HermesAgent"
    if (Test-Path $legacyCopilot) {
        Write-Host "WARN legacy copilot-serve detected: $legacyCopilot (migrate manually; not auto-deleted)"
    }
    if (Test-Path $legacyHermes) {
        Write-Host "WARN legacy HermesAgent detected: $legacyHermes (migrate manually; not auto-deleted)"
    }
}

function Test-Exe([string]$PathOrName, [string]$Label, [switch]$Optional) {
    if ($PathOrName) {
        if (Test-Path $PathOrName) {
            Write-Host "OK $Label : $PathOrName"
            return $true
        }
        if ($Optional) {
            Write-Host "WARN optional $Label not found: $PathOrName"
            return $true
        }
        Write-Host "MISSING $Label : $PathOrName"
        return $false
    }
    $cmd = Get-Command $Label -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "OK $Label : $($cmd.Source)"
        return $true
    }
    if ($Optional) {
        Write-Host "WARN optional $Label not on PATH"
        return $true
    }
    Write-Host "MISSING $Label (not on PATH)"
    return $false
}

function Test-PythonVersion([string]$PythonPath, [switch]$Optional) {
    $exe = if ($PythonPath) { $PythonPath } else { "python" }
    try {
        $out = & $exe --version 2>&1 | Out-String
        if ($out -match "3\.12") {
            Write-Host ("OK Python version: " + $out.Trim())
            return $true
        }
        if ($Optional) {
            Write-Host "WARN Python 3.12 not found (bundled runtime may supply Python): $out"
            return $true
        }
        Write-Host "FAIL Python 3.12 required, got: $out"
        return $false
    } catch {
        if ($Optional) {
            Write-Host "WARN cannot run Python (bundled runtime may supply Python): $_"
            return $true
        }
        Write-Host "FAIL cannot run Python: $_"
        return $false
    }
}

Test-LegacyPaths

$ok = $true
$pythonOptional = (-not $RequirePython) -or $BundledRuntime
$ok = (Test-Exe $PythonPath "python" -Optional:$pythonOptional) -and $ok
$ok = (Test-PythonVersion $PythonPath -Optional:$pythonOptional) -and $ok
# Node/Git: optional tool runtime only (FR-13 / FR-14)
$null = Test-Exe $NodePath "node" -Optional
$null = Test-Exe $GitPath "git" -Optional

if ($RepoRoot) {
    Write-Host "RepoRoot: $RepoRoot (no D:\Programs requirement)"
}

$portBusy = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", $Port)
    $tcp.Close()
    $portBusy = $true
} catch {
    Write-Host "OK port $Port is free"
}

if ($portBusy) {
    $healthy = $false
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v1/health" -Method GET -TimeoutSec 3
        $healthy = $true
        Write-Host "Port $Port occupied by healthy Runtime"
    } catch {
        Write-Host "FAIL port $Port occupied and Runtime health check failed"
        $ok = $false
    }
    if ($healthy -and -not $AllowExistingRuntime) {
        Write-Host "FAIL port $Port in use by Runtime; pass -AllowExistingRuntime to continue"
        $ok = $false
    }
}

if ($VenvDir) {
    Write-Host "VenvDir: $VenvDir"
} else {
    Write-Host "VenvDir: (empty -> <HermesInstallDir>\<version>\venv)"
}
Write-Host "HermesInstallDir: $HermesInstallDir"
if ($PythonPath) { Write-Host "PythonPath: $PythonPath" }

if (-not $ok) { exit 1 }
Write-Host "Precheck passed"
exit 0
