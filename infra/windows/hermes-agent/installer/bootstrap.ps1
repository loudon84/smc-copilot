#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expectedHome = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0"
$logPath = Join-Path $PSScriptRoot "install.log"

function Write-SmcBootstrapLog {
    param([string]$Message)
    $line = "{0} {1}`r`n" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), $Message
    try {
        $utf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::AppendAllText($logPath, $line, $utf8)
    } catch {
    }
}

if (-not [string]::Equals($PSHOME, $expectedHome, [StringComparison]::OrdinalIgnoreCase)) {
    Write-SmcBootstrapLog "bootstrap must run under $expectedHome (got $PSHOME)"
    throw "bootstrap must run under $expectedHome (got $PSHOME)"
}

try {
    Import-Module (Join-Path $PSScriptRoot "InstallerCore.psm1") -Force -DisableNameChecking
    Write-SmcBootstrapLog ("start args=" + (@($args) -join " "))

    if (@($args) -contains "/uninstall") {
        $code = Invoke-SmcHermesLifecycle -ArgumentList @($args)
        Write-SmcBootstrapLog "uninstall exit=$code"
        exit $code
    }

    $payload = Join-Path $PSScriptRoot "payload"
    if (-not (Test-Path -LiteralPath $payload)) {
        throw "payload root missing: $payload"
    }
    $code = Invoke-SmcHermesLifecycle -ArgumentList (@("/payload-root", $payload) + $args)
    Write-SmcBootstrapLog "exit=$code"
    exit $code
} catch {
    $detail = [string]$_.Exception.Message
    if ($_.InvocationInfo) {
        $detail = $detail + " @ " + [string]$_.InvocationInfo.PositionMessage
    }
    Write-SmcBootstrapLog ("FAILED: " + $detail)
    throw
}
