# Build DTM Inventory installers (MSI first).
# Usage:
#   pnpm master:app
#   pwsh -File artifacts/master-server/installer/build-setup.ps1

$ErrorActionPreference = 'Stop'
$InstallerDir = $PSScriptRoot
$Root = Resolve-Path (Join-Path $InstallerDir '..')
$Dist = Join-Path $Root 'dist'
$Desktop = Join-Path $Dist 'desktop'
$OutDir = Join-Path $Dist 'installer'
$Downloads = Join-Path $Dist 'downloads'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $Downloads | Out-Null

# Prefer MSI apps
$msiApps = Join-Path $InstallerDir 'build-msi-apps.ps1'
if (Test-Path $msiApps) {
  Write-Host 'Building MSI installers...'
  & $msiApps
}

# Also keep classic payload MSI if WiX scripts exist
$msiLegacy = Join-Path $InstallerDir 'build-msi.ps1'
if (Test-Path $msiLegacy) {
  Write-Host 'Building legacy payload MSI (optional)...'
  try { & $msiLegacy } catch { Write-Host "Legacy MSI skipped: $($_.Exception.Message)" }
}

# Copy any MSI into downloads
Get-ChildItem $OutDir -Filter *.msi -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $Downloads $_.Name) -Force
  Write-Host "Published download: $($_.Name)"
}

# Copy icon
$icon = Join-Path $Root 'src\gui\shared\brand\icon-256.png'
if (Test-Path $icon) { Copy-Item $icon (Join-Path $Downloads 'icon.png') -Force }

Write-Host ''
Write-Host 'Installer folder:' $OutDir
Write-Host 'Downloads folder:' $Downloads
Get-ChildItem $Downloads -File -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host (' - {0} ({1:N0} bytes)' -f $_.Name, $_.Length)
}
