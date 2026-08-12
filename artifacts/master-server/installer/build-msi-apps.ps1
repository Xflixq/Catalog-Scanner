# Build MSI installers for packaged Master + Setup desktop apps.
# Requires: pnpm master:app first, and WiX v4+ (`wix` on PATH) OR classic candle/light.
# Outputs:
#   dist/installer/DTMInventoryMaster.msi
#   dist/installer/DTMInventorySetup.msi
#   dist/downloads/*.msi

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Dist = Join-Path $Root 'dist'
$Desktop = Join-Path $Dist 'desktop'
$OutDir = Join-Path $Dist 'installer'
$Downloads = Join-Path $Dist 'downloads'
$Icon = Join-Path $Root 'src\gui\shared\brand\app.ico'
$TimeoutSec = 300

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $Downloads | Out-Null

function Find-AppDir([string]$match) {
  if (-not (Test-Path $Desktop)) { return $null }
  Get-ChildItem $Desktop -Directory | Where-Object {
    $exe = Get-ChildItem $_.FullName -Filter $match -File -ErrorAction SilentlyContinue | Select-Object -First 1
    return $null -ne $exe
  } | Select-Object -First 1 -ExpandProperty FullName
}

function Invoke-Timed {
  param([string]$FilePath, [string[]]$ArgumentList, [string]$Name = 'process')
  $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -PassThru -NoNewWindow -WorkingDirectory $OutDir
  if (-not $p.WaitForExit($TimeoutSec * 1000)) {
    try { $p.Kill() } catch {}
    throw "$Name timed out after ${TimeoutSec}s"
  }
  return $p.ExitCode
}

function Build-MsiWithHeat {
  param(
    [Parameter(Mandatory=$true)][string]$AppDir,
    [Parameter(Mandatory=$true)][string]$ProductName,
    [Parameter(Mandatory=$true)][string]$OutMsi,
    [Parameter(Mandatory=$true)][string]$UpgradeCode,
    [Parameter(Mandatory=$true)][string]$ExeName,
    [string]$Scope = 'perMachine',
    [string]$InstallParent = 'ProgramFiles64Folder',
    [string]$InstallName = 'DTM Inventory'
  )

  $wix = Get-Command wix -ErrorAction SilentlyContinue
  if (-not $wix) { $wix = Get-Command wix.exe -ErrorAction SilentlyContinue }
  if (-not $wix) { throw 'WiX CLI (wix) not found. Install: dotnet tool install --global wix' }

  $stage = Join-Path $Dist ("msi-stage-" + ($ProductName -replace '\s+',''))
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Copy-Item (Join-Path $AppDir '*') $stage -Recurse -Force

  $harvested = Join-Path $OutDir (($ProductName -replace '\s+','') + '.harvest.wxs')
  $mainWxs = Join-Path $OutDir (($ProductName -replace '\s+','') + '.main.wxs')

  # Harvest full app tree
  $wixExe = if ($wix.Source) { $wix.Source } else { $wix.Path }
  try { & $wixExe extension add WixToolset.Heat 2>$null | Out-Null } catch {}
  $code = Invoke-Timed -FilePath $wixExe -Name 'wix harvest' -ArgumentList @(
    'harvest', 'dir', $stage,
    '-o', $harvested,
    '-platform', 'x64',
    '-cg', 'HarvestedFiles',
    '-dr', 'INSTALLFOLDER',
    '-srd',
    '-sreg',
    '-scom',
    '-indent', '2'
  )
  if ($code -ne 0 -or -not (Test-Path $harvested)) {
    # Fallback: package only the main exe if harvest unsupported
    Write-Host 'Harvest unavailable; packaging main executable only.'
    @"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="$ProductName" Manufacturer="DTM" Version="1.3.1" UpgradeCode="$UpgradeCode" Scope="$Scope">
    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />
    <MediaTemplate EmbedCab="yes" />
    <Icon Id="AppIcon" SourceFile="$($Icon.Replace('\','\\'))" />
    <Property Id="ARPPRODUCTICON" Value="AppIcon" />
    <StandardDirectory Id="$InstallParent">
      <Directory Id="INSTALLFOLDER" Name="$InstallName" />
    </StandardDirectory>
    <StandardDirectory Id="ProgramMenuFolder">
      <Directory Id="ApplicationProgramsFolder" Name="DTM Inventory" />
    </StandardDirectory>
    <Feature Id="Main" Title="$ProductName" Level="1">
      <Component Directory="INSTALLFOLDER" Guid="*">
        <File Source="$($stage.Replace('\','\\'))\$ExeName" KeyPath="yes" />
        <Shortcut Id="StartMenuShortcut" Directory="ApplicationProgramsFolder" Name="$ProductName"
          Target="[INSTALLFOLDER]$ExeName" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon" />
        <RemoveFolder Id="RemoveSm" Directory="ApplicationProgramsFolder" On="uninstall" />
        <RegistryValue Root="HKCU" Key="Software\DTM\$($ProductName -replace '\s+','')" Name="installed" Type="integer" Value="1" />
      </Component>
    </Feature>
  </Package>
</Wix>
"@ | Set-Content -Path $mainWxs -Encoding UTF8
    if (Test-Path $OutMsi) { Remove-Item $OutMsi -Force }
    $code = Invoke-Timed -FilePath $wixExe -Name 'wix build' -ArgumentList @('build', $mainWxs, '-o', $OutMsi, '-arch', 'x64', '-ext', 'WixToolset.UI.wixext')
    if ($code -ne 0 -or -not (Test-Path $OutMsi)) {
      # retry without UI ext
      $code = Invoke-Timed -FilePath $wixExe -Name 'wix build' -ArgumentList @('build', $mainWxs, '-o', $OutMsi, '-arch', 'x64')
    }
    if ($code -ne 0 -or -not (Test-Path $OutMsi)) { throw "MSI build failed for $ProductName" }
    return
  }

  @"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <Package Name="$ProductName" Manufacturer="DTM" Version="1.3.1" UpgradeCode="$UpgradeCode" Scope="$Scope">
    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />
    <MediaTemplate EmbedCab="yes" />
    <Icon Id="AppIcon" SourceFile="$($Icon.Replace('\','\\'))" />
    <Property Id="ARPPRODUCTICON" Value="AppIcon" />
    <StandardDirectory Id="$InstallParent">
      <Directory Id="INSTALLFOLDER" Name="$InstallName" />
    </StandardDirectory>
    <StandardDirectory Id="ProgramMenuFolder">
      <Directory Id="ApplicationProgramsFolder" Name="DTM Inventory" />
    </StandardDirectory>
    <Feature Id="Main" Title="$ProductName" Level="1">
      <ComponentGroupRef Id="HarvestedFiles" />
      <Component Directory="INSTALLFOLDER" Guid="*">
        <Shortcut Id="StartMenuShortcut" Directory="ApplicationProgramsFolder" Name="$ProductName"
          Target="[INSTALLFOLDER]$ExeName" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon" />
        <RemoveFolder Id="RemoveSm" Directory="ApplicationProgramsFolder" On="uninstall" />
        <RegistryValue Root="HKCU" Key="Software\DTM\$($ProductName -replace '\s+','')" Name="installed" Type="integer" Value="1" KeyPath="yes" />
      </Component>
    </Feature>
  </Package>
</Wix>
"@ | Set-Content -Path $mainWxs -Encoding UTF8

  if (Test-Path $OutMsi) { Remove-Item $OutMsi -Force }
  $code = Invoke-Timed -FilePath $wixExe -Name 'wix build' -ArgumentList @('build', $mainWxs, $harvested, '-o', $OutMsi, '-arch', 'x64')
  if ($code -ne 0 -or -not (Test-Path $OutMsi)) { throw "MSI build failed for $ProductName" }
  Write-Host "MSI ready: $OutMsi"
}

