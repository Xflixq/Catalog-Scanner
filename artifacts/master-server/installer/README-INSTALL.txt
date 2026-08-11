Catalog Scanner Master
======================

What this is
------------
Portable master PC service for Catalog Scanner.

- Hosts the shared SQLite database (default on this PC)
- Shows a tether QR for Android first-boot pairing
- Generates one-time login codes for other PCs
- Lets you relocate the database path if needed

Install options
---------------
A) MSI (when WiX is installed during build)
   WiX v7:  dotnet tool install -g wix
            then OPEN A NEW terminal so PATH includes %USERPROFILE%\.dotnet\tools
   WiX v3:  install WiX Toolset (candle/light) as Administrator
   1. Run CatalogScannerMaster.msi
   2. Start "Catalog Scanner Master" from the Start Menu

B) Portable zip (always produced by the build)
   1. Unzip CatalogScannerMaster-Portable.zip
   2. Double-click run-master.cmd
   3. Requires Node.js 20+ on PATH for the .cjs bundle
      (or CatalogScannerMaster.exe if pkg produced one)

3. Open the console URL shown (usually http://127.0.0.1:47821)
4. Keep this PC on while scanners / other PCs are connected

Android first boot
------------------
1. Open the Android app
2. Scan the Tether QR from the master console
3. The phone stores the master URL + session and then opens the catalog

Bulk scan tips
--------------
- Aim one barcode inside the white target box
- 2 second cooldown after each accepted scan
- Same code again removes it from the batch
- Each item stores a scanned date/time

Other PCs
---------
1. On the master console, click "Generate code"
2. On the other PC web app, enter that login code
3. The PC stays connected until the session is cleared

Database location
-----------------
Default:
  Windows: %ProgramData%\CatalogScanner\catalog.sqlite

Change it in the master console under Database. Restart the master after saving.

Firewall
--------
Allow inbound TCP 47821 (or your configured port) on the master PC LAN profile.

One-command rebuild
-------------------
From the repo root on a Windows PC:

  pwsh -File scripts/build-all.ps1

Then open the downloads page:

  pnpm downloads:dev
  http://127.0.0.1:47880
