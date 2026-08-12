# Build DTM Inventory installers.
# 1) Prefer packaged desktop apps (.exe) from build-desktop-apps.mjs
# 2) Also try MSI via WiX when available
#
# Usage:
#   pnpm master:app
#   .\artifacts\master-server\installer\build-setup.ps1

$ErrorActionPreference = 'Stop'
$TimeoutSec = 120
$InstallerDir = $PSScriptRoot
$Root = Resolve-Path (Join-Path $InstallerDir '..')
$Dist = Join-Path $Root 'dist'
$Desktop = Join-Path $Dist 'desktop'
$OutDir = Join-Path $Dist 'installer'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Copy-AppOutputs {
  if (-not (Test-Path $Desktop)) { return }
  Get-ChildItem $Desktop -Directory | ForEach-Object {
    $dir = $_.FullName
    $exe = Get-ChildItem $dir -Filter *.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
      Copy-Item $exe.FullName (Join-Path $OutDir $exe.Name) -Force
      Write-Host "EXE: $($exe.Name)"
    }
    $zipName = ($_.Name -replace '\s+', '') + '.zip'
    $zipPath = Join-Path $OutDir $zipName
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $dir '*') -DestinationPath $zipPath -Force
    Write-Host "ZIP: $zipName"
  }
}

# If desktop apps already built, collect them
Copy-AppOutputs

# MSI optional
$msiScript = Join-Path $InstallerDir 'build-msi.ps1'
if (Test-Path $msiScript) {
  Write-Host 'Attempting MSI build (optional)...'
  try {
    & $msiScript
  } catch {
    Write-Host "MSI skipped: $($_.Exception.Message)"
  }
}

Write-Host ''
Write-Host 'Installer folder:' $OutDir
Get-ChildItem $OutDir -File | ForEach-Object { Write-Host (' - {0} ({1:N0} bytes)' -f $_.Name, $_.Length) }
Write-Host 'Done.'
