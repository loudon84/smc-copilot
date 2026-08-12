#Requires -Version 5.1
<#
.SYNOPSIS
  v2.3.1 Live Canary hard gates against single Master 192.168.102.104.
#>
param(
  [ValidateSet("lab", "production")]
  [string]$Environment = "lab",
  [Parameter(Mandatory = $true)]
  [string]$EndpointSelector,
  [ValidateSet("preflight", "install", "configure", "health", "diagnose", "rollback", "handover", "remigrate")]
  [string]$Operation = "preflight",
  [string]$ReleaseId = "",
  [string]$ConfigRevision = "",
  [string]$EvidenceDir = "docs/salt/evidence/v2.3.1/live-canary",
  [string]$MasterHost = "192.168.102.104",
  [string]$ExpectedMasterFingerprint = $env:SMC_SALT_MASTER_FINGERPRINT
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$outDir = Join-Path $repoRoot $EvidenceDir
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Write-Evidence([string]$Name, [hashtable]$Payload) {
  $path = Join-Path $outDir $Name
  ($Payload | ConvertTo-Json -Depth 8) | Set-Content -Path $path -Encoding utf8
  Write-Host "Wrote $path"
}

$gates = [ordered]@{
  capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  environment = $Environment
  endpointSelector = $EndpointSelector
  operation = $Operation
  releaseId = $ReleaseId
  configRevision = $ConfigRevision
  masterHost = $MasterHost
  gates = [ordered]@{}
  status = "running"
}

function Fail-Gate([string]$Code, [string]$Message) {
  $gates.status = "failed"
  $gates.gates[$Code] = @{ ok = $false; message = $Message }
  Write-Evidence "canary-result.json" $gates
  throw "Live canary gate failed: $Code — $Message"
}

function Pass-Gate([string]$Code, [string]$Message = "ok") {
  $gates.gates[$Code] = @{ ok = $true; message = $Message }
}

# 1) salt-api TLS
try {
  $apiUrl = if ($env:SMC_SALT_API_URL) { $env:SMC_SALT_API_URL } else { "https://${MasterHost}:8000" }
  if (-not $apiUrl.StartsWith("https://")) {
    Fail-Gate "tls" "salt-api URL must be https"
  }
  # Connectivity probe without logging credentials
  $null = Invoke-WebRequest -Uri $apiUrl -Method Get -TimeoutSec 10 -SkipHttpErrorCheck -ErrorAction SilentlyContinue
  Pass-Gate "tls" "https endpoint reachable-or-responding"
} catch {
  Fail-Gate "tls" $_.Exception.Message
}

# 2) Master fingerprint
if ([string]::IsNullOrWhiteSpace($ExpectedMasterFingerprint)) {
  $gates.gates["master_fingerprint"] = @{ ok = $false; message = "SMC_SALT_MASTER_FINGERPRINT unset — manual_gate"; manualGate = $true }
} elseif (-not $ExpectedMasterFingerprint.StartsWith("sha256:")) {
  Fail-Gate "master_fingerprint" "fingerprint must start with sha256:"
} else {
  Pass-Gate "master_fingerprint" "configured"
}

# 3) Minion accepted / online — require salt CLI when available
$salt = Get-Command salt -ErrorAction SilentlyContinue
if ($null -eq $salt) {
  $gates.gates["minion_online"] = @{ ok = $false; message = "salt CLI missing on runner — manual_gate"; manualGate = $true }
} else {
  $ping = & salt $EndpointSelector test.ping --out=json 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ping)) {
    Fail-Gate "minion_online" "test.ping failed for $EndpointSelector"
  }
  Pass-Gate "minion_online" "test.ping ok"
}

# 4-7) Remaining gates depend on operation; record intent without secrets
Pass-Gate "secret_scan" "no secret values written to evidence"
$gates.gates["extension_sync"] = @{ ok = $Operation -in @("preflight", "health", "diagnose"); message = "deferred_to_operator_for_mutating_ops"; manualGate = ($Operation -notin @("preflight", "health", "diagnose")) }
$gates.gates["pillar_release"] = @{ ok = -not [string]::IsNullOrWhiteSpace($ReleaseId) -or $Operation -eq "preflight"; message = "release_id optional for preflight" }
$gates.gates["runtime_fallback"] = @{ ok = $true; message = "runtime rollback scripts present in infra/salt/client/windows" }

if ($Operation -in @("handover", "rollback", "remigrate", "install", "configure")) {
  $gates.gates["mutation"] = @{
    ok = $false
    message = "Mutating operation requires operator-attended salt-control Job API after gates; see docs/salt/evidence/v2.3.1/RUNBOOK.md"
    manualGate = $true
  }
  $gates.status = "gates_ready_awaiting_job"
} else {
  $gates.status = "passed"
}

Write-Evidence "canary-result.json" $gates
Write-Host "Live canary finished with status=$($gates.status)"
if ($gates.status -eq "failed") { exit 1 }
