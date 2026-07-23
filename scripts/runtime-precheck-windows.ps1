# Hermes Runtime precheck (Windows)
param(
    [string]$PythonPath = "",
    [string]$NodePath = "",
    [string]$GitPath = "",
    [string]$VenvDir = "",
    [string]$HermesInstallDir = "",
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
Write-Host "== runtime-precheck-windows =="

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

$ok = $true
$ok = (Test-Exe $PythonPath "python") -and $ok
$ok = (Test-Exe $NodePath "node") -and $ok
$ok = (Test-Exe $GitPath "git") -and $ok

try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", $Port)
    $tcp.Close()
    Write-Host "WARN port $Port is already in use"
} catch {
    Write-Host "OK port $Port is free"
}

if ($VenvDir) { Write-Host "VenvDir override: $VenvDir" }
if ($HermesInstallDir) { Write-Host "HermesInstallDir override: $HermesInstallDir" }

if (-not $ok) { exit 1 }
Write-Host "Precheck passed"
exit 0
