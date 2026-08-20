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
        $script:PrevNodeMachine = [Environment]::GetEnvironmentVariable("HERMES_NODE_ROOT", "Machine")
        $script:PrevNodeProcess = $env:HERMES_NODE_ROOT
        $script:PrevMachinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
        $script:PrevMachineTemp = [Environment]::GetEnvironmentVariable("TEMP", "Machine")
        $script:PrevMachineTmp = [Environment]::GetEnvironmentVariable("TMP", "Machine")
        $script:PrevMachineHome = [Environment]::GetEnvironmentVariable("HOME", "Machine")
        $script:PrevMachineUserProfile = [Environment]::GetEnvironmentVariable("USERPROFILE", "Machine")
        $script:PrevProcessUserProfile = $env:USERPROFILE
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
        if ($null -ne $script:PrevNodeProcess) {
            $env:HERMES_NODE_ROOT = $script:PrevNodeProcess
        }
        try {
            [Environment]::SetEnvironmentVariable("HERMES_HOME", $script:PrevMachine, "Machine")
        } catch {}
        try {
            [Environment]::SetEnvironmentVariable("HERMES_AGENT_ROOT", $script:PrevAgentMachine, "Machine")
        } catch {}
        try {
            [Environment]::SetEnvironmentVariable("HERMES_NODE_ROOT", $script:PrevNodeMachine, "Machine")
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
        $script:Layout.WorkspaceRoot | Should Be "C:\ProgramData\SMC\Hermes\workspace"
        $script:Layout.TempRoot | Should Be "C:\ProgramData\SMC\Hermes\tmp"
        $script:Layout.ConfigPath | Should Be "C:\ProgramData\SMC\Hermes\config.yaml"
        $script:Layout.CliPath | Should Be "D:\Programs\SMC\Hermes\bin\hermes.exe"
        $script:Layout.AgentRoot | Should Be "D:\Programs\SMC\Hermes\node\hermes-agent"
        $script:Layout.BinPath | Should Be "D:\Programs\SMC\Hermes\bin"
        $script:Layout.ScriptsPath | Should Be "D:\Programs\SMC\Hermes\scripts"
        ($script:Layout.Directories -contains "profiles") | Should Be $true
        ($script:Layout.Directories -contains "memories") | Should Be $true
        ($script:Layout.Directories -contains "skills") | Should Be $true
        ($script:Layout.Directories -contains "sessions") | Should Be $true
        ($script:Layout.Directories -contains "workspace") | Should Be $true
        ($script:Layout.Directories -contains "tmp") | Should Be $true
    }

    It "test-root override keeps workspace/tmp under HermesHome" {
        $testRoot = Join-Path "C:\ProgramData\SMC\ManagedTests" ("layout-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
        $prev = $env:SMC_HERMES_MANAGED_TEST_ROOT
        try {
            $env:SMC_HERMES_MANAGED_TEST_ROOT = $testRoot
            Import-Module $script:Module -Force
            $layout = Get-SmcHermesManagedLayout
            $layout.WorkspaceRoot | Should Be (Join-Path $layout.HermesHome "workspace")
            $layout.TempRoot | Should Be (Join-Path $layout.HermesHome "tmp")
            ($layout.Directories -contains "tmp") | Should Be $true
        } finally {
            if ($null -eq $prev) { Remove-Item Env:SMC_HERMES_MANAGED_TEST_ROOT -ErrorAction SilentlyContinue }
            else { $env:SMC_HERMES_MANAGED_TEST_ROOT = $prev }
            Import-Module $script:Module -Force
            Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
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

        $expectedNodeRoot = $script:Layout.NodeRoot
        $env:HERMES_NODE_ROOT | Should Be $expectedNodeRoot
        [Environment]::GetEnvironmentVariable("HERMES_NODE_ROOT", "Machine") | Should Be $expectedNodeRoot

        # Machine TEMP/TMP/HOME/USERPROFILE must remain untouched
        [Environment]::GetEnvironmentVariable("TEMP", "Machine") | Should Be $script:PrevMachineTemp
        [Environment]::GetEnvironmentVariable("TMP", "Machine") | Should Be $script:PrevMachineTmp
        [Environment]::GetEnvironmentVariable("HOME", "Machine") | Should Be $script:PrevMachineHome
        [Environment]::GetEnvironmentVariable("USERPROFILE", "Machine") | Should Be $script:PrevMachineUserProfile
        $env:USERPROFILE | Should Be $script:PrevProcessUserProfile

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

    It "merges terminal.cwd atomically and preserves unknown fields" {
        $testRoot = Join-Path "C:\ProgramData\SMC\ManagedTests" ("config-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
        $prev = $env:SMC_HERMES_MANAGED_TEST_ROOT
        $prevSkip = $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY
        try {
            $env:SMC_HERMES_MANAGED_TEST_ROOT = $testRoot
            $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY = "1"
            Import-Module $script:Module -Force
            $layout = Get-SmcHermesManagedLayout
            New-Item -ItemType Directory -Force -Path $layout.HermesHome | Out-Null
            $config = $layout.ConfigPath
            Set-Content -LiteralPath $config -Value @"
models:
  default: keep-model
providers:
  openai:
    api_key: REDACTED
custom_unknown:
  nested: value
"@ -Encoding utf8

            $first = Set-SmcHermesManagedTerminalConfig
            $first.Changed | Should Be $true
            Assert-SmcHermesManagedTerminalConfig
            $text = Get-Content -LiteralPath $config -Raw
            $text | Should Match "keep-model"
            $text | Should Match "custom_unknown"
            $text | Should Match "REDACTED"
            (Get-SmcHermesConfigTerminalCwd -ConfigText $text) | Should Be $layout.WorkspaceRoot

            $second = Set-SmcHermesManagedTerminalConfig
            $second.Changed | Should Be $false

            Set-Content -LiteralPath $config -Value @"
models:
  default: keep-model
terminal:
  cwd: "C:\\Users\\Administrator"
"@ -Encoding utf8
            $fixed = Set-SmcHermesManagedTerminalConfig
            $fixed.Changed | Should Be $true
            Assert-SmcHermesManagedTerminalConfig
            (Get-Content -LiteralPath $config -Raw) | Should Match "keep-model"
        } finally {
            if ($null -eq $prev) { Remove-Item Env:SMC_HERMES_MANAGED_TEST_ROOT -ErrorAction SilentlyContinue } else { $env:SMC_HERMES_MANAGED_TEST_ROOT = $prev }
            if ($null -eq $prevSkip) { Remove-Item Env:SMC_HERMES_INSTALLER_SKIP_GATEWAY -ErrorAction SilentlyContinue } else { $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY = $prevSkip }
            Import-Module $script:Module -Force
            Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "rolls back terminal.cwd write when candidate is invalid" {
        $testRoot = Join-Path "C:\ProgramData\SMC\ManagedTests" ("rollback-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
        $prev = $env:SMC_HERMES_MANAGED_TEST_ROOT
        $prevSkip = $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY
        try {
            $env:SMC_HERMES_MANAGED_TEST_ROOT = $testRoot
            $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY = "1"
            Import-Module $script:Module -Force
            $layout = Get-SmcHermesManagedLayout
            New-Item -ItemType Directory -Force -Path $layout.HermesHome | Out-Null
            $original = "models:`n  default: original-keep`n"
            Set-Content -LiteralPath $layout.ConfigPath -Value $original -Encoding utf8

            # Force merge helper to produce empty cwd by temporarily shadowing with bad workspace outside home — must fail closed.
            $threw = $false
            try {
                Set-SmcHermesManagedTerminalConfig -WorkspaceRoot "C:\Users\Administrator\bad-workspace" -ErrorAction Stop
            } catch {
                $threw = $true
            }
            $threw | Should Be $true
            (Get-Content -LiteralPath $layout.ConfigPath -Raw).Trim() | Should Be $original.Trim()
        } finally {
            if ($null -eq $prev) { Remove-Item Env:SMC_HERMES_MANAGED_TEST_ROOT -ErrorAction SilentlyContinue } else { $env:SMC_HERMES_MANAGED_TEST_ROOT = $prev }
            if ($null -eq $prevSkip) { Remove-Item Env:SMC_HERMES_INSTALLER_SKIP_GATEWAY -ErrorAction SilentlyContinue } else { $env:SMC_HERMES_INSTALLER_SKIP_GATEWAY = $prevSkip }
            Import-Module $script:Module -Force
            Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "clears only aged files under TempRoot and refuses path escape" {
        $testRoot = Join-Path "C:\ProgramData\SMC\ManagedTests" ("temp-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
        $prev = $env:SMC_HERMES_MANAGED_TEST_ROOT
        try {
            $env:SMC_HERMES_MANAGED_TEST_ROOT = $testRoot
            Import-Module $script:Module -Force
            $layout = Get-SmcHermesManagedLayout
            New-Item -ItemType Directory -Force -Path $layout.TempRoot | Out-Null
            New-Item -ItemType Directory -Force -Path $layout.WorkspaceRoot | Out-Null
            $oldFile = Join-Path $layout.TempRoot "old.tmp"
            $newFile = Join-Path $layout.TempRoot "new.tmp"
            $wsFile = Join-Path $layout.WorkspaceRoot "keep.txt"
            Set-Content -LiteralPath $oldFile -Value "old" -Encoding ascii
            Set-Content -LiteralPath $newFile -Value "new" -Encoding ascii
            Set-Content -LiteralPath $wsFile -Value "keep" -Encoding ascii
            (Get-Item -LiteralPath $oldFile).LastWriteTimeUtc = (Get-Date).ToUniversalTime().AddHours(-30)

            $result = Clear-SmcHermesManagedTemp -MaxAgeHours 24
            $result.ok | Should Be $true
            Test-Path -LiteralPath $oldFile | Should Be $false
            Test-Path -LiteralPath $newFile | Should Be $true
            Test-Path -LiteralPath $wsFile | Should Be $true

            $threw = $false
            try {
                Clear-SmcHermesManagedTemp -TempRoot $layout.WorkspaceRoot -ErrorAction Stop
            } catch {
                $threw = $true
            }
            $threw | Should Be $true
            Test-Path -LiteralPath $wsFile | Should Be $true
        } finally {
            if ($null -eq $prev) { Remove-Item Env:SMC_HERMES_MANAGED_TEST_ROOT -ErrorAction SilentlyContinue } else { $env:SMC_HERMES_MANAGED_TEST_ROOT = $prev }
            Import-Module $script:Module -Force
            Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It "rejects UNC and home-child path escapes" {
        $threwUnc = $false
        try {
            Assert-SmcHermesHomeChildPath -Path "\\server\share\hermes" -ErrorAction Stop
        } catch {
            $threwUnc = $true
        }
        $threwUnc | Should Be $true

        $threwOutside = $false
        try {
            Assert-SmcHermesHomeChildPath -Path "C:\Windows\Temp\hermes-escape" -ErrorAction Stop
        } catch {
            $threwOutside = $true
        }
        $threwOutside | Should Be $true
    }
}
