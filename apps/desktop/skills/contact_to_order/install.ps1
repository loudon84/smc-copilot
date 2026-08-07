# Install contact_to_order skill into Hermes Agent skills directory.
# Usage:
#   .\install.ps1
#   .\install.ps1 -TargetRoot "C:\path\to\hermes-agent\skills"
param(
    [string]$TargetRoot = $(if ($env:HERMES_SKILLS_DIR) { $env:HERMES_SKILLS_DIR }
        elseif ($env:HERMES_AGENT_DIR) { Join-Path $env:HERMES_AGENT_DIR "skills" }
        else { Join-Path $env:USERPROFILE ".hermes\skills" })
)

$ErrorActionPreference = "Stop"
$SrcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TargetDir = Join-Path $TargetRoot "contact_to_order"

$exclude = @("*.zip", "__pycache__", ".git")
New-Item -ItemType Directory -Force -Path $TargetRoot | Out-Null
if (Test-Path $TargetDir) {
    Remove-Item -Recurse -Force $TargetDir
}
Copy-Item -Path $SrcDir -Destination $TargetDir -Recurse -Force
Get-ChildItem -Path $TargetDir -Recurse -Include $exclude | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$ProfileSkills = Join-Path $env:USERPROFILE ".hermes\profiles\default\skills\contact_to_order"
if (Test-Path (Split-Path $ProfileSkills -Parent)) {
    if (Test-Path $ProfileSkills) { Remove-Item -Recurse -Force $ProfileSkills }
    Copy-Item -Path $SrcDir -Destination $ProfileSkills -Recurse -Force
    Get-ChildItem -Path $ProfileSkills -Recurse -Include $exclude | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Synced profile copy to: $ProfileSkills"
}

Write-Host "Installed contact_to_order skill to: $TargetDir"
Write-Host "Restart Hermes gateway/webui or start a new agent session if skill_view does not list it."
