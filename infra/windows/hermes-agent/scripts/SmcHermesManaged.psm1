#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# PRD-OPSI-v2.1.6 FR-216-15 / FR-216-32
$script:SmcConfigFallbackPatterns = @(
    "Failed to parse",
    "Falling back to default config",
    "every user override",
    "IGNORED"
)
$script:SmcProtectedConfigKeys = @("model", "models", "providers", "provider", "auxiliary", "delegation", "API_SERVER_KEY", "api_server_key")

function Write-SmcConfigError {
    param(
        [Parameter(Mandatory = $true)][string]$ErrorCode,
        [Parameter(Mandatory = $true)][string]$Stage,
        [string]$ConfigPath = "",
        [string]$Detail = "",
        [string]$ParserSource = ""
    )
    $parts = @("errorCode=$ErrorCode", "stage=$Stage")
    if (-not [string]::IsNullOrWhiteSpace($ConfigPath)) { $parts += "configPath=$ConfigPath" }
    if (-not [string]::IsNullOrWhiteSpace($ParserSource)) { $parts += "parserSource=$ParserSource" }
    if (-not [string]::IsNullOrWhiteSpace($Detail)) {
        $safe = ([string]$Detail) -replace '(?i)(api[_-]?key|secret|password|bearer)\s*[:=]\s*\S+', '$1=***'
        if ($safe.Length -gt 240) { $safe = $safe.Substring(0, 240) }
        $parts += "detail=$safe"
    }
    return ($parts -join "; ")
}

function Get-SmcHermesManagedLayout {
    $directories = @(
        "profiles",
        "skills",
        "sessions",
        "memories",
        "logs",
        "workspace",
        "tmp",
        "state"
    )
    $testRoot = [Environment]::GetEnvironmentVariable("SMC_HERMES_MANAGED_TEST_ROOT", "Process")
    if (-not [string]::IsNullOrWhiteSpace($testRoot)) {
        $programRoot = Join-Path $testRoot "Program\Hermes"
        $hermesHome = Join-Path $testRoot "Data\Hermes"
        $workspaceRoot = Join-Path $hermesHome "workspace"
        $tempRoot = Join-Path $hermesHome "tmp"
        return [pscustomobject]@{
            ProgramRoot    = $programRoot
            HermesHome     = $hermesHome
            WorkspaceRoot  = $workspaceRoot
            TempRoot       = $tempRoot
            AgentRoot      = Join-Path $programRoot "node\hermes-agent"
            NodeRoot       = Join-Path $programRoot "node"
            BinPath        = Join-Path $programRoot "bin"
            ScriptsPath    = Join-Path $programRoot "scripts"
            CliPath        = Join-Path $programRoot "bin\hermes.exe"
            ConfigPath     = Join-Path $hermesHome "config.yaml"
            Directories    = $directories
            PreservedFiles = @("config.yaml", ".env", "auth.json")
        }
    }
    $programRoot = "D:\Programs\SMC\Hermes"
    $hermesHome = "C:\ProgramData\SMC\Hermes"
    $workspaceRoot = Join-Path $hermesHome "workspace"
    $tempRoot = Join-Path $hermesHome "tmp"
    return [pscustomobject]@{
        ProgramRoot    = $programRoot
        HermesHome     = $hermesHome
        WorkspaceRoot  = $workspaceRoot
        TempRoot       = $tempRoot
        AgentRoot      = Join-Path $programRoot "node\hermes-agent"
        NodeRoot       = Join-Path $programRoot "node"
        BinPath        = Join-Path $programRoot "bin"
        ScriptsPath    = Join-Path $programRoot "scripts"
        CliPath        = Join-Path $programRoot "bin\hermes.exe"
        ConfigPath     = Join-Path $hermesHome "config.yaml"
        Directories    = $directories
        PreservedFiles = @("config.yaml", ".env", "auth.json")
    }
}

function ConvertTo-SmcFullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "path required"
    }
    if ($Path.IndexOf([char]0) -ge 0) {
        throw "nul in path"
    }
    if ($Path -match '[*?]') {
        throw "wildcard path is forbidden"
    }
    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        throw "relative path is forbidden"
    }
    if ($Path.StartsWith("\\")) {
        throw "unc path is forbidden"
    }
    return [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
}

function Test-SmcForbiddenHomePath {
    param([Parameter(Mandatory = $true)][string]$FullPath)
    $normalized = $FullPath.ToLowerInvariant()
    if ($normalized -match '\\users\\') {
        return $true
    }
    if ($normalized -match '\\systemprofile(\\|$)') {
        return $true
    }
    return $false
}

function Assert-SmcHermesManagedPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet("Program", "Home")][string]$Kind
    )
    $layout = Get-SmcHermesManagedLayout
    $expected = if ($Kind -eq "Program") { $layout.ProgramRoot } else { $layout.HermesHome }
    $full = ConvertTo-SmcFullPath -Path $Path
    $want = ConvertTo-SmcFullPath -Path $expected
    if (Test-SmcForbiddenHomePath -FullPath $full) {
        throw "forbidden home path: user profile or systemprofile"
    }
    if (-not [string]::Equals($full, $want, [StringComparison]::OrdinalIgnoreCase)) {
        throw "path is not the managed $Kind root"
    }
}

function Assert-SmcHermesHomeChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$HermesHome = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($HermesHome)) {
        $HermesHome = $layout.HermesHome
    }
    $full = ConvertTo-SmcFullPath -Path $Path
    $home = ConvertTo-SmcFullPath -Path $HermesHome
    if (Test-SmcForbiddenHomePath -FullPath $full) {
        throw "forbidden home path: user profile or systemprofile"
    }
    $prefix = $home + "\"
    if (-not [string]::Equals($full, $home, [StringComparison]::OrdinalIgnoreCase) -and
        -not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "path is outside managed HermesHome"
    }
    if (Test-Path -LiteralPath $full) {
        $item = Get-Item -LiteralPath $full -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            $target = $null
            try {
                if ($item.PSIsContainer) {
                    $target = ConvertTo-SmcFullPath -Path $item.FullName
                } else {
                    $target = ConvertTo-SmcFullPath -Path $item.FullName
                }
            } catch {
                throw "reparse path cannot be resolved safely"
            }
            if (-not [string]::Equals($target, $home, [StringComparison]::OrdinalIgnoreCase) -and
                -not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw "reparse path escapes managed HermesHome"
            }
        }
    }
}

function Set-SmcHermesEnvironment {
    param(
        [Parameter(Mandatory = $true)][string]$ProgramRoot,
        [Parameter(Mandatory = $true)][string]$HermesHome
    )
    $layout = Get-SmcHermesManagedLayout
    $agentRoot = $layout.AgentRoot
    $nodeRoot = $layout.NodeRoot
    [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $HermesHome, "Machine")
    [System.Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $agentRoot, "Machine")
    [System.Environment]::SetEnvironmentVariable("HERMES_NODE_ROOT", $nodeRoot, "Machine")
    $env:HERMES_HOME = $HermesHome
    $env:HERMES_AGENT_ROOT = $agentRoot
    $env:HERMES_NODE_ROOT = $nodeRoot
}

function Remove-SmcHermesEnvironment {
    [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $null, "Machine")
    [System.Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $null, "Machine")
    [System.Environment]::SetEnvironmentVariable("HERMES_NODE_ROOT", $null, "Machine")
    Remove-Item Env:HERMES_HOME -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_AGENT_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_NODE_ROOT -ErrorAction SilentlyContinue
}

