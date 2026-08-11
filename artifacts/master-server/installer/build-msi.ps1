# Build a Windows MSI for Catalog Scanner Master.
# Requires WiX Toolset v3+ (candle.exe / light.exe) on PATH,
# or set $env:WIX to the WiX install root.
#
# Works in Windows PowerShell 5.1 and PowerShell 7+.
# Usage (from repo root after master bundle exists):
#   .\artifacts\master-server\installer\build-msi.ps1

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Dist = Join-Path $Root 'dist'
$Bundle = Join-Path $Dist 'catalog-scanner-master.cjs'
$Public = Join-Path $Dist 'public'
$Wxs = Join-Path $PSScriptRoot 'CatalogScannerMaster.wxs'
$OutDir = Join-Path $Dist 'installer'
$Stage = Join-Path $Dist 'msi-stage'

if (-not (Test-Path $Bundle)) {
  throw "Missing $Bundle. Run: pnpm master:build"
}
if (-not (Test-Path $Public)) {
  throw "Missing $Public. Run: pnpm master:build"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

Copy-Item $Bundle (Join-Path $Stage 'catalog-scanner-master.cjs') -Force
Copy-Item (Join-Path $PSScriptRoot 'run-master.cmd') (Join-Path $Stage 'run-master.cmd') -Force
Copy-Item (Join-Path $PSScriptRoot 'README-INSTALL.txt') (Join-Path $Stage 'README-INSTALL.txt') -Force
Copy-Item $Public (Join-Path $Stage 'public') -Recurse -Force

if (Test-Path (Join-Path $Dist 'CatalogScannerMaster.exe')) {
  Copy-Item (Join-Path $Dist 'CatalogScannerMaster.exe') (Join-Path $Stage 'CatalogScannerMaster.exe') -Force
}

$candleCmd = Get-Command candle.exe -ErrorAction SilentlyContinue
$lightCmd = Get-Command light.exe -ErrorAction SilentlyContinue
if (-not $candleCmd -and $env:WIX) {
  $candlePath = Join-Path $env:WIX 'bin\candle.exe'
  $lightPath = Join-Path $env:WIX 'bin\light.exe'
  if (Test-Path $candlePath) { $candleCmd = Get-Item $candlePath }
  if (Test-Path $lightPath) { $lightCmd = Get-Item $lightPath }
}

if (-not $candleCmd -or -not $lightCmd) {
  Write-Host 'WiX not found. Creating portable zip instead of MSI.'
  $zip = Join-Path $OutDir 'CatalogScannerMaster-Portable.zip'
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $zip -Force
  Write-Host "Wrote $zip"
  Write-Host 'Install WiX Toolset to produce a real .msi, then re-run this script.'
  exit 0
}

$candleExe = if ($candleCmd.Source) { $candleCmd.Source } else { $candleCmd.FullName }
$lightExe = if ($lightCmd.Source) { $lightCmd.Source } else { $lightCmd.FullName }

$wixobj = Join-Path $OutDir 'CatalogScannerMaster.wixobj'
& $candleExe -nologo -out $wixobj $Wxs "-dStageDir=$Stage"
if ($LASTEXITCODE -ne 0) { throw 'candle failed' }

$msi = Join-Path $OutDir 'CatalogScannerMaster.msi'
& $lightExe -nologo -out $msi $wixobj
if ($LASTEXITCODE -ne 0) { throw 'light failed' }

Write-Host "MSI ready: $msi"