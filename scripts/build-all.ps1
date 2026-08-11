# One-command local build for Catalog Scanner packages + downloads page.
# Usage:
#   pwsh -File scripts/build-all.ps1
#   pwsh -File scripts/build-all.ps1 -SkipApk
#   pwsh -File scripts/build-all.ps1 -StartPortal

param(
  [switch]$SkipApk,
  [switch]$SkipMsi,
  [switch]$StartPortal
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root

function Invoke-Step($Name, [scriptblock]$Block) {
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $Block
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root 'dist/downloads') | Out-Null

Invoke-Step 'Install dependencies' {
  pnpm install
}

Invoke-Step 'Typecheck clients' {
  pnpm --filter @workspace/catalog-scanner-android typecheck
  pnpm --filter @workspace/catalog-scanner-web typecheck
}

Invoke-Step 'Build master server bundle' {
  pnpm master:build
  $bundle = Join-Path $Root 'artifacts/master-server/dist/catalog-scanner-master.cjs'
  if (Test-Path $bundle) {
    Copy-Item $bundle (Join-Path $Root 'dist/downloads/catalog-scanner-master.cjs') -Force
  }
  $exe = Join-Path $Root 'artifacts/master-server/dist/CatalogScannerMaster.exe'
  if (Test-Path $exe) {
    Copy-Item $exe (Join-Path $Root 'dist/downloads/CatalogScannerMaster.exe') -Force
  }
  $public = Join-Path $Root 'artifacts/master-server/dist/public'
  if (Test-Path $public) {
    $zip = Join-Path $Root 'dist/downloads/CatalogScannerMaster-Portable.zip'
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path @(
      $bundle,
      (Join-Path $Root 'artifacts/master-server/installer/run-master.cmd'),
      (Join-Path $Root 'artifacts/master-server/installer/README-INSTALL.txt'),
      $public
    ) -DestinationPath $zip -Force
  }
}

if (-not $SkipMsi) {
  Invoke-Step 'Build master MSI (or portable fallback)' {
    pwsh -File (Join-Path $Root 'artifacts/master-server/installer/build-msi.ps1')
    $msiDir = Join-Path $Root 'artifacts/master-server/dist/installer'
    if (Test-Path $msiDir) {
      Get-ChildItem $msiDir -File | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $Root 'dist/downloads' $_.Name) -Force
      }
    }
  }
}

if (-not $SkipApk) {
  Invoke-Step 'Build Android APK (best effort)' {
    pnpm android:apk
  }
}

Invoke-Step 'Build downloads portal' {
  pnpm --filter @workspace/downloads-portal build
}

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host "Packages:  $Root\dist\downloads"
Write-Host "Portal:    $Root\dist\downloads-portal"
Write-Host "Start page: pnpm downloads:dev   (http://127.0.0.1:47880)"

if ($StartPortal) {
  pnpm downloads:dev
}