function Test-SmcAclHasModify {
    param($FileSystemRights)
    $r = [uint32]([int]$FileSystemRights)
    $modify = [uint32][int][System.Security.AccessControl.FileSystemRights]::Modify
    if (($r -band $modify) -eq $modify) { return $true }
    $writeData = [uint32][int][System.Security.AccessControl.FileSystemRights]::WriteData
    $delete = [uint32][int][System.Security.AccessControl.FileSystemRights]::Delete
    if ((($r -band $writeData) -eq $writeData) -and (($r -band $delete) -eq $delete)) { return $true }
    if (($r -band [uint32]0x40000000) -ne 0) { return $true }
    if (($r -band [uint32]0x10000000) -ne 0) { return $true }
    return $false
}

function Test-SmcAclHasFullControl {
    param($FileSystemRights)
    $r = [uint32]([int]$FileSystemRights)
    $fc = [uint32][int][System.Security.AccessControl.FileSystemRights]::FullControl
    if (($r -band $fc) -eq $fc) { return $true }
    if (($r -band [uint32]0x10000000) -ne 0) { return $true }
    return $false
}

function Set-SmcHermesProgramAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $system = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-18"
    $admins = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-32-544"
    $users  = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-32-545"
    $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $propagate = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $fc = [System.Security.AccessControl.FileSystemRights]::FullControl
    $rx = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($system, $fc, $inherit, $propagate, $allow)))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($admins, $fc, $inherit, $propagate, $allow)))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($users,  $rx, $inherit, $propagate, $allow)))
    try {
        $existing = Get-Acl -LiteralPath $Path
        $acl.SetOwner($existing.GetOwner([type][System.Security.Principal.NTAccount]))
    } catch {
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Set-SmcHermesHomeAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $system = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-18"
    $admins = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-32-544"
    $users  = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-32-545"
    $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $propagate = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $fc = [System.Security.AccessControl.FileSystemRights]::FullControl
    $mod = [System.Security.AccessControl.FileSystemRights]::Modify
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($system, $fc,  $inherit, $propagate, $allow)))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($admins, $fc,  $inherit, $propagate, $allow)))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($users,  $mod, $inherit, $propagate, $allow)))
    try {
        $existing = Get-Acl -LiteralPath $Path
        $acl.SetOwner($existing.GetOwner([type][System.Security.Principal.NTAccount]))
    } catch {
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}

# legacy alias kept for InstallerCore callers that pre-date v2.1
function Set-SmcHermesManagedAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    Set-SmcHermesHomeAcl -Path $Path
}

function Assert-SmcHermesProgramAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) {
        throw "PROGRAM_ACL: inheritance must be disabled"
    }
    $sidType = [type][System.Security.Principal.SecurityIdentifier]
    $rules = @($acl.GetAccessRules($true, $false, $sidType))

    $fcSids = @("S-1-5-18", "S-1-5-32-544")
    foreach ($sid in $fcSids) {
        $match = @($rules | Where-Object {
            [string]$_.IdentityReference.Value -eq $sid -and
            $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
            (Test-SmcAclHasFullControl -FileSystemRights $_.FileSystemRights)
        })
        if ($match.Count -eq 0) { throw "PROGRAM_ACL: $sid FullControl missing" }
    }

    $userRules = @($rules | Where-Object {
        [string]$_.IdentityReference.Value -eq "S-1-5-32-545" -and
        $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow
    })
    foreach ($r in $userRules) {
        if (Test-SmcAclHasFullControl -FileSystemRights $r.FileSystemRights) {
            throw "PROGRAM_ACL_TOO_PERMISSIVE: Users has FullControl"
        }
        if (Test-SmcAclHasModify -FileSystemRights $r.FileSystemRights) {
            throw "PROGRAM_ACL_TOO_PERMISSIVE: Users has Modify"
        }
    }
}

function Assert-SmcHermesHomeAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) {
        throw "HOME_ACL: inheritance must be disabled"
    }
    $sidType = [type][System.Security.Principal.SecurityIdentifier]
    $rules = @($acl.GetAccessRules($true, $false, $sidType))

    $fcSids = @("S-1-5-18", "S-1-5-32-544")
    foreach ($sid in $fcSids) {
        $match = @($rules | Where-Object {
            [string]$_.IdentityReference.Value -eq $sid -and
            $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
            (Test-SmcAclHasFullControl -FileSystemRights $_.FileSystemRights)
        })
        if ($match.Count -eq 0) { throw "HOME_ACL: $sid FullControl missing" }
    }

    $userModify = @($rules | Where-Object {
        [string]$_.IdentityReference.Value -eq "S-1-5-32-545" -and
        $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
        (Test-SmcAclHasModify -FileSystemRights $_.FileSystemRights) -and
        ($_.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ContainerInherit) -ne 0 -and
        ($_.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ObjectInherit) -ne 0
    })
    if ($userModify.Count -eq 0) { throw "HOME_ACL_USER_WRITE_MISSING: Users Modify (CI+OI) not found" }
}

# legacy alias
function Assert-SmcHermesManagedAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    Assert-SmcHermesHomeAcl -Path $Path
}

function Initialize-SmcHermesManagedHome {
    param(
        [string]$ProgramRoot,
        [string]$HermesHome
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) {
        $ProgramRoot = $layout.ProgramRoot
    }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) {
        $HermesHome = $layout.HermesHome
    }
    Assert-SmcHermesManagedPath -Path $ProgramRoot -Kind Program
    Assert-SmcHermesManagedPath -Path $HermesHome -Kind Home
    Assert-SmcHermesHomeChildPath -Path $layout.WorkspaceRoot -HermesHome $HermesHome
    Assert-SmcHermesHomeChildPath -Path $layout.TempRoot -HermesHome $HermesHome

    $prevHermesHome       = [System.Environment]::GetEnvironmentVariable("HERMES_HOME", "Machine")
    $prevHermesHomeProc   = $env:HERMES_HOME
    $prevAgentRoot        = [System.Environment]::GetEnvironmentVariable("HERMES_AGENT_ROOT", "Machine")
    $prevAgentRootProc    = $env:HERMES_AGENT_ROOT
    $prevNodeRoot         = [System.Environment]::GetEnvironmentVariable("HERMES_NODE_ROOT", "Machine")
    $prevNodeRootProc     = $env:HERMES_NODE_ROOT

    $envSet = $false
    try {
        if (-not [System.IO.Directory]::Exists($HermesHome)) {
            [void][System.IO.Directory]::CreateDirectory($HermesHome)
        }
        Set-SmcHermesHomeAcl -Path $HermesHome
        Assert-SmcHermesHomeAcl -Path $HermesHome

        foreach ($name in $layout.Directories) {
            $child = Join-Path $HermesHome $name
            if (-not [System.IO.Directory]::Exists($child)) {
                [void][System.IO.Directory]::CreateDirectory($child)
            }
            Assert-SmcHermesHomeChildPath -Path $child -HermesHome $HermesHome
        }

        Set-SmcHermesEnvironment -ProgramRoot $ProgramRoot -HermesHome $HermesHome
        $envSet = $true
    } catch {
        if ($envSet) {
            # best-effort rollback — Installer-owned Hermes variables only (PATH immutable)
            [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $prevHermesHome, "Machine")
            [System.Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $prevAgentRoot, "Machine")
            [System.Environment]::SetEnvironmentVariable("HERMES_NODE_ROOT", $prevNodeRoot, "Machine")
            $env:HERMES_HOME = $prevHermesHomeProc
            $env:HERMES_AGENT_ROOT = $prevAgentRootProc
            $env:HERMES_NODE_ROOT = $prevNodeRootProc
        }
        throw
    }
    return $layout
}

function ConvertTo-SmcYamlDoubleQuotedPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $escaped = $Path.Replace("\", "\\").Replace('"', '\"')
    return '"' + $escaped + '"'
}

