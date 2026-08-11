# Build CatalogScannerMaster-Setup.exe (branded black/white wizard).
# Requires Inno Setup 6 (ISCC.exe). Falls back to portable zip + MSI helper if missing.
#
# Usage (from repo root, after master bundle exists):
#   .\artifacts\master-server\installer\build-setup.ps1

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
  $candidates = New-Object System.Collections.Generic.List[string]

  # Explicit env override
  if ($env:INNO_SETUP_ISCC -and (Test-Path $env:INNO_SETUP_ISCC)) {
    return $env:INNO_SETUP_ISCC
  }
  if ($env:ISCC -and (Test-Path $env:ISCC)) {
    return $env:ISCC
  }

  # PATH
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { $candidates.Add($cmd.Source) }

  # Common install roots (winget / installer defaults vary)
  $roots = @(
    $env:LOCALAPPDATA,
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    'C:\Program Files',
    'C:\Program Files (x86)',
    (Join-Path $env:LOCALAPPDATA 'Programs'),
    (Join-Path $env:USERPROFILE 'AppData\Local\Programs')
  ) | Where-Object { $_ } | Select-Object -Unique

  foreach ($root in $roots) {
    foreach ($name in @('Inno Setup 6', 'Inno Setup 5', 'Inno Setup')) {
      $candidates.Add((Join-Path $root (Join-Path $name 'ISCC.exe')))
    }
  }

  # Hard-coded common absolute paths
  foreach ($p in @(
      'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
      'C:\Program Files\Inno Setup 6\ISCC.exe',
      'C:\Users\Charlie\AppData\Local\Programs\Inno Setup 6\ISCC.exe'
    )) {
    $candidates.Add($p)
  }

  # Registry uninstall keys (Inno writes these)
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
            $candidates.Add((Join-Path $_.InstallLocation 'ISCC.exe'))
          }
          if ($_.DisplayIcon) {
            $dir = Split-Path -Parent ([string]$_.DisplayIcon).Trim('"')
            if ($dir) { $candidates.Add((Join-Path $dir 'ISCC.exe')) }
          }
          if ($_.UninstallString) {
            # e.g. "C:\Program Files (x86)\Inno Setup 6\unins000.exe"
            $m = [regex]::Match([string]$_.UninstallString, '"?([^"]*Inno Setup[^"]*)\\unins', 'IgnoreCase')
            if ($m.Success) {
              $candidates.Add((Join-Path $m.Groups[1].Value 'ISCC.exe'))
            }
          }
        }
    } catch {}
  }

  # Last resort: shallow search under Program Files* for ISCC.exe (bounded)
  foreach ($searchRoot in @(
      ${env:ProgramFiles(x86)},
      $env:ProgramFiles,
      (Join-Path $env:LOCALAPPDATA 'Programs')
    )) {
    if (-not $searchRoot -or -not (Test-Path $searchRoot)) { continue }
    try {
      Get-ChildItem -Path $searchRoot -Filter 'ISCC.exe' -Recurse -ErrorAction SilentlyContinue -Force |
        Where-Object { $_.FullName -match 'Inno Setup' } |
        Select-Object -First 3 |
        ForEach-Object { $candidates.Add($_.FullName) }
    } catch {}
  }

  foreach ($c in ($candidates | Select-Object -Unique)) {
    if ($c -and (Test-Path -LiteralPath $c)) {
      return $c
    }
  }
  return $null
}

$iscc = Find-Iscc

if (-not $iscc) {
  Write-Host 'Inno Setup 6 (ISCC.exe) not found — writing portable zip.' -ForegroundColor Yellow
  Write-Host 'Install: winget install JRSoftware.InnoSetup' -ForegroundColor Yellow
  Write-Host 'Then either:' -ForegroundColor Yellow
  Write-Host '  - Open a NEW terminal and re-run this script' -ForegroundColor Yellow
  Write-Host '  - Or set:  $env:INNO_SETUP_ISCC = "C:\Path\To\ISCC.exe"' -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'Searched common Program Files / LocalAppData / registry locations.' -ForegroundColor DarkGray
  # Help the user locate it quickly
  try {
    $hits = @()
    foreach ($r in @(${env:ProgramFiles(x86)}, $env:ProgramFiles, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
      if ($r -and (Test-Path $r)) {
        $hits += Get-ChildItem -Path $r -Filter 'ISCC.exe' -Recurse -ErrorAction SilentlyContinue -Force |
          Select-Object -First 2 -ExpandProperty FullName
      }
    }
    if ($hits.Count -gt 0) {
      Write-Host 'Found ISCC.exe at:' -ForegroundColor Cyan
      $hits | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
      Write-Host 'Set $env:INNO_SETUP_ISCC to one of those paths and re-run.' -ForegroundColor Cyan
    }
  } catch {}

  Write-PortableZip
  $msiScript = Join-Path $InstallerDir 'build-msi.ps1'
  if (Test-Path $msiScript) {
    Write-Host 'Also running MSI/portable helper...'
    & $msiScript
  }
  exit 0
}

Write-Host "Building Setup EXE with: $iscc"
# Compile from the installer directory so relative asset paths resolve
Push-Location $InstallerDir
try {
  & $iscc /Q $Iss
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($code -ne 0) {
  Write-Host "ISCC failed (exit $code) — retrying without /Q for full errors..." -ForegroundColor Yellow
  Push-Location $InstallerDir
  try {
    & $iscc $Iss
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

if ($code -ne 0) {
  Write-Host 'ISCC failed — writing portable zip fallback.' -ForegroundColor Yellow
  Write-PortableZip
  exit 0
}

$setup = Join-Path $OutDir 'CatalogScannerMaster-Setup.exe'
if (Test-Path $setup) {
  Write-Host "Setup EXE ready: $setup" -ForegroundColor Green
} else {
  Write-Host 'ISCC finished but Setup EXE missing — writing portable zip.' -ForegroundColor Yellow
  Write-PortableZip
}

# Always also emit portable zip alongside the EXE
Write-PortableZip
