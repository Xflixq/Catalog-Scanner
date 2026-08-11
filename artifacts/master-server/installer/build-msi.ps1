# Build a Windows MSI for Catalog Scanner Master.
# Supports:
#   - WiX Toolset v3 (candle.exe / light.exe)
#   - WiX Toolset v4/v5/v7 (`wix` CLI from `dotnet tool install -g wix`)
#
# Works in Windows PowerShell 5.1 and PowerShell 7+.
# Usage (from repo root after master bundle exists):
#   .\artifacts\master-server\installer\build-msi.ps1

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Dist = Join-Path $Root 'dist'
$Bundle = Join-Path $Dist 'catalog-scanner-master.cjs'
$Public = Join-Path $Dist 'public'
$WxsV3 = Join-Path $PSScriptRoot 'CatalogScannerMaster.wxs'
$WxsV4 = Join-Path $PSScriptRoot 'CatalogScannerMaster.wix4.wxs'
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

function Write-PortableZip {
  $zip = Join-Path $OutDir 'CatalogScannerMaster-Portable.zip'
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $zip -Force
  Write-Host "Wrote $zip"
}

# Prefer modern `wix` CLI (dotnet tool / WiX 4+)
$wixCmd = Get-Command wix -ErrorAction SilentlyContinue
if (-not $wixCmd) { $wixCmd = Get-Command wix.exe -ErrorAction SilentlyContinue }

if ($wixCmd) {
  if (-not (Test-Path $WxsV4)) {
    throw "Missing WiX v4 authoring file: $WxsV4"
  }
  $msi = Join-Path $OutDir 'CatalogScannerMaster.msi'
  if (Test-Path $msi) { Remove-Item $msi -Force }

  $wixExe = if ($wixCmd.Source) { $wixCmd.Source } else { $wixCmd.Path }
  Write-Host "Building MSI with WiX CLI: $wixExe"
  # Ensure extensions needed for shortcuts/registry are available when possible.
  try {
    & $wixExe extension add WixToolset.UI.wixext 2>$null | Out-Null
  } catch {}

  & $wixExe build $WxsV4 -d "StageDir=$Stage" -o $msi -arch x64
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'wix build failed; writing portable zip fallback.' -ForegroundColor Yellow
    Write-PortableZip
    exit 0
  }
  if (-not (Test-Path $msi)) {
    Write-Host 'wix did not produce an MSI; writing portable zip fallback.' -ForegroundColor Yellow
    Write-PortableZip
    exit 0
  }
  Write-Host "MSI ready: $msi"
  exit 0
}

# Fallback: classic WiX v3 candle/light
$candleCmd = Get-Command candle.exe -ErrorAction SilentlyContinue
$lightCmd = Get-Command light.exe -ErrorAction SilentlyContinue
if (-not $candleCmd -and $env:WIX) {
  $candlePath = Join-Path $env:WIX 'bin\candle.exe'
  $lightPath = Join-Path $env:WIX 'bin\light.exe'
  if (Test-Path $candlePath) { $candleCmd = Get-Item $candlePath }
  if (Test-Path $lightPath) { $lightCmd = Get-Item $lightPath }
}

if (-not $candleCmd -or -not $lightCmd) {
  Write-Host 'WiX not found on PATH (neither `wix` nor candle/light). Creating portable zip instead of MSI.'
  Write-Host 'Installed `dotnet tool install -g wix`? Open a NEW terminal so PATH picks up %USERPROFILE%\.dotnet\tools'
  Write-PortableZip
  exit 0
}

$candleExe = if ($candleCmd.Source) { $candleCmd.Source } else { $candleCmd.FullName }
$lightExe = if ($lightCmd.Source) { $lightCmd.Source } else { $lightCmd.FullName }

$wixobj = Join-Path $OutDir 'CatalogScannerMaster.wixobj'
& $candleExe -nologo -out $wixobj $WxsV3 "-dStageDir=$Stage"
if ($LASTEXITCODE -ne 0) { throw 'candle failed' }

$msi = Join-Path $OutDir 'CatalogScannerMaster.msi'
& $lightExe -nologo -out $msi $wixobj
if ($LASTEXITCODE -ne 0) { throw 'light failed' }

Write-Host "MSI ready: $msi"