function Get-SmcHermesConfigTerminalCwd {
    param([AllowEmptyString()][AllowNull()][string]$ConfigText = "")
    if ([string]::IsNullOrEmpty($ConfigText)) { return $null }
    $lines = $ConfigText -split "`r?`n", -1
    $inTerminal = $false
    foreach ($line in $lines) {
        if ($line -match '^(?![ \t])\S') {
            if ($line -match '^terminal\s*:') {
                $inTerminal = $true
                if ($line -match '^terminal\s*:\s*(.+)$') {
                    # inline mapping not used for cwd
                }
                continue
            }
            $inTerminal = $false
        }
        if (-not $inTerminal) { continue }
        if ($line -match '^[ \t]+cwd\s*:\s*(.+)$') {
            $raw = $Matches[1].Trim()
            if ($raw.StartsWith('"') -and $raw.EndsWith('"') -and $raw.Length -ge 2) {
                return $raw.Substring(1, $raw.Length - 2).Replace("\\", "\").Replace('\"', '"')
            }
            if ($raw.StartsWith("'") -and $raw.EndsWith("'") -and $raw.Length -ge 2) {
                return $raw.Substring(1, $raw.Length - 2)
            }
            return $raw
        }
    }
    return $null
}

function Merge-SmcHermesConfigTerminalCwd {
    param(
        [AllowEmptyString()][AllowNull()][string]$ConfigText = "",
        [Parameter(Mandatory = $true)][string]$WorkspaceRoot
    )
    if ($null -eq $ConfigText) { $ConfigText = "" }
    $quoted = ConvertTo-SmcYamlDoubleQuotedPath -Path $WorkspaceRoot
    $current = Get-SmcHermesConfigTerminalCwd -ConfigText $ConfigText
    if (-not [string]::IsNullOrWhiteSpace($current)) {
        $curFull = $null
        try { $curFull = ConvertTo-SmcFullPath -Path $current } catch { $curFull = $null }
        $wantFull = ConvertTo-SmcFullPath -Path $WorkspaceRoot
        if ($null -ne $curFull -and [string]::Equals($curFull, $wantFull, [StringComparison]::OrdinalIgnoreCase)) {
            return [pscustomobject]@{ Text = $ConfigText; Changed = $false }
        }
    }

    $lines = New-Object System.Collections.Generic.List[string]
    if (-not [string]::IsNullOrWhiteSpace($ConfigText)) {
        foreach ($line in ($ConfigText -split "`r?`n", -1)) {
            [void]$lines.Add($line)
        }
        # Drop a single trailing empty artifact from -split only when original had no trailing newline intent —
        # keep exact line list for rewrite.
    }

    $terminalIndex = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^terminal\s*:') {
            $terminalIndex = $i
            break
        }
    }

    if ($terminalIndex -lt 0) {
        if ($lines.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace($lines[$lines.Count - 1])) {
            [void]$lines.Add("")
        }
        [void]$lines.Add("terminal:")
        [void]$lines.Add("  cwd: $quoted")
        return [pscustomobject]@{ Text = ($lines -join "`n"); Changed = $true }
    }

    $cwdIndex = -1
    $sectionEnd = $lines.Count
    for ($i = $terminalIndex + 1; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        if ($line -match '^(?![ \t])\S') {
            $sectionEnd = $i
            break
        }
        if ($line -match '^[ \t]+cwd\s*:') {
            $cwdIndex = $i
            break
        }
    }

    if ($cwdIndex -ge 0) {
        $lines[$cwdIndex] = "  cwd: $quoted"
    } else {
        $lines.Insert($terminalIndex + 1, "  cwd: $quoted")
    }
    return [pscustomobject]@{ Text = ($lines -join "`n"); Changed = $true }
}

function Test-SmcHermesConfigFallbackOutput {
    param([string]$OutputText)
    if ([string]::IsNullOrWhiteSpace($OutputText)) { return $false }
    foreach ($pattern in $script:SmcConfigFallbackPatterns) {
        if ($OutputText -match [regex]::Escape($pattern)) { return $true }
        # Case-insensitive contains for IGNORED / Failed to parse variants.
        if ($OutputText.ToLowerInvariant().Contains($pattern.ToLowerInvariant())) { return $true }
    }
    return $false
}

function Resolve-SmcHermesManagedApplyPython {
    param([string]$ProgramRoot = "")
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) { $ProgramRoot = $layout.ProgramRoot }
    $override = [Environment]::GetEnvironmentVariable("SMC_HERMES_MANAGED_APPLY_PYTHON", "Process")
    if (-not [string]::IsNullOrWhiteSpace($override)) {
        return $override
    }
    $embedded = Join-Path $ProgramRoot "python\python.exe"
    if (Test-Path -LiteralPath $embedded) {
        return $embedded
    }
    # MOCK/unit harness may inject host python with PyYAML.
    return "python"
}

function Resolve-SmcHermesManagedApplyScript {
    param([string]$ProgramRoot = "")
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) { $ProgramRoot = $layout.ProgramRoot }
    $candidates = @(
        (Join-Path $layout.ScriptsPath "managed_config_apply.py"),
        (Join-Path $ProgramRoot "scripts\managed_config_apply.py"),
        (Join-Path $PSScriptRoot "managed_config_apply.py")
    )
    foreach ($path in $candidates) {
        if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path)) {
            return $path
        }
    }
    throw (Write-SmcConfigError -ErrorCode "CONFIG_MANAGED_MERGE_FAILED" -Stage "apply_tool" -Detail "managed_config_apply.py missing")
}

function Invoke-SmcHermesStandardYamlValidate {
    param(
        [Parameter(Mandatory = $true)][string]$ConfigPath,
        [string]$PythonExe = "",
        [string]$ProgramRoot = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) { $ProgramRoot = $layout.ProgramRoot }
    if ([string]::IsNullOrWhiteSpace($PythonExe)) {
        $PythonExe = Resolve-SmcHermesManagedApplyPython -ProgramRoot $ProgramRoot
    }
    $applyScript = Resolve-SmcHermesManagedApplyScript -ProgramRoot $ProgramRoot
    # Never use python -c with try/except: PowerShell 5.1 cannot join that into a valid -c script.
    $output = & $PythonExe $applyScript "--validate-only" "--config" $ConfigPath 2>&1
    $code = $LASTEXITCODE
    $text = ($output | ForEach-Object { [string]$_ }) -join " "
    if ($code -ne 0) {
        throw (Write-SmcConfigError -ErrorCode "CONFIG_YAML_PARSE_FAILED" -Stage "standard_yaml" -ConfigPath $ConfigPath -ParserSource "managed_config_apply.py" -Detail $text)
    }
}

function Invoke-SmcHermesConfigCheck {
    param(
        [Parameter(Mandatory = $true)][string]$ConfigPath,
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [string]$CliPath = "",
        [string]$ProgramRoot = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($CliPath)) {
        $CliPath = $layout.CliPath
    }
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) { $ProgramRoot = $layout.ProgramRoot }
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw (Write-SmcConfigError -ErrorCode "CONFIG_YAML_PARSE_FAILED" -Stage "config_exists" -ConfigPath $ConfigPath -Detail "config.yaml missing")
    }
    # Standard YAML validation always runs (FR-216-13); never gated by SKIP_GATEWAY.
    Invoke-SmcHermesStandardYamlValidate -ConfigPath $ConfigPath -ProgramRoot $ProgramRoot
    $text = Get-Content -LiteralPath $ConfigPath -Raw -ErrorAction Stop
    $cwd = Get-SmcHermesConfigTerminalCwd -ConfigText $text
    if ([string]::IsNullOrWhiteSpace($cwd)) {
        throw (Write-SmcConfigError -ErrorCode "CONFIG_NATIVE_CHECK_FAILED" -Stage "terminal_cwd" -ConfigPath $ConfigPath -Detail "terminal.cwd missing")
    }
    # Test-only native skip for PE stub harnesses — independent of SKIP_GATEWAY (FR-216-13).
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_NATIVE_CONFIG", "Process") -eq "1") {
        return
    }
    if (-not (Test-Path -LiteralPath $CliPath)) {
        throw (Write-SmcConfigError -ErrorCode "CONFIG_NATIVE_CHECK_FAILED" -Stage "native_cli" -ConfigPath $ConfigPath -Detail "hermes cli missing for config check")
    }
    $prevHome = $env:HERMES_HOME
    try {
        $env:HERMES_HOME = $HermesHome
        $output = & $CliPath config check 2>&1
        $joined = ($output | ForEach-Object { [string]$_ }) -join " "
        if ($LASTEXITCODE -ne 0) {
            throw (Write-SmcConfigError -ErrorCode "CONFIG_NATIVE_CHECK_FAILED" -Stage "hermes_config_check" -ConfigPath $ConfigPath -ParserSource "hermes" -Detail $joined)
        }
        if (Test-SmcHermesConfigFallbackOutput -OutputText $joined) {
            throw (Write-SmcConfigError -ErrorCode "CONFIG_FALLBACK_DETECTED" -Stage "hermes_config_check" -ConfigPath $ConfigPath -ParserSource "hermes" -Detail "fallback/ignored-config warning in config check output")
        }
    } finally {
        $env:HERMES_HOME = $prevHome
    }
}

