#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Revision = "2",
    [string]$Digest = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$common = Join-Path $here "scripts\common\SmcOpsi.psm1"
if (-not (Test-Path -LiteralPath $common)) {
    $common = Join-Path $here "..\scripts\common\SmcOpsi.psm1"
}
Import-Module $common -Force
Import-Module (Join-Path $here "SmcController.psm1") -Force
if ($Digest) {
    Install-SmcControllerBundle -Source $Source -Revision $Revision -Digest $Digest | Out-Null
}
else {
    Install-SmcControllerBundle -Source $Source -Revision $Revision | Out-Null
}
