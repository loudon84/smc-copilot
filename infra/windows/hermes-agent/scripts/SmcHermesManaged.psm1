#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
    Add-SmcMachinePath -Entry $layout.BinPath
    Add-SmcMachinePath -Entry $layout.ScriptsPath
}

function Remove-SmcHermesEnvironment {
    $layout = Get-SmcHermesManagedLayout
    [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $null, "Machine")
    [System.Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $null, "Machine")
    [System.Environment]::SetEnvironmentVariable("HERMES_NODE_ROOT", $null, "Machine")
    Remove-Item Env:HERMES_HOME -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_AGENT_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_NODE_ROOT -ErrorAction SilentlyContinue
    Remove-SmcMachinePath -Entry $layout.BinPath
    Remove-SmcMachinePath -Entry $layout.ScriptsPath
}

function Add-SmcMachinePath {
    param([Parameter(Mandatory = $true)][string]$Entry)
    $current = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    if ([string]::IsNullOrEmpty($current)) { $current = "" }
    $parts = @($current -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $norm = $Entry.TrimEnd("\")
    $exists = @($parts | Where-Object { [string]::Equals($_.TrimEnd("\"), $norm, [StringComparison]::OrdinalIgnoreCase) })
    if ($exists.Count -eq 0) {
        $newPath = (@($parts) + $norm) -join ";"
        [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "Machine")
    }
    $procParts = @($env:PATH -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $procExists = @($procParts | Where-Object { [string]::Equals($_.TrimEnd("\"), $norm, [StringComparison]::OrdinalIgnoreCase) })
    if ($procExists.Count -eq 0) {
        $env:PATH = (@($procParts) + $norm) -join ";"
    }
}

function Remove-SmcMachinePath {
    param([Parameter(Mandatory = $true)][string]$Entry)
    $norm = $Entry.TrimEnd("\")
    $current = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    if ([string]::IsNullOrEmpty($current)) { return }
    $parts = @($current -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $filtered = @($parts | Where-Object { -not [string]::Equals($_.TrimEnd("\"), $norm, [StringComparison]::OrdinalIgnoreCase) })
    [System.Environment]::SetEnvironmentVariable("PATH", ($filtered -join ";"), "Machine")
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
    $prevMachinePath      = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")

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
            # best-effort rollback
            [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $prevHermesHome, "Machine")
            [System.Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $prevAgentRoot, "Machine")
            [System.Environment]::SetEnvironmentVariable("HERMES_NODE_ROOT", $prevNodeRoot, "Machine")
            [System.Environment]::SetEnvironmentVariable("PATH", $prevMachinePath, "Machine")
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

function Invoke-SmcHermesConfigCheck {
    param(
        [Parameter(Mandatory = $true)][string]$ConfigPath,
        [Parameter(Mandatory = $true)][string]$HermesHome,
        [string]$CliPath = ""
    )
    $layout = Get-SmcHermesManagedLayout
    if ([string]::IsNullOrWhiteSpace($CliPath)) {
        $CliPath = $layout.CliPath
    }
    $text = Get-Content -LiteralPath $ConfigPath -Raw -ErrorAction Stop
    $cwd = Get-SmcHermesConfigTerminalCwd -ConfigText $text
    if ([string]::IsNullOrWhiteSpace($cwd)) {
        throw "config check failed: terminal.cwd missing"
    }
    # Smoke/unit fixtures may ship a non-functional PE stub; structural check is enough there.
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        return
    }
    if (-not (Test-Path -LiteralPath $CliPath)) {
        return
    }
    $prevHome = $env:HERMES_HOME
    try {
        $env:HERMES_HOME = $HermesHome
        $output = & $CliPath config check 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "hermes config check failed: $($output -join ' ')"
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
    if (-not $merged.Changed -and $hadFile) {
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
            throw "config merge failed: terminal.cwd missing"
        }
        Move-Item -LiteralPath $tmp -Destination $ConfigPath -Force
        Invoke-SmcHermesConfigCheck -ConfigPath $ConfigPath -HermesHome $HermesHome -CliPath $CliPath
        if (Test-Path -LiteralPath $backup) {
            Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
        }
    } catch {
        if (Test-Path -LiteralPath $tmp) {
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        }
        if ($hadFile -and (Test-Path -LiteralPath $backup)) {
            Move-Item -LiteralPath $backup -Destination $ConfigPath -Force
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
    $taskWdDetail = "missing"
    $taskEnvDetail = "missing"
    if ([Environment]::GetEnvironmentVariable("SMC_HERMES_INSTALLER_SKIP_GATEWAY", "Process") -eq "1") {
        $taskWdOk = $true
        $taskEnvOk = $true
        $taskWdDetail = "skipped"
        $taskEnvDetail = "skipped"
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
        }
    }
    [void]$checks.Add([pscustomobject]@{ name = "Gateway Working Directory"; status = $(if ($taskWdOk) { "PASS" } else { "FAIL" }); detail = $taskWdDetail })
    [void]$checks.Add([pscustomobject]@{ name = "Gateway TERMINAL_CWD/TEMP/TMP contract"; status = $(if ($taskEnvOk) { "PASS" } else { "FAIL" }); detail = $taskEnvDetail })

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
    Assert-SmcHermesManagedPath, `
    Assert-SmcHermesHomeChildPath, `
    Initialize-SmcHermesManagedHome, `
    Set-SmcHermesEnvironment, `
    Remove-SmcHermesEnvironment, `
    Add-SmcMachinePath, `
    Remove-SmcMachinePath, `
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
    Get-SmcHermesManagedDoctorReport