function Set-SmcHermesManagedTerminalConfig {
    param(
        [string]$ConfigPath = "",
        [string]$WorkspaceRoot = "",
        [string]$HermesHome = "",
        [string]$CliPath = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath = $layout.ConfigPath }
    if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) { $WorkspaceRoot = $layout.WorkspaceRoot }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) { $HermesHome = $layout.HermesHome }
    if ([string]::IsNullOrWhiteSpace($CliPath)) { $CliPath = $layout.CliPath }

    Assert-SmcHermesHomeChildPath -Path $ConfigPath -HermesHome $HermesHome
    Assert-SmcHermesHomeChildPath -Path $WorkspaceRoot -HermesHome $HermesHome
    $WorkspaceRoot = ConvertTo-SmcFullPath -Path $WorkspaceRoot

    $original = ""
    $hadFile = Test-Path -LiteralPath $ConfigPath
    if ($hadFile) {
        $raw = Get-Content -LiteralPath $ConfigPath -Raw -ErrorAction Stop
        if ($null -ne $raw) { $original = [string]$raw }
    }
    $merged = Merge-SmcHermesConfigTerminalCwd -ConfigText $original -WorkspaceRoot $WorkspaceRoot
    # FR-216-11: Changed only decides write; validation always runs when file exists.
    if (-not $merged.Changed -and $hadFile) {
        Invoke-SmcHermesConfigCheck -ConfigPath $ConfigPath -HermesHome $HermesHome -CliPath $CliPath -ProgramRoot $layout.ProgramRoot
        return [pscustomobject]@{ Changed = $false; ConfigPath = $ConfigPath; WorkspaceRoot = $WorkspaceRoot }
    }

    $dir = Split-Path -Parent $ConfigPath
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $backup = "$ConfigPath.bak.smc"
    $tmp = "$ConfigPath.tmp.smc"
    if ($hadFile) {
        Copy-Item -LiteralPath $ConfigPath -Destination $backup -Force
    } elseif (Test-Path -LiteralPath $backup) {
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    }
    try {
        [System.IO.File]::WriteAllText($tmp, $merged.Text, [System.Text.UTF8Encoding]::new($false))
        # Offline structural check against candidate before replace.
        $null = Get-SmcHermesConfigTerminalCwd -ConfigText $merged.Text
        if ([string]::IsNullOrWhiteSpace((Get-SmcHermesConfigTerminalCwd -ConfigText $merged.Text))) {
            throw (Write-SmcConfigError -ErrorCode "CONFIG_MANAGED_MERGE_FAILED" -Stage "terminal_cwd" -ConfigPath $ConfigPath -Detail "terminal.cwd missing")
        }
        Move-Item -LiteralPath $tmp -Destination $ConfigPath -Force
        Invoke-SmcHermesConfigCheck -ConfigPath $ConfigPath -HermesHome $HermesHome -CliPath $CliPath -ProgramRoot $layout.ProgramRoot
        if (Test-Path -LiteralPath $backup) {
            Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
        }
    } catch {
        if (Test-Path -LiteralPath $tmp) {
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        }
        if ($hadFile -and (Test-Path -LiteralPath $backup)) {
            try {
                Move-Item -LiteralPath $backup -Destination $ConfigPath -Force
            } catch {
                throw (Write-SmcConfigError -ErrorCode "CONFIG_ROLLBACK_FAILED" -Stage "terminal_config_rollback" -ConfigPath $ConfigPath -Detail $_.Exception.Message)
            }
        } elseif (-not $hadFile -and (Test-Path -LiteralPath $ConfigPath)) {
            Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue
        }
        throw
    }
    return [pscustomobject]@{ Changed = $true; ConfigPath = $ConfigPath; WorkspaceRoot = $WorkspaceRoot }
}

function Assert-SmcHermesManagedTerminalConfig {
    param(
        [string]$ConfigPath = "",
        [string]$WorkspaceRoot = "",
        [string]$HermesHome = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $ConfigPath = $layout.ConfigPath }
    if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) { $WorkspaceRoot = $layout.WorkspaceRoot }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) { $HermesHome = $layout.HermesHome }
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "config missing: $ConfigPath"
    }
    $text = Get-Content -LiteralPath $ConfigPath -Raw -ErrorAction Stop
    $cwd = Get-SmcHermesConfigTerminalCwd -ConfigText $text
    if ([string]::IsNullOrWhiteSpace($cwd)) {
        throw "terminal.cwd missing"
    }
    $got = ConvertTo-SmcFullPath -Path $cwd
    $want = ConvertTo-SmcFullPath -Path $WorkspaceRoot
    if (-not [string]::Equals($got, $want, [StringComparison]::OrdinalIgnoreCase)) {
        throw "terminal.cwd drift: $got != $want"
    }
}

function Test-SmcPathIsLocked {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer) { return $false }
    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $stream.Close()
        return $false
    } catch {
        return $true
    }
}

function Clear-SmcHermesManagedTemp {
    param(
        [string]$TempRoot = "",
        [string]$HermesHome = "",
        [int]$MaxAgeHours = 24,
        [switch]$RemoveAllSafe
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($TempRoot)) { $TempRoot = $layout.TempRoot }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) { $HermesHome = $layout.HermesHome }

    $want = ConvertTo-SmcFullPath -Path $layout.TempRoot
    $target = ConvertTo-SmcFullPath -Path $TempRoot
    if (-not [string]::Equals($target, $want, [StringComparison]::OrdinalIgnoreCase)) {
        throw "temp cleanup refused: target is not Managed TempRoot"
    }
    Assert-SmcHermesHomeChildPath -Path $target -HermesHome $HermesHome
    if (-not (Test-Path -LiteralPath $target)) { return @{ ok = $true; removed = 0; warnings = @() } }

    $rootItem = Get-Item -LiteralPath $target -Force
    if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "temp cleanup refused: TempRoot is a reparse point"
    }

    $cutoff = (Get-Date).ToUniversalTime().AddHours(-1 * [Math]::Abs($MaxAgeHours))
    $removed = 0
    $warnings = New-Object System.Collections.Generic.List[string]
    $entries = @(Get-ChildItem -LiteralPath $target -Force -ErrorAction SilentlyContinue)
    foreach ($entry in $entries) {
        try {
            $full = ConvertTo-SmcFullPath -Path $entry.FullName
            Assert-SmcHermesHomeChildPath -Path $full -HermesHome $HermesHome
            $prefix = $want + "\"
            if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw "entry escapes TempRoot"
            }
            if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "reparse entry skipped"
            }
            if (-not $RemoveAllSafe) {
                $stamp = $entry.LastWriteTimeUtc
                if ($stamp -gt $cutoff) { continue }
            }
            if (-not $entry.PSIsContainer -and (Test-SmcPathIsLocked -Path $full)) {
                [void]$warnings.Add("locked: skipped")
                continue
            }
            Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Stop
            $removed++
        } catch {
            [void]$warnings.Add("cleanup warning: entry skipped")
        }
    }
    return @{ ok = $true; removed = $removed; warnings = @($warnings) }
}

