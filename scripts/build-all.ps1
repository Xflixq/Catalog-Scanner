# One-command local build for Catalog Scanner packages + downloads page.
# Works in Windows PowerShell 5.1 and PowerShell 7+.
# Usage:
#   .\scripts\build-all.ps1
#   .\scripts\build-all.ps1 -SkipApk
#   .\scripts\build-all.ps1 -StartPortal

param(
  [switch]$SkipApk,
  [switch]$SkipMsi,
  [switch]$StartPortal
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Block
  )
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $Block
  if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
    throw "Step failed: $Name (exit $LASTEXITCODE)"
  }
}

function Invoke-Pnpm {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  $cmd = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if (-not $cmd) { $cmd = Get-Command pnpm -ErrorAction SilentlyContinue }
  if (-not $cmd) { throw 'pnpm not found on PATH. Install pnpm, then re-run.' }
  & $cmd.Source @Args
  if ($LASTEXITCODE -ne 0) { throw "pnpm $($Args -join ' ') failed (exit $LASTEXITCODE)" }
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root 'dist\downloads') | Out-Null

Invoke-Step 'Install dependencies' {
  Invoke-Pnpm install
}

Invoke-Step 'Typecheck clients' {
  Invoke-Pnpm --filter @workspace/catalog-scanner-android typecheck
  Invoke-Pnpm --filter @workspace/catalog-scanner-web typecheck
}

Invoke-Step 'Build master server bundle' {
  Invoke-Pnpm master:build
  $bundle = Join-Path $Root 'artifacts\master-server\dist\catalog-scanner-master.cjs'
  if (-not (Test-Path $bundle)) {
    throw "Master bundle missing after build: $bundle"
  }
  Copy-Item $bundle (Join-Path $Root 'dist\downloads\catalog-scanner-master.cjs') -Force

  $exe = Join-Path $Root 'artifacts\master-server\dist\CatalogScannerMaster.exe'
  if (Test-Path $exe) {
    Copy-Item $exe (Join-Path $Root 'dist\downloads\CatalogScannerMaster.exe') -Force
  }

  $public = Join-Path $Root 'artifacts\master-server\dist\public'
  $runCmd = Join-Path $Root 'artifacts\master-server\installer\run-master.cmd'
  $readme = Join-Path $Root 'artifacts\master-server\installer\README-INSTALL.txt'
  if (Test-Path $public) {
    $zip = Join-Path $Root 'dist\downloads\CatalogScannerMaster-Portable.zip'
    if (Test-Path $zip) { Remove-Item $zip -Force }
    $stage = Join-Path $Root 'dist\downloads\_portable-stage'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Copy-Item $bundle (Join-Path $stage 'catalog-scanner-master.cjs') -Force
    if (Test-Path $runCmd) { Copy-Item $runCmd (Join-Path $stage 'run-master.cmd') -Force }
    if (Test-Path $readme) { Copy-Item $readme (Join-Path $stage 'README-INSTALL.txt') -Force }
    Copy-Item $public (Join-Path $stage 'public') -Recurse -Force
    if (Test-Path $exe) { Copy-Item $exe (Join-Path $stage 'CatalogScannerMaster.exe') -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
    Remove-Item $stage -Recurse -Force
  }
}

if (-not $SkipMsi) {
  Invoke-Step 'Build master MSI (or portable fallback)' {
    $msiScript = Join-Path $Root 'artifacts\master-server\installer\build-msi.ps1'
    # Call the current host (powershell.exe or pwsh) — do not require pwsh.
    & $msiScript
    $msiDir = Join-Path $Root 'artifacts\master-server\dist\installer'
    if (Test-Path $msiDir) {
      Get-ChildItem $msiDir -File | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $Root 'dist\downloads' $_.Name) -Force
      }
    }
  }
}

if (-not $SkipApk) {
  Invoke-Step 'Build Android APK (best effort)' {
    try {
      Invoke-Pnpm android:apk
    } catch {
      Write-Host "Android APK step skipped/failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

Invoke-Step 'Build downloads portal' {
  Invoke-Pnpm --filter @workspace/downloads-portal build
}

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host "Packages:  $Root\dist\downloads"
Write-Host "Portal:    $Root\dist\downloads-portal"
Write-Host "Start page: pnpm downloads:dev   (http://127.0.0.1:47880)"

if ($StartPortal) {
  Invoke-Pnpm downloads:dev
}