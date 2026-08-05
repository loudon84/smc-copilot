# Hermes Runtime precheck (Windows)
# 约定：源码与 venv 须在 D:\Programs 下；服务态仍用 %LOCALAPPDATA%\HermesRuntime（不检查）。
param(
    [string]$RepoRoot = "",
    [string]$PythonPath = "",
    [string]$NodePath = "",
    [string]$GitPath = "",
    [string]$VenvDir = "",
    [string]$HermesInstallDir = "D:\Programs\HermesAgent",
    [int]$Port = 8765,
    [switch]$AllowExistingRuntime
)

$ErrorActionPreference = "Stop"
$ProgramsRoot = "D:\Programs"
Write-Host "== runtime-precheck-windows =="
Write-Host "ProgramsRoot: $ProgramsRoot (程序/venv 必须在此目录下)"
Write-Host "Runtime service data: %LOCALAPPDATA%\HermesRuntime (服务态，保持不变)"

function Test-UnderPrograms([string]$Path, [string]$Label) {
    if (-not $Path) { return $true }
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetFullPath($ProgramsRoot)
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "OK $Label under Programs: $full"
        return $true
    }
    Write-Host "FAIL $Label 必须位于 $ProgramsRoot 下，当前: $full"
    return $false
}

function Test-Exe([string]$PathOrName, [string]$Label) {
    if ($PathOrName) {
        if (Test-Path $PathOrName) {
            Write-Host "OK $Label : $PathOrName"
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
    Write-Host "MISSING $Label (not on PATH)"
    return $false
}

function Test-PythonVersion([string]$PythonPath) {
    $exe = if ($PythonPath) { $PythonPath } else { "python" }
    try {
        $out = & $exe --version 2>&1 | Out-String
        if ($out -match "3\.12") {
            Write-Host ("OK Python version: " + $out.Trim())
            return $true
        }
        Write-Host "FAIL Python 3.12 required, got: $out"
        return $false
    } catch {
        Write-Host "FAIL cannot run Python: $_"
        return $false
    }
}

$ok = $true
$ok = (Test-Exe $PythonPath "python") -and $ok
$ok = (Test-PythonVersion $PythonPath) -and $ok
$ok = (Test-Exe $NodePath "node") -and $ok
$ok = (Test-Exe $GitPath "git") -and $ok

if ($RepoRoot) {
    $ok = (Test-UnderPrograms $RepoRoot "RepoRoot") -and $ok
}
$ok = (Test-UnderPrograms $VenvDir "VenvDir") -and $ok
$ok = (Test-UnderPrograms $HermesInstallDir "HermesInstallDir") -and $ok

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
    Write-Host "VenvDir: (empty → <HermesInstallDir>\<version>\venv)"
}
if ($HermesInstallDir) { Write-Host "HermesInstallDir: $HermesInstallDir" }
if ($PythonPath) { Write-Host "PythonPath: $PythonPath" }

if (-not $ok) { exit 1 }
Write-Host "Precheck passed"
exit 0
