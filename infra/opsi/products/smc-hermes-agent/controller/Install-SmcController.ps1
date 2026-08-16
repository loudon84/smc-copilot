#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Revision = "1",
    [string]$Digest = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here "..\scripts\common\SmcOpsi.psm1") -Force
Import-Module (Join-Path $here "SmcController.psm1") -Force
if (-not $Digest) {
    $Digest = Get-SmcSha256Text -Text $Revision
}
Install-SmcControllerBundle -Source $Source -Revision $Revision -Digest $Digest | Out-Null
