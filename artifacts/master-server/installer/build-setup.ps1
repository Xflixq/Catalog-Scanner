# Build DTM Inventory product packages.
# Primary user deliverable: DTMInventoryMaster.msi
# Setup GUI is for in-product install experience during development.
#
# Usage:
#   .\artifacts\master-server\installer\build-setup.ps1

$ErrorActionPreference = 'Stop'
$InstallerDir = $PSScriptRoot
$Root = Resolve-Path (Join-Path $InstallerDir '..')
$Dist = Join-Path $Root 'dist'
$Payload = Join-Path $Dist 'payload'
$OutDir = Join-Path $Dist 'installer'
$Bundle = Join-Path $Dist 'dtm-inventory-master.cjs'

if (-not (Test-Path $Bundle) -and -not (Test-Path $Payload)) {
  throw "Missing build output. Run: pnpm master:build"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Always try MSI first (no zip-first flow)
$msiScript = Join-Path $InstallerDir 'build-msi.ps1'
if (Test-Path $msiScript) {
  Write-Host 'Building MSI (primary package)...'
  & $msiScript
} else {
  Write-Host 'build-msi.ps1 missing'
}

# Copy any desktop EXEs if electron-packager produced them
$desktop = Join-Path $Dist 'desktop'
if (Test-Path $desktop) {
  Get-ChildItem $desktop -Directory | ForEach-Object {
    $exe = Get-ChildItem $_.FullName -Filter *.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
      Copy-Item $exe.FullName (Join-Path $OutDir $exe.Name) -Force
      Write-Host "Copied $($exe.Name)"
    }
  }
}

# Remove legacy zip packages from downloads-facing installer folder
Get-ChildItem $OutDir -Filter *.zip -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Removing zip package $($_.Name) (MSI-first product flow)"
  Remove-Item $_.FullName -Force
}

$msi = Join-Path $OutDir 'DTMInventoryMaster.msi'
if (Test-Path $msi) {
  Write-Host "Primary package ready: $msi"
} else {
  Write-Host 'MSI was not produced. Install WiX (wix accept eula) and rebuild.'
}

Write-Host 'Done.'
