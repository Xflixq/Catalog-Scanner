# Build DTM Inventory product packages.
# Primary user deliverable: DTMInventoryMaster.msi
# External tools hard-capped at 30 seconds by build-msi.ps1.

$ErrorActionPreference = 'Stop'
$TimeoutSec = 30
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

$msiScript = Join-Path $InstallerDir 'build-msi.ps1'
if (Test-Path $msiScript) {
  Write-Host 'Building MSI (primary package, 30s tool timeout)...'
  & $msiScript
} else {
  throw 'build-msi.ps1 missing'
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
