# Build CatalogScannerMaster-Setup.exe (branded black/white wizard).
# Requires Inno Setup 6 (ISCC.exe). Falls back to portable zip + MSI helper if missing.
#
# Usage (from repo root, after master bundle exists):
#   .\artifacts\master-server\installer\build-setup.ps1
#
# Optional:
#   $env:INNO_SETUP_ISCC = "C:\Path\To\ISCC.exe"

$ErrorActionPreference = 'Stop'
$InstallerDir = $PSScriptRoot
$Root = Resolve-Path (Join-Path $InstallerDir '..')
$Dist = Join-Path $Root 'dist'
$Bundle = Join-Path $Dist 'catalog-scanner-master.cjs'
$Public = Join-Path $Dist 'public'
$Iss = Join-Path $InstallerDir 'CatalogScannerMaster.iss'
$OutDir = Join-Path $Dist 'installer'

if (-not (Test-Path $Bundle)) {
  throw "Missing $Bundle. Run: pnpm master:build"
}
if (-not (Test-Path $Public)) {
  throw "Missing $Public. Run: pnpm master:build"
}
if (-not (Test-Path $Iss)) {
  throw "Missing Inno script: $Iss"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Write-PortableZip {
  $stage = Join-Path $Dist 'setup-stage'
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Copy-Item $Bundle (Join-Path $stage 'catalog-scanner-master.cjs') -Force
  Copy-Item (Join-Path $InstallerDir 'run-master.cmd') (Join-Path $stage 'run-master.cmd') -Force
  Copy-Item (Join-Path $InstallerDir 'README-INSTALL.txt') (Join-Path $stage 'README-INSTALL.txt') -Force
  Copy-Item $Public (Join-Path $stage 'public') -Recurse -Force
  if (Test-Path (Join-Path $Dist 'CatalogScannerMaster.exe')) {
    Copy-Item (Join-Path $Dist 'CatalogScannerMaster.exe') (Join-Path $stage 'CatalogScannerMaster.exe') -Force
  }
  $zip = Join-Path $OutDir 'CatalogScannerMaster-Portable.zip'
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
  Remove-Item $stage -Recurse -Force
  Write-Host "Portable zip: $zip"
}

function Find-Iscc {
  if ($env:INNO_SETUP_ISCC -and (Test-Path -LiteralPath $env:INNO_SETUP_ISCC)) {
    return $env:INNO_SETUP_ISCC
  }
  if ($env:ISCC -and (Test-Path -LiteralPath $env:ISCC)) {
    return $env:ISCC
  }

  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
    return $cmd.Source
  }

  $candidates = @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
  )
  if (${env:ProgramFiles(x86)}) {
    $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
  }

  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }

  # Registry
  $regPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($rp in $regPaths) {
    try {
      Get-ItemProperty $rp -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and ($_.DisplayName -like 'Inno Setup*') } |
        ForEach-Object {
          if ($_.InstallLocation) {
            $p = Join-Path $_.InstallLocation 'ISCC.exe'
            if (Test-Path -LiteralPath $p) { return $p }
          }
          if ($_.UninstallString) {
            $u = [string]$_.UninstallString
            if ($u -match '(?i)(.*Inno Setup[^\\/]*)[\\/]unins') {
              $p = Join-Path $Matches[1] 'ISCC.exe'
              if (Test-Path -LiteralPath $p) { return $p }
            }
          }
        }
    } catch {}
  }

  # Bounded recursive search
  foreach ($searchRoot in @(
      ${env:ProgramFiles(x86)},
      $env:ProgramFiles,
      (Join-Path $env:LOCALAPPDATA 'Programs')
    )) {
    if (-not $searchRoot -or -not (Test-Path $searchRoot)) { continue }
    try {
      $hit = Get-ChildItem -Path $searchRoot -Filter 'ISCC.exe' -Recurse -ErrorAction SilentlyContinue -Force |
        Where-Object { $_.FullName -match 'Inno' } |
        Select-Object -First 1
      if ($hit) { return $hit.FullName }
    } catch {}
  }

  return $null
}

function Find-IsccHints {
  $hits = @()
  foreach ($r in @(${env:ProgramFiles(x86)}, $env:ProgramFiles, (Join-Path $env:LOCALAPPDATA 'Programs'), 'C:\')) {
    if (-not $r -or -not (Test-Path $r)) { continue }
    try {
      $hits += Get-ChildItem -Path $r -Filter 'ISCC.exe' -Recurse -ErrorAction SilentlyContinue -Force |
        Select-Object -First 2 -ExpandProperty FullName
    } catch {}
  }
  return $hits
}

$iscc = Find-Iscc

if (-not $iscc) {
  Write-Host 'Inno Setup 6 (ISCC.exe) not found - writing portable zip.' -ForegroundColor Yellow
  Write-Host 'Install: winget install --id JRSoftware.InnoSetup -e --source winget' -ForegroundColor Yellow
  Write-Host 'Or download: https://jrsoftware.org/isdl.php' -ForegroundColor Yellow
  Write-Host 'Then set:  $env:INNO_SETUP_ISCC = "C:\Path\To\ISCC.exe"' -ForegroundColor Yellow

  $hints = Find-IsccHints
  if ($hints -and $hints.Count -gt 0) {
    Write-Host 'Found ISCC.exe at:' -ForegroundColor Cyan
    $hints | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
  } else {
    Write-Host 'No ISCC.exe found anywhere under Program Files / LocalAppData.' -ForegroundColor Yellow
    Write-Host 'winget may have registered the package without installing the compiler.' -ForegroundColor Yellow
    Write-Host 'Re-run the Inno installer GUI and ensure "Inno Setup Preprocessor" is included.' -ForegroundColor Yellow
  }

  Write-PortableZip
  $msiScript = Join-Path $InstallerDir 'build-msi.ps1'
  if (Test-Path $msiScript) {
    Write-Host 'Also running MSI/portable helper...'
    & $msiScript
  }
  exit 0
}

Write-Host "Building Setup EXE with: $iscc"
Push-Location $InstallerDir
try {
  & $iscc $Iss
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($null -eq $code) { $code = 0 }

if ($code -ne 0) {
  Write-Host "ISCC failed (exit $code) - writing portable zip fallback." -ForegroundColor Yellow
  Write-PortableZip
  exit 0
}

$setup = Join-Path $OutDir 'CatalogScannerMaster-Setup.exe'
if (Test-Path $setup) {
  Write-Host "Setup EXE ready: $setup" -ForegroundColor Green
} else {
  Write-Host 'ISCC finished but Setup EXE missing - writing portable zip.' -ForegroundColor Yellow
  Write-PortableZip
}

Write-PortableZip
