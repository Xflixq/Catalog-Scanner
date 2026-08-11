@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=47821"
set "URL=http://127.0.0.1:%PORT%"

if exist "%~dp0DTMInventoryMaster.exe" (
  start "DTM Inventory Master" "%~dp0DTMInventoryMaster.exe"
  timeout /t 2 /nobreak >nul
  start "" "%URL%"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  DTM Inventory Master
  echo  ----------------------
  echo  Node.js 20+ is required when the standalone .exe is not present.
  echo  Install Node from https://nodejs.org  then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0dtm-inventory-master.cjs" (
  echo Missing dtm-inventory-master.cjs next to this launcher.
  pause
  exit /b 1
)

start "DTM Inventory Master" cmd /k "cd /d ""%~dp0"" && node ""%~dp0dtm-inventory-master.cjs"""
timeout /t 2 /nobreak >nul
start "" "%URL%"
exit /b 0
