# One-command local build for DTM Inventory packages + downloads page.
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
$TimeoutSec = 30
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root

function Join-Root {
  param([Parameter(Mandatory = $true)][string[]]$Parts)
  $p = [string]$Root
  foreach ($part in $Parts) {
    $p = Join-Path $p $part
  }
  return $p
}

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Block
  )
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  & $Block
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
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

New-Item -ItemType Directory -Force -Path (Join-Root 'dist','downloads') | Out-Null

Invoke-Step 'Install dependencies' {
  Invoke-Pnpm install
}

Invoke-Step 'Typecheck clients' {
  # Soft: incomplete drop-in trees may not include android/web packages.
  try { Invoke-Pnpm --filter @workspace/dtm-inventory-android typecheck } catch {
    Write-Host "Android typecheck skipped: $($_.Exception.Message)" -ForegroundColor Yellow
  }
  try { Invoke-Pnpm --filter @workspace/dtm-inventory-web typecheck } catch {
    Write-Host "Web typecheck skipped: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Invoke-Step 'Build master server bundle' {
  Invoke-Pnpm master:build
  $bundle = Join-Root 'artifacts','master-server','dist','dtm-inventory-master.cjs'
  if (-not (Test-Path $bundle)) {
    throw "Master bundle missing after build: $bundle"
  }
  Copy-Item $bundle (Join-Root 'dist','downloads','dtm-inventory-master.cjs') -Force

  $exe = Join-Root 'artifacts','master-server','dist','DTMInventoryMaster.exe'
  if (Test-Path $exe) {
    Copy-Item $exe (Join-Root 'dist','downloads','DTMInventoryMaster.exe') -Force
  }

  $public = Join-Root 'artifacts','master-server','dist','public'
  $runCmd = Join-Root 'artifacts','master-server','installer','run-master.cmd'
  $readme = Join-Root 'artifacts','master-server','installer','README-INSTALL.txt'
  if (Test-Path $public) {
    $zip = Join-Root 'dist','downloads','DTMInventoryMaster-Portable.zip'
    if (Test-Path $zip) { Remove-Item $zip -Force }
    $stage = Join-Root 'dist','downloads','_portable-stage'
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null
    Copy-Item $bundle (Join-Path $stage 'dtm-inventory-master.cjs') -Force
    if (Test-Path $runCmd) { Copy-Item $runCmd (Join-Path $stage 'run-master.cmd') -Force }
    if (Test-Path $readme) { Copy-Item $readme (Join-Path $stage 'README-INSTALL.txt') -Force }
    Copy-Item $public (Join-Path $stage 'public') -Recurse -Force
    if (Test-Path $exe) { Copy-Item $exe (Join-Path $stage 'DTMInventoryMaster.exe') -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
    Remove-Item $stage -Recurse -Force
  }
}

if (-not $SkipMsi) {
  Invoke-Step 'Build master MSI package' {
    $setupScript = Join-Root 'artifacts','master-server','installer','build-setup.ps1'
    $msiScript = Join-Root 'artifacts','master-server','installer','build-msi.ps1'
    if (Test-Path $setupScript) {
      & $setupScript
    } else {
      & $msiScript
    }
    $msiDir = Join-Root 'artifacts','master-server','dist','installer'
    $destDir = Join-Root 'dist','downloads'
    if (Test-Path $msiDir) {
      Get-ChildItem $msiDir -File | Where-Object { $_.Extension -ine '.zip' } | ForEach-Object {
        $dest = Join-Path $destDir $_.Name
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
      }
    }
    # Product flow is MSI-first: strip any leftover zips from downloads
    Get-ChildItem $destDir -Filter *.zip -ErrorAction SilentlyContinue | Remove-Item -Force
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
  try {
    Invoke-Pnpm --filter @workspace/downloads-portal build
  } catch {
    Write-Host "Downloads portal build skipped: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host "Packages:  $(Join-Root 'dist','downloads')"
Write-Host "Portal:    $(Join-Root 'dist','downloads-portal')"
Write-Host "Start page: pnpm downloads:dev   (http://127.0.0.1:47880)"
Write-Host "Master:     pnpm master:dev      (http://127.0.0.1:47821)"

if ($StartPortal) {
  Invoke-Pnpm downloads:dev
}
