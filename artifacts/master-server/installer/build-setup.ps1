# Build product-style Catalog Scanner Setup (desktop GUI), not a generic wizard.
# Primary output: portable Setup folder + zip. Optional electron-packager EXE if present.
#
# Usage (from repo root after master bundle exists):
#   .\artifacts\master-server\installer\build-setup.ps1

$ErrorActionPreference = 'Stop'
$InstallerDir = $PSScriptRoot
$Root = Resolve-Path (Join-Path $InstallerDir '..')
$Dist = Join-Path $Root 'dist'
$Payload = Join-Path $Dist 'payload'
$OutDir = Join-Path $Dist 'installer'

if (-not (Test-Path $Payload)) {
  throw "Missing $Payload. Run: pnpm master:build"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Stage a portable "Setup app" folder people can zip/copy
$stage = Join-Path $Dist 'setup-app-stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item $Payload (Join-Path $stage 'payload') -Recurse -Force
Copy-Item (Join-Path $Root 'src\gui') (Join-Path $stage 'gui') -Recurse -Force
Copy-Item (Join-Path $Root 'src') (Join-Path $stage 'src') -Recurse -Force

# Launcher for Setup GUI (requires Node + electron on PATH for portable mode)
$launch = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Catalog Scanner Setup needs Node.js 20+ for the portable build.
  echo Install Node from https://nodejs.org then run this again.
  pause
  exit /b 1
)
if exist "%~dp0CatalogScannerSetup.exe" (
  start "" "%~dp0CatalogScannerSetup.exe"
  exit /b 0
)
echo Starting Catalog Scanner Setup...
npx --yes electron@33.2.1 "%~dp0src\gui\setup\main.mjs"
exit /b %ERRORLEVEL%
'@
Set-Content -Path (Join-Path $stage 'Catalog Scanner Setup.cmd') -Value $launch -Encoding ASCII

$readme = @'
Catalog Scanner Setup
=====================

This is the product Setup app (black/white), not a generic Windows wizard.

1. Double-click "Catalog Scanner Setup.cmd"
2. Continue -> choose folder -> Install Master
3. Open Master

Master is a desktop app. Phones and other PCs still pair over the local network API.
'@
Set-Content -Path (Join-Path $stage 'README.txt') -Value $readme -Encoding ASCII

$zip = Join-Path $OutDir 'CatalogScanner-Setup.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Write-Host "Setup package: $zip"

# Also emit Master portable zip
$mstage = Join-Path $Dist 'master-portable-stage'
if (Test-Path $mstage) { Remove-Item $mstage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $mstage | Out-Null
Copy-Item $Payload (Join-Path $mstage 'payload') -Recurse -Force
Copy-Item (Join-Path $Root 'src') (Join-Path $mstage 'src') -Recurse -Force
$mlaunch = @'
@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Catalog Scanner Master needs Node.js 20+ for the portable build.
  echo Install Node from https://nodejs.org then run this again.
  pause
  exit /b 1
)
if exist "%~dp0CatalogScannerMaster.exe" (
  start "" "%~dp0CatalogScannerMaster.exe"
  exit /b 0
)
npx --yes electron@33.2.1 "%~dp0src\gui\master\main.mjs"
exit /b %ERRORLEVEL%
'@
Set-Content -Path (Join-Path $mstage 'Catalog Scanner Master.cmd') -Value $mlaunch -Encoding ASCII
$mzip = Join-Path $OutDir 'CatalogScannerMaster-Portable.zip'
if (Test-Path $mzip) { Remove-Item $mzip -Force }
Compress-Archive -Path (Join-Path $mstage '*') -DestinationPath $mzip -Force
Write-Host "Master portable: $mzip"

# Copy packaged electron builds if present
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

Write-Host 'Done. Prefer CatalogScanner-Setup.zip / Catalog Scanner Setup.cmd for non-technical users.'