function Get-SmcYamlIndent {
    param([string]$Raw)
    return ($Raw.Length - $Raw.TrimStart(" ", "`t").Length)
}

function Test-SmcYamlBlankOrComment {
    param([string]$Raw)
    return ([string]::IsNullOrWhiteSpace($Raw) -or $Raw.TrimStart().StartsWith("#"))
}

function Find-SmcYamlNextContent {
    param([string[]]$Lines, [int]$Start)
    $i = $Start
    while ($i -lt $Lines.Count) {
        if (-not (Test-SmcYamlBlankOrComment -Raw $Lines[$i])) { return $i }
        $i++
    }
    return -1
}

function ConvertFrom-SmcYamlSubset {
    param([AllowEmptyString()][AllowNull()][string]$Text = "")
    if ([string]::IsNullOrWhiteSpace($Text)) { return @{} }
    $lines = @($Text -split "`r?`n", -1)
    $index = 0
    $parsed = Read-SmcYamlBlock -Lines $lines -Index ([ref]$index) -Indent 0
    if ($null -eq $parsed) { return @{} }
    return $parsed
}

function Read-SmcYamlBlock {
    param(
        [string[]]$Lines,
        [ref]$Index,
        [int]$Indent
    )
    while ($Index.Value -lt $Lines.Count) {
        $raw = $Lines[$Index.Value]
        if (Test-SmcYamlBlankOrComment -Raw $raw) {
            $Index.Value++
            continue
        }
        $current = Get-SmcYamlIndent -Raw $raw
        if ($current -lt $Indent) { return $null }
        $stripped = $raw.Trim()
        if ($stripped -eq "-" -or $stripped.StartsWith("- ")) {
            return (Read-SmcYamlList -Lines $Lines -Index $Index -Indent $current)
        }
        if ($stripped.Contains(":")) {
            return (Read-SmcYamlMap -Lines $Lines -Index $Index -Indent $current)
        }
        $Index.Value++
        return (ConvertFrom-SmcYamlScalar $stripped)
    }
    return $null
}

function Read-SmcYamlChild {
    param([string[]]$Lines, [ref]$Index, [int]$KeyIndent)
    $next = Find-SmcYamlNextContent -Lines $Lines -Start $Index.Value
    if ($next -lt 0) { return @{} }
    $raw = $Lines[$next]
    $current = Get-SmcYamlIndent -Raw $raw
    $stripped = $raw.Trim()
    $isList = ($stripped -eq "-" -or $stripped.StartsWith("- "))
    # PyYAML compact sequences sit at the same indent as the parent key:
    #   args:
    #   - foo
    if ($isList -and $current -ge $KeyIndent) {
        $Index.Value = $next
        return (Read-SmcYamlList -Lines $Lines -Index $Index -Indent $current)
    }
    if ($current -le $KeyIndent) { return @{} }
    $Index.Value = $next
    $child = Read-SmcYamlBlock -Lines $Lines -Index $Index -Indent $current
    if ($null -eq $child) { return @{} }
    return $child
}

function Read-SmcYamlBlockScalar {
    param([string[]]$Lines, [ref]$Index, [int]$KeyIndent)
    $parts = New-Object System.Collections.Generic.List[string]
    while ($Index.Value -lt $Lines.Count) {
        $raw = $Lines[$Index.Value]
        if ([string]::IsNullOrWhiteSpace($raw)) {
            $next = Find-SmcYamlNextContent -Lines $Lines -Start ($Index.Value + 1)
            if ($next -lt 0) { break }
            if ((Get-SmcYamlIndent -Raw $Lines[$next]) -le $KeyIndent) { break }
            [void]$parts.Add("")
            $Index.Value++
            continue
        }
        $current = Get-SmcYamlIndent -Raw $raw
        if ($current -le $KeyIndent) { break }
        [void]$parts.Add($raw.Substring($current))
        $Index.Value++
    }
    return (($parts.ToArray()) -join "`n")
}

function Read-SmcYamlMap {
    param([string[]]$Lines, [ref]$Index, [int]$Indent)
    $result = @{}
    $lastKey = $null
    while ($Index.Value -lt $Lines.Count) {
        $raw = $Lines[$Index.Value]
        if (Test-SmcYamlBlankOrComment -Raw $raw) {
            $Index.Value++
            continue
        }
        $current = Get-SmcYamlIndent -Raw $raw
        if ($current -lt $Indent) { break }
        $stripped = $raw.Trim()
        if ($stripped -eq "-" -or $stripped.StartsWith("- ")) { break }
        if ($current -gt $Indent) {
            # Nested/continuation content that the previous key did not consume
            # (block scalars, 4-space children, compact-list leftovers).
            if ([string]::IsNullOrEmpty($lastKey)) { throw "unexpected yaml indent" }
            $child = Read-SmcYamlBlock -Lines $Lines -Index $Index -Indent $current
            $prev = $result[$lastKey]
            if ($null -eq $prev -or (($prev -is [string]) -and ($prev -in @("", "|", ">", "{", "[")))) {
                $result[$lastKey] = $(if ($null -eq $child) { @{} } else { $child })
            } elseif ($child -is [hashtable] -or $child -is [System.Collections.IDictionary]) {
                if ($prev -is [hashtable] -or $prev -is [System.Collections.IDictionary]) {
                    foreach ($k in @($child.Keys)) { $prev[$k] = $child[$k] }
                }
            }
            continue
        }
        if (-not $stripped.Contains(":")) { throw "expected yaml mapping" }
        $colon = $stripped.IndexOf(":")
        $key = $stripped.Substring(0, $colon).Trim()
        $rest = ""
        if ($colon + 1 -lt $stripped.Length) {
            $rest = $stripped.Substring($colon + 1).Trim()
        }
        $Index.Value++
        $lastKey = $key
        if ($rest -eq "{}") {
            $result[$key] = @{}
        } elseif ($rest -eq "[]") {
            $result[$key] = @()
        } elseif ($rest -match '^[>|][+-]?\d*$') {
            $result[$key] = Read-SmcYamlBlockScalar -Lines $Lines -Index $Index -Indent $Indent
        } elseif ($rest) {
            $result[$key] = ConvertFrom-SmcYamlScalar $rest
        } else {
            $result[$key] = Read-SmcYamlChild -Lines $Lines -Index $Index -KeyIndent $Indent
        }
    }
    return $result
}

function Read-SmcYamlList {
    param([string[]]$Lines, [ref]$Index, [int]$Indent)
    $result = New-Object System.Collections.ArrayList
    while ($Index.Value -lt $Lines.Count) {
        $raw = $Lines[$Index.Value]
        if (Test-SmcYamlBlankOrComment -Raw $raw) {
            $Index.Value++
            continue
        }
        $current = Get-SmcYamlIndent -Raw $raw
        if ($current -lt $Indent) { break }
        $stripped = $raw.Trim()
        $isListItem = ($stripped -eq "-" -or $stripped.StartsWith("- "))
        if (-not $isListItem) { break }
        $item = ""
        if ($stripped.StartsWith("- ") -and $stripped.Length -gt 2) {
            $item = $stripped.Substring(2).Trim()
        }
        $Index.Value++
        if (-not $item) {
            $child = Read-SmcYamlChild -Lines $Lines -Index $Index -KeyIndent $Indent
            [void]$result.Add($child)
        } elseif (-not ($item.StartsWith('"') -or $item.StartsWith("'")) -and $item.Contains(":")) {
            $colon = $item.IndexOf(":")
            $nested = @{}
            $ik = $item.Substring(0, $colon).Trim()
            $ir = ""
            if ($colon + 1 -lt $item.Length) { $ir = $item.Substring($colon + 1).Trim() }
            if ($ir) { $nested[$ik] = ConvertFrom-SmcYamlScalar $ir } else { $nested[$ik] = Read-SmcYamlChild -Lines $Lines -Index $Index -KeyIndent $Indent }
            $extra = Read-SmcYamlMap -Lines $Lines -Index $Index -Indent ($Indent + 2)
            foreach ($k in @($extra.Keys)) { $nested[$k] = $extra[$k] }
            [void]$result.Add($nested)
        } else {
            [void]$result.Add((ConvertFrom-SmcYamlScalar $item))
        }
    }
    return ,@($result.ToArray())
}

