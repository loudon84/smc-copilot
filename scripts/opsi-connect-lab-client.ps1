#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install opsi-client-agent on this Windows host and register against Lab OPSI.

.DESCRIPTION
  Downloads (or reuses) opsi-client-agent-installer.exe from the config server
  public share, then runs non-interactive enrollment.

  Required env (do not hardcode secrets in the repo):
    OPSI_SERVICE_USERNAME  - member of opsiadmin (first enroll) or client id
    OPSI_SERVICE_PASSWORD  - matching password / host key

  Optional:
    OPSI_SERVICE_ADDRESS   - default https://192.168.102.104:4447
    OPSI_CLIENT_ID         - default <hostname>.example (or set FQDN)

.EXAMPLE
  $env:OPSI_SERVICE_USERNAME = "adminuser"
  $env:OPSI_SERVICE_PASSWORD = "***"
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/opsi-connect-lab-client.ps1
#>
param(
  [string]$ServiceAddress = $(if ($env:OPSI_SERVICE_ADDRESS) { $env:OPSI_SERVICE_ADDRESS } else { "https://192.168.102.104:4447" }),
  [string]$ClientId = $(if ($env:OPSI_CLIENT_ID) { $env:OPSI_CLIENT_ID } else { "" }),
  [string]$InstallerDir = $(Join-Path (Split-Path $PSScriptRoot -Parent) "services\opsi-control\.lab")
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run elevated (Administrator)."
  }
}

Assert-Admin

$user = $env:OPSI_SERVICE_USERNAME
$pass = $env:OPSI_SERVICE_PASSWORD
if (-not $user -or -not $pass) {
  throw "Set OPSI_SERVICE_USERNAME and OPSI_SERVICE_PASSWORD before running."
}

if (-not $ClientId) {
  $hn = $env:COMPUTERNAME.ToLowerInvariant()
  $ClientId = "$hn.example"
}

New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null
$installer = Join-Path $InstallerDir "opsi-client-agent-installer.exe"
$publicUrl = "$ServiceAddress/public/opsi-client-agent/opsi-client-agent-installer.exe"

if (-not (Test-Path $installer) -or ((Get-Item $installer).Length -lt 1MB)) {
  Write-Host "Downloading $publicUrl"
  & curl.exe -k -L --connect-timeout 30 -o $installer $publicUrl
  if ($LASTEXITCODE -ne 0) { throw "download failed: $LASTEXITCODE" }
}

$tcpHost = ([Uri]$ServiceAddress).Host
$tcpPort = ([Uri]$ServiceAddress).Port
$tnc = Test-NetConnection -ComputerName $tcpHost -Port $tcpPort -WarningAction SilentlyContinue
if (-not $tnc.TcpTestSucceeded) {
  throw "TCP $($tcpHost):$($tcpPort) not reachable"
}

Write-Host "Installing client_id=$ClientId service=$ServiceAddress"
$args = @(
  "--non-interactive",
  "--service-address", $ServiceAddress,
  "--service-username", $user,
  "--service-password", $pass,
  "--client-id", $ClientId
)
$p = Start-Process -FilePath $installer -ArgumentList $args -Wait -PassThru -NoNewWindow
if ($p.ExitCode -ne 0) {
  throw "installer exit $($p.ExitCode)"
}

Start-Sleep -Seconds 3
$svc = Get-Service -Name "opsiclientd" -ErrorAction SilentlyContinue
if (-not $svc) {
  throw "opsiclientd service not found after install"
}
Write-Host "opsiclientd Status=$($svc.Status) StartType=$($svc.StartType)"

$confCandidates = @(
  "C:\Program Files (x86)\opsi.org\opsi-client-agent\opsiclientd\opsiclientd.conf",
  "C:\Program Files\opsi.org\opsi-client-agent\opsiclientd\opsiclientd.conf",
  "C:\ProgramData\opsi.org\opsi-client-agent\opsiclientd.conf"
)
$conf = $confCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($conf) {
  Write-Host "config: $conf"
  Select-String -Path $conf -Pattern "service_url|config_service|host_id|client_id" | ForEach-Object { $_.Line.Trim() }
} else {
  Write-Warning "opsiclientd.conf not found in known paths; check Program Files\opsi.org"
}

Write-Host "OK: enrolled $ClientId → $ServiceAddress"
