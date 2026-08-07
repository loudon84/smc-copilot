# Package contact_to_order skill as zip for distribution/install.
# Usage: .\package.ps1
# Output: contact_to_order_skill.zip (next to this script)
$ErrorActionPreference = "Stop"
$SrcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ZipPath = Join-Path $SrcDir "contact_to_order_skill.zip"

$staging = Join-Path $env:TEMP "contact_to_order_pkg_$(Get-Random)"
$out = Join-Path $staging "contact_to_order"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$items = @(
    "SKILL.md", "README.md", "read_file_guide.md", "model_routes.yaml",
    "DIFY_TO_HERMES_MAPPING.md", "install.sh", "install.ps1", "package.ps1",
    "prompts", "schemas", "scripts", "examples"
)
foreach ($item in $items) {
    $p = Join-Path $SrcDir $item
    if (Test-Path $p) {
        Copy-Item -Path $p -Destination (Join-Path $out $item) -Recurse -Force
    }
}

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path $out -DestinationPath $ZipPath -Force
Remove-Item -Recurse -Force $staging

Write-Host "Packaged: $ZipPath"