function ConvertFrom-SmcYamlScalar {
    param([string]$Text)
    if ($Text -eq "{}" ) { return @{} }
    if ($Text -eq "[]") { return @() }
    if ($Text -eq "true") { return $true }
    if ($Text -eq "false") { return $false }
    if ($Text -eq "null" -or $Text -eq "~") { return $null }
    if ($Text.Length -ge 2 -and (($Text.StartsWith('"') -and $Text.EndsWith('"')) -or ($Text.StartsWith("'") -and $Text.EndsWith("'")))) {
        $inner = $Text.Substring(1, $Text.Length - 2)
        if ($Text.StartsWith('"')) {
            return $inner.Replace('\"', '"').Replace("\\", "\")
        }
        return $inner
    }
    $intVal = 0
    if ([int]::TryParse($Text, [ref]$intVal)) { return $intVal }
    return $Text
}

function ConvertTo-SmcYamlScalar {
    param($Value)
    if ($null -eq $Value) { return "null" }
    if ($Value -is [bool]) { if ($Value) { return "true" } else { return "false" } }
    if ($Value -is [int] -or $Value -is [long]) { return [string]$Value }
    $text = [string]$Value
    # FR-216-02: plain-scalar forbidden prefixes and reserved literals (shared corpus with Python).
    $needsQuotes = $false
    if ([string]::IsNullOrEmpty($text)) { $needsQuotes = $true }
    elseif ($text -in @("true", "false", "null", "~", "yes", "no", "on", "off", "True", "False", "NULL")) { $needsQuotes = $true }
    elseif ($text -match '^\s|\s$') { $needsQuotes = $true }
    elseif ($text -match '^[0-9]+(\.[0-9]+)?$') { $needsQuotes = $true }
    elseif ($text -match '^[\?\-:,\[\]\{\}#&\*!\|>''\"%@`]') { $needsQuotes = $true }
    elseif ($text -match '[:#@{}\[\],\"''\\`%&*!]') { $needsQuotes = $true }
    elseif ($text -match '\\' -or $text -match '\$\{') { $needsQuotes = $true }
    if ($needsQuotes) {
        $escaped = $text.Replace("\", "\\").Replace('"', '\"')
        return '"' + $escaped + '"'
    }
    return $text
}

function ConvertTo-SmcYamlSubset {
    param($Data, [int]$Indent = 0)
    $lines = New-Object System.Collections.Generic.List[string]
    Write-SmcYamlValue -Value $Data -Lines $lines -Indent $Indent
    return (($lines.ToArray()) -join "`n") + "`n"
}

function Write-SmcYamlValue {
    param($Value, $Lines, [int]$Indent)
    $prefix = " " * $Indent
    if ($Value -is [hashtable] -or ($Value -is [System.Collections.IDictionary])) {
        $keys = @($Value.Keys | ForEach-Object { [string]$_ } | Sort-Object)
        if ($keys.Count -eq 0) {
            [void]$Lines.Add("${prefix}{}")
            return
        }
        foreach ($key in $keys) {
            $child = $Value[$key]
            if (($child -is [hashtable] -or $child -is [System.Collections.IDictionary]) -and @($child.Keys).Count -eq 0) {
                [void]$Lines.Add("${prefix}${key}: {}")
            } elseif ($child -is [System.Collections.IList] -and -not ($child -is [string]) -and @($child).Count -eq 0) {
                [void]$Lines.Add("${prefix}${key}: []")
            } elseif (($child -is [hashtable] -or $child -is [System.Collections.IDictionary]) -or ($child -is [System.Collections.IList] -and -not ($child -is [string]))) {
                [void]$Lines.Add("${prefix}${key}:")
                Write-SmcYamlValue -Value $child -Lines $Lines -Indent ($Indent + 2)
            } else {
                [void]$Lines.Add("${prefix}${key}: $(ConvertTo-SmcYamlScalar $child)")
            }
        }
        return
    }
    if ($Value -is [System.Collections.IList] -and -not ($Value -is [string])) {
        $items = @($Value)
        if ($items.Count -eq 0) {
            [void]$Lines.Add("${prefix}[]")
            return
        }
        foreach ($item in $items) {
            if (($item -is [hashtable] -or $item -is [System.Collections.IDictionary]) -or ($item -is [System.Collections.IList] -and -not ($item -is [string]))) {
                [void]$Lines.Add("${prefix}-")
                Write-SmcYamlValue -Value $item -Lines $Lines -Indent ($Indent + 2)
            } else {
                [void]$Lines.Add("${prefix}- $(ConvertTo-SmcYamlScalar $item)")
            }
        }
        return
    }
    [void]$Lines.Add("${prefix}$(ConvertTo-SmcYamlScalar $Value)")
}

function Merge-SmcHashtableDeep {
    param(
        $Base,
        $Overlay,
        [ValidateSet("PreferBase", "PreferOverlay")][string]$Conflict = "PreferBase"
    )
    if ($null -eq $Base) { $Base = @{} }
    if ($null -eq $Overlay) { return $Base }
    if (-not ($Base -is [hashtable] -or $Base -is [System.Collections.IDictionary])) { return $Base }
    if (-not ($Overlay -is [hashtable] -or $Overlay -is [System.Collections.IDictionary])) {
        if ($Conflict -eq "PreferOverlay") { return $Overlay }
        return $Base
    }
    $result = @{}
    foreach ($key in @($Base.Keys)) { $result[$key] = $Base[$key] }
    foreach ($key in @($Overlay.Keys)) {
        if (-not $result.ContainsKey($key)) {
            $result[$key] = $Overlay[$key]
            continue
        }
        $left = $result[$key]
        $right = $Overlay[$key]
        if (($left -is [hashtable] -or $left -is [System.Collections.IDictionary]) -and ($right -is [hashtable] -or $right -is [System.Collections.IDictionary])) {
            $result[$key] = Merge-SmcHashtableDeep -Base $left -Overlay $right -Conflict $Conflict
        } elseif ($Conflict -eq "PreferOverlay") {
            $result[$key] = $right
        }
    }
    return $result
}

function Merge-SmcHermesManagedConfig {
    param(
        [string]$ProgramRoot = "",
        [string]$HermesHome = "",
        [string]$CliPath = "",
        [string]$ManagedDefaultsPath = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) { $ProgramRoot = $layout.ProgramRoot }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) { $HermesHome = $layout.HermesHome }
    if ([string]::IsNullOrWhiteSpace($CliPath)) { $CliPath = $layout.CliPath }
    if ([string]::IsNullOrWhiteSpace($ManagedDefaultsPath)) {
        $ManagedDefaultsPath = Join-Path $ProgramRoot "config\managed.defaults.yaml"
    }
    Assert-SmcHermesManagedPath -Path $ProgramRoot -Kind Program
    Assert-SmcHermesManagedPath -Path $HermesHome -Kind Home
    Assert-SmcHermesHomeChildPath -Path $layout.ConfigPath -HermesHome $HermesHome

    if (-not (Test-Path -LiteralPath $ManagedDefaultsPath)) {
        throw (Write-SmcConfigError -ErrorCode "CONFIG_MANAGED_MERGE_FAILED" -Stage "read_managed_defaults" -ConfigPath $ManagedDefaultsPath -Detail "managed.defaults.yaml missing")
    }

    $applyScript = Resolve-SmcHermesManagedApplyScript -ProgramRoot $ProgramRoot
    $pythonExe = Resolve-SmcHermesManagedApplyPython -ProgramRoot $ProgramRoot

    $configPath = $layout.ConfigPath
    $dir = Split-Path -Parent $configPath
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }

    $hadFile = Test-Path -LiteralPath $configPath
    $backup = "$configPath.bak.smc"
    if ($hadFile) {
        Copy-Item -LiteralPath $configPath -Destination $backup -Force
    }

    $argsList = @(
        $applyScript,
        "--config", $configPath,
        "--managed-defaults", $ManagedDefaultsPath,
        "--workspace-root", $layout.WorkspaceRoot
    )
    try {
        $output = & $pythonExe @argsList 2>&1
        $code = $LASTEXITCODE
        $joined = ($output | ForEach-Object { [string]$_ }) -join "`n"
        if ($code -ne 0) {
            $errorCode = "CONFIG_MANAGED_MERGE_FAILED"
            if ($code -eq 10) { $errorCode = "CONFIG_YAML_PARSE_FAILED" }
            elseif ($code -eq 12) { $errorCode = "CONFIG_ROLLBACK_FAILED" }
            throw (Write-SmcConfigError -ErrorCode $errorCode -Stage "managed_config_apply" -ConfigPath $configPath -ParserSource "managed_config_apply.py" -Detail $joined)
        }
        $resultObj = $null
        try { $resultObj = $joined | ConvertFrom-Json -ErrorAction Stop } catch { $resultObj = $null }

        # Native config oracle after promote (or when unchanged still validate).
        try {
            Invoke-SmcHermesConfigCheck -ConfigPath $configPath -HermesHome $HermesHome -CliPath $CliPath -ProgramRoot $ProgramRoot
        } catch {
            if ($hadFile -and (Test-Path -LiteralPath $backup)) {
                try {
                    Move-Item -LiteralPath $backup -Destination $configPath -Force
                } catch {
                    throw (Write-SmcConfigError -ErrorCode "CONFIG_ROLLBACK_FAILED" -Stage "native_check_rollback" -ConfigPath $configPath -Detail $_.Exception.Message)
                }
            }
            throw
        }
        if (Test-Path -LiteralPath $backup) {
            Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
        }

        $changed = $true
        if ($null -ne $resultObj -and ($resultObj.PSObject.Properties.Name -contains "changed")) {
            $changed = [bool]$resultObj.changed
        }
        $profile = ""
        $profileVersion = 0
        $profileDigest = ""
        if ($null -ne $resultObj) {
            if ($resultObj.PSObject.Properties.Name -contains "profile") { $profile = [string]$resultObj.profile }
            if ($resultObj.PSObject.Properties.Name -contains "profileVersion") { $profileVersion = [int]$resultObj.profileVersion }
            if ($resultObj.PSObject.Properties.Name -contains "profileDigest") { $profileDigest = [string]$resultObj.profileDigest }
        }
        return [pscustomobject]@{
            Changed = $changed
            ConfigPath = $configPath
            Profile = $profile
            ProfileVersion = $profileVersion
            ProfileDigest = $profileDigest
        }
    } catch {
        if ($hadFile -and (Test-Path -LiteralPath $backup) -and (Test-Path -LiteralPath $configPath)) {
            # Leave backup for evidence on unexpected failures already restored above when needed.
        }
        throw
    }
}

