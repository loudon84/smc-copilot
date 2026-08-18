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
            CliPath        = Join-Path $programRoot "bin\hermes.exe"
            Directories    = @("skills", "sessions", "logs", "workspace", "state")
            PreservedFiles = @("config.yaml", ".env", "auth.json")
        }
    }
    $programRoot = "D:\Programs\SMC\Hermes"
    $hermesHome = "C:\ProgramData\SMC\Hermes"
    return [pscustomobject]@{
        ProgramRoot    = $programRoot
        HermesHome     = $hermesHome
        CliPath        = Join-Path $programRoot "bin\hermes.exe"
        Directories    = @("skills", "sessions", "logs", "workspace", "state")
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

function Set-SmcHermesManagedAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    $item = Get-Item -LiteralPath $Path
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $system = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-18"
    $admins = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-32-544"
    $rights = [System.Security.AccessControl.FileSystemRights]::FullControl
    $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $propagate = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($system, $rights, $inherit, $propagate, $allow)))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($admins, $rights, $inherit, $propagate, $allow)))
    $item.SetAccessControl($acl)
}

function Assert-SmcHermesManagedAcl {
    param([Parameter(Mandatory = $true)][string]$Path)
    $acl = (Get-Item -LiteralPath $Path).GetAccessControl()
    if (-not $acl.AreAccessRulesProtected) {
        throw "ACL inheritance must be disabled"
    }
    $allowed = @("S-1-5-18", "S-1-5-32-544")
    $sidType = [type][System.Security.Principal.SecurityIdentifier]
    $rules = @($acl.GetAccessRules($true, $false, $sidType))
    if ($rules.Count -eq 0) {
        throw "ACL has no explicit rules"
    }
    foreach ($rule in $rules) {
        $sid = [string]$rule.IdentityReference.Value
        if ($allowed -notcontains $sid) {
            throw "ACL grants unexpected identity $sid"
        }
        if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
            throw "ACL deny rule is forbidden"
        }
    }
    foreach ($sid in $allowed) {
        $match = $false
        foreach ($rule in $rules) {
            if ([string]$rule.IdentityReference.Value -eq $sid) {
                $match = $true
                break
            }
        }
        if (-not $match) {
            throw "ACL missing $sid"
        }
    }
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

    $previousMachine = [System.Environment]::GetEnvironmentVariable("HERMES_HOME", "Machine")
    $previousProcess = $env:HERMES_HOME
    $machineSet = $false
    $processSet = $false
    try {
        if (-not [System.IO.Directory]::Exists($HermesHome)) {
            [void][System.IO.Directory]::CreateDirectory($HermesHome)
        }
        Set-SmcHermesManagedAcl -Path $HermesHome
        Assert-SmcHermesManagedAcl -Path $HermesHome
        foreach ($name in $layout.Directories) {
            $child = Join-Path $HermesHome $name
            if (-not [System.IO.Directory]::Exists($child)) {
                [void][System.IO.Directory]::CreateDirectory($child)
            }
        }
        [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $HermesHome, "Machine")
        $machineSet = $true
        $env:HERMES_HOME = $HermesHome
        $processSet = $true
    } catch {
        if ($processSet) {
            $env:HERMES_HOME = $previousProcess
        }
        if ($machineSet) {
            [System.Environment]::SetEnvironmentVariable("HERMES_HOME", $previousMachine, "Machine")
        }
        throw
    }
    return $layout
}

Export-ModuleMember -Function Get-SmcHermesManagedLayout, Assert-SmcHermesManagedPath, Initialize-SmcHermesManagedHome
