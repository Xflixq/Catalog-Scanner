@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0CatalogScannerMaster.exe" (
  start "" "%~dp0CatalogScannerMaster.exe"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required when the standalone exe is not present.
  echo Install Node 20+ or rebuild with pkg.
  pause
  exit /b 1
)

start "Catalog Scanner Master" cmd /k node "%~dp0catalog-scanner-master.cjs"