function Get-SmcHermesCapabilityDoctorChecks {
    param(
        [string]$ProgramRoot = "",
        [string]$HermesHome = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) { $ProgramRoot = $layout.ProgramRoot }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) { $HermesHome = $layout.HermesHome }
    $checks = New-Object System.Collections.Generic.List[object]

    $buildPath = Join-Path $ProgramRoot "runtime\runtime-build.json"
    $managedPath = Join-Path $ProgramRoot "config\managed.defaults.yaml"
    $caps = $null
    $profileName = ""
    $profileVersion = ""
    $profileDigest = ""
    if (Test-Path -LiteralPath $buildPath) {
        try {
            $build = Get-Content -LiteralPath $buildPath -Raw | ConvertFrom-Json
            $caps = $build.capabilities
            $profileName = [string]$build.runtimeProfile
            $profileVersion = [string]$build.runtimeProfileVersion
            $profileDigest = [string]$build.runtimeProfileDigest
        } catch {
            $caps = $null
        }
    }
    $meta = "profile=$profileName version=$profileVersion digest=$profileDigest"
    if ($null -eq $caps) {
        [void]$checks.Add([pscustomobject]@{ name = "Hermes Runtime Capabilities"; status = "FAIL"; detail = "runtime-build capabilities missing" })
        return @($checks.ToArray())
    }

    $capPairs = @(
        @{ name = "API Server / aiohttp"; enabled = $caps.apiServer },
        @{ name = "MCP"; enabled = $caps.mcp },
        @{ name = "Filesystem MCP"; enabled = $caps.filesystemMcp },
        @{ name = "Web backend"; enabled = $caps.web },
        @{ name = "Local STT"; enabled = $caps.localStt },
        @{ name = "Edge TTS"; enabled = $caps.edgeTts },
        @{ name = "Hindsight"; enabled = $caps.hindsight }
    )
    foreach ($pair in $capPairs) {
        if ($pair.enabled -eq $true) {
            [void]$checks.Add([pscustomobject]@{ name = $pair.name; status = "PASS"; detail = "declared; $meta" })
        } elseif ($pair.enabled -eq $false) {
            [void]$checks.Add([pscustomobject]@{ name = $pair.name; status = "DISABLED"; detail = $meta })
        } else {
            [void]$checks.Add([pscustomobject]@{ name = $pair.name; status = "FAIL"; detail = "capability missing; $meta" })
        }
    }
    if ($caps.tirith -eq $true) {
        [void]$checks.Add([pscustomobject]@{ name = "Tirith policy"; status = "FAIL"; detail = "tirith enabled without packaged binary; $meta" })
    } else {
        [void]$checks.Add([pscustomobject]@{ name = "Tirith policy"; status = "DISABLED"; detail = $meta })
    }
    if ($caps.lspAutoInstall -eq $true) {
        [void]$checks.Add([pscustomobject]@{ name = "LSP auto install policy"; status = "FAIL"; detail = "lspAutoInstall enabled; $meta" })
    } else {
        [void]$checks.Add([pscustomobject]@{ name = "LSP auto install policy"; status = "DISABLED"; detail = $meta })
    }

    $managedOk = $false
    $managedDetail = "missing"
    if (Test-Path -LiteralPath $managedPath) {
        $text = Get-Content -LiteralPath $managedPath -Raw
        if ($text -match "smc.opsi.managed-config.v2" -and $text -match "allow_lazy_installs:\s*false") {
            $managedOk = $true
            $managedDetail = "offline/lazy install policy enforced"
        } else {
            $managedDetail = "managed defaults invalid"
        }
    }
    [void]$checks.Add([pscustomobject]@{ name = "Offline/lazy install policy"; status = $(if ($managedOk) { "PASS" } else { "FAIL" }); detail = "$managedDetail; $meta" })

    $wsOk = Test-Path -LiteralPath $layout.WorkspaceRoot
    [void]$checks.Add([pscustomobject]@{ name = "Workspace"; status = $(if ($wsOk) { "PASS" } else { "FAIL" }); detail = $layout.WorkspaceRoot })

    $gwStatus = "FAIL"
    $gwDetail = "not probed"
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        $gwStatus = "PASS"
        $gwDetail = "skipped"
    } elseif (Get-Command Test-SmcHermesGatewayReady -ErrorAction SilentlyContinue) {
        if (Test-SmcHermesGatewayReady -HermesHome $HermesHome -Attempts 1 -DelayMs 0) {
            $gwStatus = "PASS"
            $gwDetail = "health+auth ok"
        } else {
            $gwDetail = "health/auth failed"
        }
    } else {
        $gwDetail = "probe unavailable"
    }
    [void]$checks.Add([pscustomobject]@{ name = "Gateway Health/Auth"; status = $gwStatus; detail = "$gwDetail; $meta" })

    return @($checks.ToArray())
}