$masterDir = Find-AppDir 'DTMInventoryMaster.exe'
$setupDir = Find-AppDir 'DTMInventorySetup.exe'
if (-not $masterDir -and -not $setupDir) {
  throw 'No packaged apps found. Run: pnpm master:app'
}

if ($masterDir) {
  $msi = Join-Path $OutDir 'DTMInventoryMaster.msi'
  Build-MsiWithHeat -AppDir $masterDir -ProductName 'DTM Inventory Master' -OutMsi $msi `
    -UpgradeCode '8F3C2A11-6B9E-4D2F-9C71-1A0E5B8D4F22' -ExeName 'DTMInventoryMaster.exe' `
    -Scope 'perMachine' -InstallParent 'ProgramFiles64Folder' -InstallName 'DTM Inventory Master'
  Copy-Item $msi (Join-Path $Downloads 'DTMInventoryMaster.msi') -Force
}

if ($setupDir) {
  $msi = Join-Path $OutDir 'DTMInventorySetup.msi'
  Build-MsiWithHeat -AppDir $setupDir -ProductName 'DTM Inventory Setup' -OutMsi $msi `
    -UpgradeCode '9A4D3B22-7C0F-5E3A-AD82-2B1F6C9E5A33' -ExeName 'DTMInventorySetup.exe' `
    -Scope 'perUser' -InstallParent 'LocalAppDataFolder' -InstallName 'DTM Inventory Setup'
  Copy-Item $msi (Join-Path $Downloads 'DTMInventorySetup.msi') -Force
}

Write-Host ''
Write-Host 'MSI outputs:'
Get-ChildItem $OutDir -Filter *.msi -ErrorAction SilentlyContinue | ForEach-Object { Write-Host (' - ' + $_.FullName) }
Get-ChildItem $Downloads -Filter *.msi -ErrorAction SilentlyContinue | ForEach-Object { Write-Host (' - ' + $_.FullName) }
