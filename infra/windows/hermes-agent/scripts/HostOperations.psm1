#Requires -Version 5.1
Import-Module (Join-Path $PSScriptRoot 'SmcHermesManaged.psm1') -Force -DisableNameChecking
. (Join-Path $PSScriptRoot 'HostOperations.ps1')
Export-ModuleMember -Function Invoke-SmcHostOperation, Get-SmcHostLayout