function Get-SmcHermesManagedDoctorReport {
    param(
        [string]$ProgramRoot = "",
        [string]$HermesHome = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($ProgramRoot)) { $ProgramRoot = $layout.ProgramRoot }
    if ([string]::IsNullOrWhiteSpace($HermesHome)) { $HermesHome = $layout.HermesHome }

    $checks = New-Object System.Collections.Generic.List[object]

    $homeOk = [string]::Equals((ConvertTo-SmcFullPath $HermesHome), (ConvertTo-SmcFullPath $layout.HermesHome), [StringComparison]::OrdinalIgnoreCase)
    [void]$checks.Add([pscustomobject]@{ name = "Hermes Home"; status = $(if ($homeOk) { "PASS" } else { "FAIL" }); detail = $layout.HermesHome })

    $progOk = [string]::Equals((ConvertTo-SmcFullPath $ProgramRoot), (ConvertTo-SmcFullPath $layout.ProgramRoot), [StringComparison]::OrdinalIgnoreCase)
    [void]$checks.Add([pscustomobject]@{ name = "Program Root"; status = $(if ($progOk) { "PASS" } else { "FAIL" }); detail = $layout.ProgramRoot })

    $cliPath = [string]$layout.CliPath
    [void]$checks.Add([pscustomobject]@{ name = "Hermes CLI Path"; status = "PASS"; detail = $cliPath })
    $cliExists = Test-Path -LiteralPath $cliPath
    [void]$checks.Add([pscustomobject]@{ name = "CLI Exists"; status = $(if ($cliExists) { "PASS" } else { "FAIL" }); detail = $cliPath })
    [void]$checks.Add([pscustomobject]@{ name = "PATH Policy"; status = "PASS"; detail = "persistent Hermes PATH not required" })

    $wsOk = Test-Path -LiteralPath $layout.WorkspaceRoot
    [void]$checks.Add([pscustomobject]@{ name = "Workspace Root"; status = $(if ($wsOk) { "PASS" } else { "FAIL" }); detail = $layout.WorkspaceRoot })

    $tmpOk = Test-Path -LiteralPath $layout.TempRoot
    [void]$checks.Add([pscustomobject]@{ name = "Temp Root"; status = $(if ($tmpOk) { "PASS" } else { "FAIL" }); detail = $layout.TempRoot })

    $cwdOk = $false
    $cwdDetail = "missing"
    try {
        Assert-SmcHermesManagedTerminalConfig -ConfigPath $layout.ConfigPath -WorkspaceRoot $layout.WorkspaceRoot -HermesHome $HermesHome
        $cwdOk = $true
        $cwdDetail = $layout.WorkspaceRoot
    } catch {
        $cwdDetail = "FAIL"
    }
    [void]$checks.Add([pscustomobject]@{ name = "terminal.cwd"; status = $(if ($cwdOk) { "PASS" } else { "FAIL" }); detail = $cwdDetail })

    $taskWdOk = $false
    $taskEnvOk = $false
    $taskPathOk = $false
    $taskWdDetail = "missing"
    $taskEnvDetail = "missing"
    $taskPathDetail = "missing"
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        $taskWdOk = $true
        $taskEnvOk = $true
        $taskPathOk = $true
        $taskWdDetail = "skipped"
        $taskEnvDetail = "skipped"
        $taskPathDetail = "skipped"
    } else {
        $task = Get-ScheduledTask -TaskName "SMC Hermes Gateway" -ErrorAction SilentlyContinue
        if ($null -ne $task) {
            $action = $task.Actions | Select-Object -First 1
            $wd = [string]$action.WorkingDirectory
            try {
                $taskWdOk = [string]::Equals((ConvertTo-SmcFullPath $wd), (ConvertTo-SmcFullPath $layout.WorkspaceRoot), [StringComparison]::OrdinalIgnoreCase)
            } catch {
                $taskWdOk = $false
            }
            $taskWdDetail = $wd
            $argsText = [string]$action.Arguments
            $taskEnvOk = ($argsText -match 'TERMINAL_CWD') -and ($argsText -match 'TEMP') -and ($argsText -match 'TMP')
            $taskEnvDetail = $(if ($taskEnvOk) { "contract present" } else { "contract missing" })
            $taskPathOk = ($argsText -match '\$env:PATH')
            $taskPathDetail = $(if ($taskPathOk) { "process-local PATH contract present" } else { "process-local PATH contract missing" })
        }
    }
    [void]$checks.Add([pscustomobject]@{ name = "Gateway Working Directory"; status = $(if ($taskWdOk) { "PASS" } else { "FAIL" }); detail = $taskWdDetail })
    [void]$checks.Add([pscustomobject]@{ name = "Gateway TERMINAL_CWD/TEMP/TMP contract"; status = $(if ($taskEnvOk) { "PASS" } else { "FAIL" }); detail = $taskEnvDetail })
    [void]$checks.Add([pscustomobject]@{ name = "Gateway Process PATH contract"; status = $(if ($taskPathOk) { "PASS" } else { "FAIL" }); detail = $taskPathDetail })

    foreach ($capCheck in @(Get-SmcHermesCapabilityDoctorChecks -ProgramRoot $ProgramRoot -HermesHome $HermesHome)) {
        [void]$checks.Add($capCheck)
    }

    $failed = 0
    foreach ($item in $checks) {
        if ([string]$item.status -eq "FAIL") { $failed++ }
    }
    return [pscustomobject]@{
        ok = ($failed -eq 0)
        layout = [pscustomobject]@{
            hermesHome = [string]$layout.HermesHome
            programRoot = [string]$layout.ProgramRoot
            workspaceRoot = [string]$layout.WorkspaceRoot
            tempRoot = [string]$layout.TempRoot
        }
        checks = @($checks.ToArray())
    }
}

Export-ModuleMember -Function `
    Get-SmcHermesManagedLayout, `
    ConvertTo-SmcFullPath, `
    Assert-SmcHermesManagedPath, `
    Assert-SmcHermesHomeChildPath, `
    Initialize-SmcHermesManagedHome, `
    Set-SmcHermesEnvironment, `
    Remove-SmcHermesEnvironment, `
    Set-SmcHermesProgramAcl, `
    Set-SmcHermesHomeAcl, `
    Set-SmcHermesManagedAcl, `
    Assert-SmcHermesProgramAcl, `
    Assert-SmcHermesHomeAcl, `
    Assert-SmcHermesManagedAcl, `
    Get-SmcHermesConfigTerminalCwd, `
    Merge-SmcHermesConfigTerminalCwd, `
    Set-SmcHermesManagedTerminalConfig, `
    Assert-SmcHermesManagedTerminalConfig, `
    Clear-SmcHermesManagedTemp, `
    ConvertTo-SmcYamlDoubleQuotedPath, `
    Merge-SmcHermesManagedConfig, `
    Invoke-SmcHermesConfigCheck, `
    Test-SmcHermesConfigFallbackOutput, `
    Get-SmcHermesCapabilityDoctorChecks, `
    Get-SmcHermesManagedDoctorReport
