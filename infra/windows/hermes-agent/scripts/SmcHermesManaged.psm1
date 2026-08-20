#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SmcHermesManagedLayout {
    $testRoot = [Environment]::GetEnvironmentVariable("SMC_HERMES_MANAGED_TEST_ROOT", "Process")
    if (-not [string]::IsNullOrWhiteSpace($testRoot)) {
        $programRoot = Join-Path $testRoot "Program\Hermes"
        $hermesHome = Join-Path $testRoot "Data\Hermes"
        return [pscustomobject]@{
            ProgramRoot    = $programRoot
            HermesHome     = $hermesHome
            AgentRoot      = Join-Path $programRoot "node\hermes-agent"
            NodeRoot       = Join-Path $programRoot "node"
            BinPath        = Join-Path $programRoot "bin"
            ScriptsPath    = Join-Path $programRoot "scripts"
            CliPath        = Join-Path $programRoot "bin\hermes.exe"
            Directories    = @("profiles", "skills", "sessions", "memories", "logs", "workspace", "state")
            PreservedFiles = @("config.yaml", ".env", "auth.json")
        }
    }
    $programRoot = "D:\Programs\SMC\Hermes"
    $hermesHome = "C:\ProgramData\SMC\Hermes"
    return [pscustomobject]@{
        ProgramRoot    = $programRoot
        HermesHome     = $hermesHome
        AgentRoot      = Join-Path $programRoot "node\hermes-agent"
        NodeRoot       = Join-Path $programRoot "node"
        BinPath        = Join-Path $programRoot "bin"
        ScriptsPath    = Join-Path $programRoot "scripts"
        CliPath        = Join-Path $programRoot "bin\hermes.exe"
        Directories    = @("profiles", "skills", "sessions", "memories", "logs", "workspace", "state")
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

    $prevHermesHome       = [System.Environment]::GetEnvironmentVariable("HERMES_HOME", "Machine")
    $prevHermesHomeProc   = $env:HERMES_HOME
    $prevAgentRoot        = [System.Environment]::GetEnvironmentVariable("HERMES_AGENT_ROOT", "Machine")
    $prevAgentRootProc    = $env:HERMES_AGENT_ROOT
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
        }

        Set-SmcHermesEnvironment -ProgramRoot $ProgramRoot -HermesHome $HermesHome
        $envSet = $true
    } catch {
        if ($envSet) {
            # best-effort rollback
            [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $prevHermesHome, "Machine")
            [System.Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $prevAgentRoot, "Machine")
            [System.Environment]::SetEnvironmentVariable("PATH", $prevMachinePath, "Machine")
            $env:HERMES_HOME = $prevHermesHomeProc
            $env:HERMES_AGENT_ROOT = $prevAgentRootProc
        }
        throw
    }
    return $layout
}

Export-ModuleMember -Function `
    Get-SmcHermesManagedLayout, `
    Assert-SmcHermesManagedPath, `
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
    Assert-SmcHermesManagedAcl
