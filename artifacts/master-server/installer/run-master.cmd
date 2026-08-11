@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=47821"
set "URL=http://127.0.0.1:%PORT%"

if exist "%~dp0CatalogScannerMaster.exe" (
  start "Catalog Scanner Master" "%~dp0CatalogScannerMaster.exe"
  timeout /t 2 /nobreak >nul
  start "" "%URL%"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Catalog Scanner Master
  echo  ----------------------
  echo  Node.js 20+ is required when the standalone .exe is not present.
  echo  Install Node from https://nodejs.org  then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0catalog-scanner-master.cjs" (
  echo Missing catalog-scanner-master.cjs next to this launcher.
  pause
  exit /b 1
)

start "Catalog Scanner Master" cmd /k "cd /d ""%~dp0"" && node ""%~dp0catalog-scanner-master.cjs"""
timeout /t 2 /nobreak >nul
start "" "%URL%"
exit /b 0
