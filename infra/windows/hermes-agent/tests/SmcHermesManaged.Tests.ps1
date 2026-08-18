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
        try {
            [Environment]::SetEnvironmentVariable("HERMES_HOME", $script:PrevMachine, "Machine")
        } catch {
        }
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
        $script:Layout.Directories -join "," | Should Be "skills,sessions,logs,workspace,state"
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

    It "initializes machine home, env, and restrictive ACL without owner mutation" {
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

        foreach ($name in $script:Layout.Directories) {
            Test-Path -LiteralPath (Join-Path $managedHome $name) | Should Be $true
        }
        foreach ($name in $script:Layout.PreservedFiles) {
            $path = Join-Path $managedHome $name
            (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash | Should Be $payloads[$name].Hash
        }

        $env:HERMES_HOME | Should Be $managedHome
        [Environment]::GetEnvironmentVariable("HERMES_HOME", "Machine") | Should Be $managedHome

        $acl = (Get-Item -LiteralPath $managedHome).GetAccessControl()
        $acl.AreAccessRulesProtected | Should Be $true
        $rules = @($acl.GetAccessRules($true, $false, [type][System.Security.Principal.SecurityIdentifier]))
        $sids = @($rules | ForEach-Object { [string]$_.IdentityReference.Value })
        ($sids -contains "S-1-5-18") | Should Be $true
        ($sids -contains "S-1-5-32-544") | Should Be $true
        foreach ($sid in $sids) {
            (($sid -eq "S-1-5-18") -or ($sid -eq "S-1-5-32-544")) | Should Be $true
        }

        if ($script:OwnerExisted) {
            (Get-FileHash -LiteralPath $script:OwnerPath -Algorithm SHA256).Hash | Should Be $script:OwnerHash
        } else {
            Test-Path -LiteralPath $script:OwnerPath | Should Be $false
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
