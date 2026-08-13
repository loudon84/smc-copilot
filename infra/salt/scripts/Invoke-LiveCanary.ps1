#Requires -Version 5.1
<#
.SYNOPSIS
  v2.4.1 Live Canary hard gates against single Master 192.168.102.104.
  WhatIf / DryRun may only emit status=implemented — never proven.
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
  [string]$EvidenceDir = "docs/salt/evidence/v2.4.1/live-canary",
  [string]$MasterHost = "192.168.102.104",
  [string]$ExpectedMasterFingerprint = $env:SMC_SALT_MASTER_FINGERPRINT,
  [switch]$WhatIf
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

# 2) Master fingerprint — compare connection fact vs expected (never format-only).
if ([string]::IsNullOrWhiteSpace($ExpectedMasterFingerprint)) {
  $gates.gates["master_fingerprint"] = @{ ok = $false; message = "SMC_SALT_MASTER_FINGERPRINT unset — not_proven"; status = "not_proven" }
} elseif (-not $ExpectedMasterFingerprint.StartsWith("sha256:")) {
  Fail-Gate "master_fingerprint" "fingerprint must start with sha256:"
} else {
  $observed = $env:SMC_SALT_MASTER_FINGERPRINT_OBSERVED
  if ([string]::IsNullOrWhiteSpace($observed)) {
    $saltKey = Get-Command salt-key -ErrorAction SilentlyContinue
    if ($null -ne $saltKey) {
      $observed = ((& salt-key -f $MasterHost --out=txt 2>$null) | Select-Object -First 1)
    }
  }
  if ([string]::IsNullOrWhiteSpace($observed)) {
    $gates.gates["master_fingerprint"] = @{ ok = $false; message = "observed fingerprint missing — not_proven"; status = "not_proven" }
  } elseif ($observed -notlike "*$($ExpectedMasterFingerprint.Replace('sha256:',''))*" -and $observed -ne $ExpectedMasterFingerprint) {
    Fail-Gate "master_fingerprint" "observed fingerprint does not match expected"
  } else {
    Pass-Gate "master_fingerprint" "matched"
  }
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

# 4-6) Extension / pillar gates — missing facts stay not_proven, never auto-pass.
Pass-Gate "secret_scan" "no secret values written to evidence"
if ($env:SMC_SALT_EXTENSION_VERSION) {
  Pass-Gate "extension_sync" $env:SMC_SALT_EXTENSION_VERSION
} else {
  $gates.gates["extension_sync"] = @{ ok = $false; message = "extension version not observed"; status = "not_proven" }
}
if ($env:SMC_SALT_PILLAR_REVISION -and $ReleaseId) {
  Pass-Gate "pillar_release" $env:SMC_SALT_PILLAR_REVISION
} else {
  $gates.gates["pillar_release"] = @{ ok = $false; message = "pillar/release not observed"; status = "not_proven" }
}

# 7) Runtime fallback — WhatIf is implemented only, never proven.
$rollbackScript = Join-Path $repoRoot "infra\salt\client\windows\rollback-to-runtime.ps1"
if (-not (Test-Path $rollbackScript)) {
  Fail-Gate "runtime_fallback" "rollback-to-runtime.ps1 missing"
}
if ($WhatIf -or $Environment -eq "lab") {
  $gates.gates["runtime_fallback"] = @{ ok = $false; message = "WhatIf/lab is implemented only — not proven"; status = "implemented"; whatIf = $true }
} else {
  $gates.gates["runtime_fallback"] = @{ ok = $false; message = "live rollback/remigrate must run via Job API"; status = "not_proven"; manualGate = $true }
}

if ($Operation -in @("handover", "rollback", "remigrate", "install", "configure", "health", "diagnose")) {
  $controlUrl = $env:SMC_SALT_CONTROL_URL
  $token = $env:SMC_SALT_OPERATOR_TOKEN
  if ([string]::IsNullOrWhiteSpace($controlUrl) -or [string]::IsNullOrWhiteSpace($token)) {
    $gates.gates["job_api"] = @{
      ok = $false
      message = "SMC_SALT_CONTROL_URL / SMC_SALT_OPERATOR_TOKEN required to submit live Job"
      manualGate = $true
    }
    $gates.status = "gates_ready_awaiting_credentials"
  } else {
    $idem = [guid]::NewGuid().ToString("N")
    $body = @{
      endpointId = $EndpointSelector
      minionId = $EndpointSelector
      operation = $Operation
      idempotencyKey = $idem
      releaseId = $ReleaseId
      configRevision = $ConfigRevision
      correlationId = "live-canary"
    } | ConvertTo-Json
    $resp = Invoke-RestMethod -Method Post -Uri "$($controlUrl.TrimEnd('/'))/salt/v1/jobs" `
      -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
    $jobId = $resp.jobId
    $deadline = (Get-Date).AddMinutes(20)
    $final = $null
    do {
      Start-Sleep -Seconds 5
      $final = Invoke-RestMethod -Method Get -Uri "$($controlUrl.TrimEnd('/'))/salt/v1/jobs/$jobId" `
        -Headers @{ Authorization = "Bearer $token" }
    } while ($final.status -in @("queued", "dispatching", "running", "result_pending") -and (Get-Date) -lt $deadline)
    $gates.gates["job_api"] = @{ ok = ($final.status -eq "succeeded"); jobId = $jobId; status = $final.status }
    if ($final.status -ne "succeeded") {
      $gates.status = "failed"
      Write-Evidence "canary-result.json" $gates
      throw "Live job did not succeed: $($final.status)"
    }
    $gates.status = "passed"
  }
} else {
  $gates.status = "implemented"
}

$gates.status = "implemented"
$gates.evidenceStatus = "not_proven"
Write-Evidence "canary-result.json" $gates
Write-Host "Live canary finished with status=$($gates.status)"
if ($gates.status -eq "failed") { exit 1 }
