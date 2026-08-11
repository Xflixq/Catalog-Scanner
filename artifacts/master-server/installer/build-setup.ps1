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

# Locate Inno Setup Compiler
$isccCandidates = @(
  ${env:LOCALAPPDATA} + '\Programs\Inno Setup 6\ISCC.exe',
  ${env:ProgramFiles} + '\Inno Setup 6\ISCC.exe',
  ${env:ProgramFiles(x86)} + '\Inno Setup 6\ISCC.exe',
  'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
  'C:\Program Files\Inno Setup 6\ISCC.exe'
)
$iscc = $null
foreach ($c in $isccCandidates) {
  if ($c -and (Test-Path $c)) { $iscc = $c; break }
}
if (-not $iscc) {
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { $iscc = $cmd.Source }
}

if (-not $iscc) {
  Write-Host 'Inno Setup 6 (ISCC.exe) not found — writing portable zip.' -ForegroundColor Yellow
  Write-Host 'Install: winget install JRSoftware.InnoSetup' -ForegroundColor Yellow
  Write-PortableZip
  # Still try MSI path for users who only have WiX
  $msiScript = Join-Path $InstallerDir 'build-msi.ps1'
  if (Test-Path $msiScript) {
    Write-Host 'Also running MSI/portable helper...'
    & $msiScript
  }
  exit 0
}

Write-Host "Building Setup EXE with: $iscc"
& $iscc $Iss
if ($LASTEXITCODE -ne 0) {
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
