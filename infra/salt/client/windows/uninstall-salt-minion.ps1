#Requires -Version 5.1
<#
.SYNOPSIS
  Stop and uninstall salt-minion. Does not delete Hermes home or Runtime files.
#>
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if ($DryRun) {
    @{
        ok     = $true
        dryRun = $true
        steps  = @("Stop-Service salt-minion", "msiexec /x {Salt-Minion} /quiet /norestart")
    } | ConvertTo-Json -Compress
    exit 0
}

Stop-Service -Name "salt-minion" -Force -ErrorAction SilentlyContinue
$product = Get-WmiObject Win32_Product -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "Salt Minion*" }
if ($product) {
    $product.Uninstall() | Out-Null
}

@{ ok = $true; uninstalled = [bool]$product } | ConvertTo-Json -Compress
exit 0
