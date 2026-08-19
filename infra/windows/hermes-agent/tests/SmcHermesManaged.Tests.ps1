# Pester 3.4 compatible
Describe "SmcHermesManaged machine home" {
    BeforeAll {
        $script:Module = Join-Path $PSScriptRoot "..\scripts\SmcHermesManaged.psm1"
        Import-Module $script:Module -Force
        $script:Layout = Get-SmcHermesManagedLayout
        $script:ManagedHome = $script:Layout.HermesHome
        $script:OwnerPath = Join-Path (Split-Path -Parent $script:ManagedHome) "control-owner.json"
        $script:HomeExisted = Test-Path -LiteralPath $script:ManagedHome
        $script:OwnerExisted = Test-Path -LiteralPath $script:OwnerPath
        $script:OwnerHash = $null
        if ($script:OwnerExisted) {
            $script:OwnerHash = (Get-FileHash -LiteralPath $script:OwnerPath -Algorithm SHA256).Hash
        }
        $script:PrevMachine = [Environment]::GetEnvironmentVariable("HERMES_HOME", "Machine")
        $script:PrevProcess = $env:HERMES_HOME
        $script:PrevAgentMachine = [Environment]::GetEnvironmentVariable("HERMES_AGENT_ROOT", "Machine")
        $script:PrevAgentProcess = $env:HERMES_AGENT_ROOT
        $script:PrevMachinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
        $script:CreatedFiles = @()
        foreach ($name in $script:Layout.PreservedFiles) {
            $path = Join-Path $script:ManagedHome $name
            if (-not (Test-Path -LiteralPath $path)) {
                $script:CreatedFiles += $path
            }
        }
    }

    AfterAll {
        if ($null -ne $script:PrevProcess) {
            $env:HERMES_HOME = $script:PrevProcess
        }
        if ($null -ne $script:PrevAgentProcess) {
            $env:HERMES_AGENT_ROOT = $script:PrevAgentProcess
        }
        try {
            [Environment]::SetEnvironmentVariable("HERMES_HOME", $script:PrevMachine, "Machine")
        } catch {}
        try {
            [Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $script:PrevAgentMachine, "Machine")
        } catch {}
        try {
            [Environment]::SetEnvironmentVariable("PATH", $script:PrevMachinePath, "Machine")
        } catch {}
        foreach ($path in @($script:CreatedFiles)) {
            if (Test-Path -LiteralPath $path) {
                Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
            }
        }
        if (-not $script:HomeExisted -and (Test-Path -LiteralPath $script:ManagedHome)) {
            Remove-Item -LiteralPath $script:ManagedHome -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (-not $script:OwnerExisted -and (Test-Path -LiteralPath $script:OwnerPath)) {
            throw "managed-home init must not create control-owner.json"
        }
    }

    It "returns exact Program and HERMES_HOME layout" {
        $script:Layout.ProgramRoot | Should Be "D:\Programs\SMC\Hermes"
        $script:Layout.HermesHome | Should Be "C:\ProgramData\SMC\Hermes"
        $script:Layout.CliPath | Should Be "D:\Programs\SMC\Hermes\bin\hermes.exe"
        $script:Layout.AgentRoot | Should Be "D:\Programs\SMC\Hermes\node\hermes-agent"
        $script:Layout.BinPath | Should Be "D:\Programs\SMC\Hermes\bin"
        $script:Layout.ScriptsPath | Should Be "D:\Programs\SMC\Hermes\scripts"
        ($script:Layout.Directories -contains "profiles") | Should Be $true
        ($script:Layout.Directories -contains "memories") | Should Be $true
        ($script:Layout.Directories -contains "skills") | Should Be $true
        ($script:Layout.Directories -contains "sessions") | Should Be $true
    }

    It "rejects user profile, systemprofile, relative, and escaped paths" {
        $cases = @(
            (Join-Path $env:USERPROFILE ".hermes"),
            "C:\Windows\System32\config\systemprofile\.hermes",
            "Hermes",
            "C:\ProgramData\SMC\Hermes\..\..\Windows\Temp\hermes-escape"
        )
        foreach ($path in $cases) {
            $threw = $false
            $message = ""
            try {
                Assert-SmcHermesManagedPath -Path $path -Kind Home -ErrorAction Stop
            } catch {
                $threw = $true
                $message = "$_"
            }
            $threw | Should Be $true
            $message | Should Match "forbidden|relative|not the managed"
        }
    }

    It "initializes machine home, env, and Home ACL (Users Modify) without owner mutation" {
        $managedHome = $script:ManagedHome
        $payloads = @{}
        foreach ($name in $script:Layout.PreservedFiles) {
            $path = Join-Path $managedHome $name
            if (Test-Path -LiteralPath $path) {
                $payloads[$name] = Get-FileHash -LiteralPath $path -Algorithm SHA256
            } else {
                New-Item -ItemType Directory -Force -Path $managedHome | Out-Null
                Set-Content -LiteralPath $path -Value ("keep-" + $name) -Encoding ascii
                $payloads[$name] = Get-FileHash -LiteralPath $path -Algorithm SHA256
            }
        }

        $first = Initialize-SmcHermesManagedHome
        $second = Initialize-SmcHermesManagedHome
        $first.HermesHome | Should Be $managedHome
        $second.HermesHome | Should Be $managedHome

        # All directories including profiles and memories must exist
        foreach ($name in $script:Layout.Directories) {
            Test-Path -LiteralPath (Join-Path $managedHome $name) | Should Be $true
        }

        # Preserved files must not be modified
        foreach ($name in $script:Layout.PreservedFiles) {
            $path = Join-Path $managedHome $name
            (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash | Should Be $payloads[$name].Hash
        }

        # Machine and process env must be set
        $env:HERMES_HOME | Should Be $managedHome
        [Environment]::GetEnvironmentVariable("HERMES_HOME", "Machine") | Should Be $managedHome

        $expectedAgentRoot = $script:Layout.AgentRoot
        $env:HERMES_AGENT_ROOT | Should Be $expectedAgentRoot
        [Environment]::GetEnvironmentVariable("HERMES_AGENT_ROOT", "Machine") | Should Be $expectedAgentRoot

        # Machine PATH must contain bin and scripts
        $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
        ($machinePath -split ";") | Where-Object { [string]::Equals($_.TrimEnd("\"), $script:Layout.BinPath.TrimEnd("\"), [StringComparison]::OrdinalIgnoreCase) } | Should Not BeNullOrEmpty
        ($machinePath -split ";") | Where-Object { [string]::Equals($_.TrimEnd("\"), $script:Layout.ScriptsPath.TrimEnd("\"), [StringComparison]::OrdinalIgnoreCase) } | Should Not BeNullOrEmpty

        # Home ACL: SYSTEM+Admins FullControl, Users Modify (CI+OI)
        $acl = (Get-Item -LiteralPath $managedHome).GetAccessControl()
        $acl.AreAccessRulesProtected | Should Be $true
        $sidType = [type][System.Security.Principal.SecurityIdentifier]
        $rules = @($acl.GetAccessRules($true, $false, $sidType))
        $sids = @($rules | ForEach-Object { [string]$_.IdentityReference.Value })
        ($sids -contains "S-1-5-18") | Should Be $true
        ($sids -contains "S-1-5-32-544") | Should Be $true
        ($sids -contains "S-1-5-32-545") | Should Be $true

        $userRule = $rules | Where-Object { [string]$_.IdentityReference.Value -eq "S-1-5-32-545" -and $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow }
        $userRule | Should Not BeNullOrEmpty
        ($userRule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Modify) | Should Not Be 0
        ($userRule.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ContainerInherit) | Should Not Be 0
        ($userRule.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ObjectInherit) | Should Not Be 0

        if ($script:OwnerExisted) {
            (Get-FileHash -LiteralPath $script:OwnerPath -Algorithm SHA256).Hash | Should Be $script:OwnerHash
        } else {
            Test-Path -LiteralPath $script:OwnerPath | Should Be $false
        }
    }

    It "Add-SmcMachinePath is idempotent and Remove-SmcMachinePath only removes target" {
        $testEntry = "C:\SMC-TEST-PATH-ENTRY-UNIQUE"
        $before = [Environment]::GetEnvironmentVariable("PATH", "Machine")

        Add-SmcMachinePath -Entry $testEntry
        $afterAdd = [Environment]::GetEnvironmentVariable("PATH", "Machine")
        ($afterAdd -split ";") | Where-Object { [string]::Equals($_.TrimEnd("\"), $testEntry, [StringComparison]::OrdinalIgnoreCase) } | Should Not BeNullOrEmpty

        # Second add must not duplicate
        Add-SmcMachinePath -Entry $testEntry
        $afterDup = [Environment]::GetEnvironmentVariable("PATH", "Machine")
        $count = @(($afterDup -split ";") | Where-Object { [string]::Equals($_.TrimEnd("\"), $testEntry, [StringComparison]::OrdinalIgnoreCase) }).Count
        $count | Should Be 1

        # Remove only removes the target, leaves others intact
        $beforeParts = $before -split ";"
        Remove-SmcMachinePath -Entry $testEntry
        $afterRemove = [Environment]::GetEnvironmentVariable("PATH", "Machine")
        ($afterRemove -split ";") | Where-Object { [string]::Equals($_.TrimEnd("\"), $testEntry, [StringComparison]::OrdinalIgnoreCase) } | Should BeNullOrEmpty
        foreach ($part in $beforeParts) {
            if (-not [string]::IsNullOrWhiteSpace($part)) {
                ($afterRemove -split ";") | Where-Object { [string]::Equals($_.TrimEnd("\"), $part.TrimEnd("\"), [StringComparison]::OrdinalIgnoreCase) } | Should Not BeNullOrEmpty
            }
        }
    }

    It "Assert-SmcHermesHomeAcl passes with Users Modify (CI+OI) and fails when missing" {
        $tmpDir = Join-Path $env:TEMP ("smc-acl-home-test-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
        try {
            Set-SmcHermesHomeAcl -Path $tmpDir
            Assert-SmcHermesHomeAcl -Path $tmpDir  # must not throw

            # Remove Users rule -> assert should throw HOME_ACL_USER_WRITE_MISSING
            $acl = (Get-Item -LiteralPath $tmpDir).GetAccessControl()
            $sidType = [type][System.Security.Principal.SecurityIdentifier]
            $userSid = New-Object System.Security.Principal.SecurityIdentifier "S-1-5-32-545"
            $rules = @($acl.GetAccessRules($true, $false, $sidType))
            foreach ($r in $rules) {
                if ([string]$r.IdentityReference.Value -eq "S-1-5-32-545") {
                    $acl.RemoveAccessRule($r) | Out-Null
                }
            }
            (Get-Item -LiteralPath $tmpDir).SetAccessControl($acl)

            $threw = $false
            $msg = ""
            try { Assert-SmcHermesHomeAcl -Path $tmpDir } catch { $threw = $true; $msg = "$_" }
            $threw | Should Be $true
            $msg | Should Match "HOME_ACL_USER_WRITE_MISSING"
        } finally {
            Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "Assert-SmcHermesProgramAcl fails with PROGRAM_ACL_TOO_PERMISSIVE when Users has Modify" {
        $tmpDir = Join-Path $env:TEMP ("smc-acl-prog-test-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
        try {
            # Give Users Modify intentionally (wrong for ProgramRoot)
            Set-SmcHermesHomeAcl -Path $tmpDir

            $threw = $false
            $msg = ""
            try { Assert-SmcHermesProgramAcl -Path $tmpDir } catch { $threw = $true; $msg = "$_" }
            $threw | Should Be $true
            $msg | Should Match "PROGRAM_ACL_TOO_PERMISSIVE"
        } finally {
            Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "does not initialize when Program or Home is overridden" {
        $threwHome = $false
        try {
            Initialize-SmcHermesManagedHome -HermesHome (Join-Path $env:TEMP "smc-hermes-home") -ErrorAction Stop
        } catch {
            $threwHome = $true
        }
        $threwHome | Should Be $true
        Test-Path -LiteralPath (Join-Path $env:TEMP "smc-hermes-home") | Should Be $false

        $threwProgram = $false
        try {
            Initialize-SmcHermesManagedHome -ProgramRoot "C:\Temp\SMC\Hermes" -ErrorAction Stop
        } catch {
            $threwProgram = $true
        }
        $threwProgram | Should Be $true
    }
}
