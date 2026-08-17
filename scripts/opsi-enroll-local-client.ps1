#Requires -RunAsAdministrator
<#
.SYNOPSIS
  使用本机已下载的 opsi-client-agent 安装包，一键安装并注册到 OPSI 服务器。

.DESCRIPTION
  不下载安装包。用 -InstallerPath 指向本地 installer.exe 或其所在目录。
  安装后把 [config_service] url 固定为 ServiceAddress，避免服务器仍下发旧名
  （例如 opsi.smc.local）导致无法回连。

  凭据不要写进仓库，用环境变量或参数传入：
    OPSI_SERVICE_USERNAME / OPSI_SERVICE_PASSWORD

.PARAMETER InstallerPath
  本地 opsi-client-agent-installer.exe，或包含该 exe 的目录。

.EXAMPLE
  $env:OPSI_SERVICE_USERNAME = "adminuser"
  $env:OPSI_SERVICE_PASSWORD = "***"
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\opsi-enroll-local-client.ps1 `
    -InstallerPath "D:\Downloads\opsi-client-agent-installer.exe"

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\opsi-enroll-local-client.ps1 `
    -InstallerPath "D:\Downloads" `
    -ServiceAddress "https://opsi.superic.com:4447"
#>
param(
  [Parameter(Mandatory = $true)]
  [Alias("OpsiclientPath", "OpsiClientPath")]
  [string]$InstallerPath,

  [string]$ServiceAddress = $(
    if ($env:OPSI_SERVICE_ADDRESS) { $env:OPSI_SERVICE_ADDRESS }
    else { "https://opsi.superic.com:4447" }
  ),

  [string]$ClientId = $(if ($env:OPSI_CLIENT_ID) { $env:OPSI_CLIENT_ID } else { "" }),

  [string]$Username = $(if ($env:OPSI_SERVICE_USERNAME) { $env:OPSI_SERVICE_USERNAME } else { "" }),

  [string]$Password = $(if ($env:OPSI_SERVICE_PASSWORD) { $env:OPSI_SERVICE_PASSWORD } else { "" })
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "请用管理员 PowerShell 运行。"
  }
}

function Resolve-LocalInstaller {
  param([string]$Path)
  if (-not $Path) {
    throw "必须提供 -InstallerPath（本地 installer.exe 或其所在目录）。"
  }
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "找不到安装包路径: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.PSIsContainer) {
    $direct = Join-Path $item.FullName "opsi-client-agent-installer.exe"
    if (Test-Path -LiteralPath $direct) {
      return (Get-Item -LiteralPath $direct).FullName
    }
    $found = Get-ChildItem -LiteralPath $item.FullName -File -Filter "*opsi-client-agent-installer*.exe" |
      Select-Object -First 1
    if (-not $found) {
      throw "目录中没有 opsi-client-agent-installer.exe: $($item.FullName)"
    }
    return $found.FullName
  }
  if ($item.Extension -ne ".exe") {
    throw "InstallerPath 必须是 .exe: $($item.FullName)"
  }
  if ($item.Length -lt 1MB) {
    throw "安装包过小，可能不是完整 installer: $($item.FullName) ($($item.Length) bytes)"
  }
  return $item.FullName
}

function Get-DefaultClientId {
  param([string]$Address)
  $hn = $env:COMPUTERNAME.ToLowerInvariant()
  $hostName = ([Uri]$Address).Host
  $labels = $hostName.Split(".") | Where-Object { $_ }
  $domain = if ($labels.Count -ge 2) { ($labels | Select-Object -Skip 1) -join "." } else { "superic.com" }
  return "$hn.$domain"
}

function Set-ConfigServiceUrl {
  param(
    [string]$ConfPath,
    [string]$Url
  )
  $raw = Get-Content -LiteralPath $ConfPath -Raw
  $updated = [regex]::Replace(
    $raw,
    '(?m)(^\[config_service\][\s\S]*?^url\s*=\s*).+$',
    ('${1}' + $Url),
    1
  )
  if ($updated -eq $raw) {
    Write-Warning "未能改写 [config_service] url，请手工检查 $ConfPath"
    return $false
  }
  Set-Content -LiteralPath $ConfPath -Value $updated -Encoding ASCII -NoNewline
  return $true
}

Assert-Admin

if (-not $Username -or -not $Password) {
  throw "请设置 OPSI_SERVICE_USERNAME / OPSI_SERVICE_PASSWORD，或传入 -Username / -Password。"
}

$installer = Resolve-LocalInstaller -Path $InstallerPath
if (-not $ClientId) {
  $ClientId = Get-DefaultClientId -Address $ServiceAddress
}

$uri = [Uri]$ServiceAddress
if (-not $uri.Host -or -not $uri.Port) {
  throw "无效 ServiceAddress: $ServiceAddress"
}
Write-Host "探活 TCP $($uri.Host):$($uri.Port)"
$tnc = Test-NetConnection -ComputerName $uri.Host -Port $uri.Port -WarningAction SilentlyContinue
if (-not $tnc.TcpTestSucceeded) {
  throw "TCP $($uri.Host):$($uri.Port) 不可达。请先连 VPN / 确认服务器。"
}

Write-Host "安装包: $installer"
Write-Host "client_id=$ClientId"
Write-Host "service=$ServiceAddress"

$installerArgs = @(
  "--non-interactive",
  "--service-address", $ServiceAddress,
  "--service-username", $Username,
  "--service-password", $Password,
  "--client-id", $ClientId
)
$proc = Start-Process -FilePath $installer -ArgumentList $installerArgs -Wait -PassThru -NoNewWindow
if ($proc.ExitCode -ne 0) {
  throw "installer exit $($proc.ExitCode)"
}

Start-Sleep -Seconds 3
$svc = Get-Service -Name "opsiclientd" -ErrorAction SilentlyContinue
if (-not $svc) {
  throw "安装后未找到 opsiclientd 服务"
}

$confCandidates = @(
  "C:\Program Files (x86)\opsi.org\opsi-client-agent\opsiclientd\opsiclientd.conf",
  "C:\Program Files\opsi.org\opsi-client-agent\opsiclientd\opsiclientd.conf",
  "C:\ProgramData\opsi.org\opsi-client-agent\opsiclientd.conf"
)
$conf = $confCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $conf) {
  throw "找不到 opsiclientd.conf"
}

Write-Host "config: $conf"
if (Set-ConfigServiceUrl -ConfPath $conf -Url $ServiceAddress) {
  Write-Host "已固定 [config_service] url = $ServiceAddress"
}

Write-Host "重启 opsiclientd"
Restart-Service -Name "opsiclientd" -Force
Start-Sleep -Seconds 8
$svc = Get-Service -Name "opsiclientd"
if ($svc.Status -ne "Running") {
  throw "opsiclientd 未运行: $($svc.Status)"
}

Write-Host "opsiclientd Status=$($svc.Status) StartType=$($svc.StartType)"
Select-String -LiteralPath $conf -Pattern "^(host_id|url)\s*=" | ForEach-Object { $_.Line.Trim() }
Write-Host "OK: enrolled $ClientId -> $ServiceAddress"
Write-Host "请在 OPSI 管理界面确认该主机在线。此脚本不把 Live Evidence 标为 proven。"
