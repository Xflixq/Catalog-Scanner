# Build DTMInventoryMaster.msi (primary end-user package).
# Supports WiX v7 `wix` CLI and classic candle/light.
# External tools are hard-capped at 30 seconds.

$ErrorActionPreference = 'Stop'
$TimeoutSec = 30
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Dist = Join-Path $Root 'dist'
$Bundle = Join-Path $Dist 'dtm-inventory-master.cjs'
$Payload = Join-Path $Dist 'payload'
$Src = Join-Path $Root 'src'
$WxsV3 = Join-Path $PSScriptRoot 'DTMInventoryMaster.wxs'
$WxsV4 = Join-Path $PSScriptRoot 'DTMInventoryMaster.wix4.wxs'
$OutDir = Join-Path $Dist 'installer'
$Stage = Join-Path $Dist 'msi-stage'

function Invoke-Timed {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [Parameter(Mandatory=$true)][string[]]$ArgumentList,
    [string]$Name = 'process'
  )
  $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -PassThru -NoNewWindow
  if (-not $p.WaitForExit($TimeoutSec * 1000)) {
    try { $p.Kill() } catch {}
    throw "$Name timed out after ${TimeoutSec}s"
  }
  return $p.ExitCode
}

if (-not (Test-Path $Bundle) -and -not (Test-Path (Join-Path $Payload 'dtm-inventory-master.cjs'))) {
  throw "Missing bundle. Run: pnpm master:build"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

if (Test-Path $Bundle) {
  Copy-Item $Bundle (Join-Path $Stage 'dtm-inventory-master.cjs') -Force
} elseif (Test-Path (Join-Path $Payload 'dtm-inventory-master.cjs')) {
  Copy-Item (Join-Path $Payload 'dtm-inventory-master.cjs') (Join-Path $Stage 'dtm-inventory-master.cjs') -Force
} elseif (Test-Path (Join-Path $Dist 'catalog-scanner-master.cjs')) {
  Copy-Item (Join-Path $Dist 'catalog-scanner-master.cjs') (Join-Path $Stage 'dtm-inventory-master.cjs') -Force
}

$srcSource = $Src
if (Test-Path (Join-Path $Payload 'src')) { $srcSource = Join-Path $Payload 'src' }
Copy-Item $srcSource (Join-Path $Stage 'src') -Recurse -Force

Copy-Item (Join-Path $PSScriptRoot 'Launch Master.vbs') (Join-Path $Stage 'Launch Master.vbs') -Force
Copy-Item (Join-Path $PSScriptRoot 'run-master.cmd') (Join-Path $Stage 'run-master.cmd') -Force
Copy-Item (Join-Path $PSScriptRoot 'README-INSTALL.txt') (Join-Path $Stage 'README-INSTALL.txt') -Force

$public = Join-Path $Stage 'public'
New-Item -ItemType Directory -Force -Path $public | Out-Null
Set-Content -Path (Join-Path $public 'index.html') -Value '<!doctype html><title>DTM Inventory</title>' -Encoding ASCII
Set-Content -Path (Join-Path $public 'styles.css') -Value 'body{font-family:sans-serif}' -Encoding ASCII
Set-Content -Path (Join-Path $public 'app.js') -Value '/* desktop app */' -Encoding ASCII

if (Test-Path (Join-Path $Dist 'DTMInventoryMaster.exe')) {
  Copy-Item (Join-Path $Dist 'DTMInventoryMaster.exe') (Join-Path $Stage 'DTMInventoryMaster.exe') -Force
}

function Fail-NoMsi([string]$msg) {
  Write-Host $msg
  Write-Host 'MSI is required for the product flow. Install WiX and re-run.'
  Write-Host '  dotnet tool install -g wix'
  Write-Host '  wix accept eula'
  exit 1
}

$wixCmd = Get-Command wix -ErrorAction SilentlyContinue
if (-not $wixCmd) { $wixCmd = Get-Command wix.exe -ErrorAction SilentlyContinue }

if ($wixCmd) {
  if (-not (Test-Path $WxsV4)) { throw "Missing $WxsV4" }
  $msi = Join-Path $OutDir 'DTMInventoryMaster.msi'
  if (Test-Path $msi) { Remove-Item $msi -Force }
  $wixExe = if ($wixCmd.Source) { $wixCmd.Source } else { $wixCmd.Path }
  Write-Host "Building MSI with WiX CLI: $wixExe"
  try { & $wixExe accept eula 2>$null | Out-Null } catch {}
  $code = Invoke-Timed -FilePath $wixExe -Name 'wix build' -ArgumentList @('build', $WxsV4, '-d', "StageDir=$Stage", '-o', $msi, '-arch', 'x64')
  if ($code -ne 0 -or -not (Test-Path $msi)) { Fail-NoMsi "wix build failed (exit $code)." }
  Write-Host "MSI ready: $msi"
  exit 0
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
  Fail-NoMsi 'WiX not found on PATH.'
}

$candleExe = if ($candleCmd.Source) { $candleCmd.Source } else { $candleCmd.FullName }
$lightExe = if ($lightCmd.Source) { $lightCmd.Source } else { $lightCmd.FullName }
$wixobj = Join-Path $OutDir 'DTMInventoryMaster.wixobj'
$code = Invoke-Timed -FilePath $candleExe -Name 'candle' -ArgumentList @('-nologo', '-out', $wixobj, $WxsV3, "-dStageDir=$Stage")
if ($code -ne 0) { Fail-NoMsi 'candle failed' }
$msi = Join-Path $OutDir 'DTMInventoryMaster.msi'
$code = Invoke-Timed -FilePath $lightExe -Name 'light' -ArgumentList @('-nologo', '-out', $msi, $wixobj)
if ($code -ne 0 -or -not (Test-Path $msi)) { Fail-NoMsi 'light failed' }
Write-Host "MSI ready: $msi"
