Catalog Scanner Master
======================

This product is a desktop app (black/white GUI). There is no browser console.

Apps
----
1) Catalog Scanner Setup
   Product-style setup app (same design as Master).
   Installs Master onto this PC.

2) Catalog Scanner Master
   Day-to-day app:
   - Tether QR for Android
   - Login codes for other PCs
   - Shared catalog database
   - Live grouped catalog

Portable packages
-----------------
- CatalogScanner-Setup.zip
  Run "Catalog Scanner Setup.cmd"

- CatalogScannerMaster-Portable.zip
  Run "Catalog Scanner Master.cmd"

Dev
---
  pnpm install
  pnpm master:dev     # Master GUI
  pnpm setup:dev      # Setup GUI
  pnpm master:api     # headless pairing API only

Network
-------
Master still listens on the LAN port (default 47821) so phones and other PCs
can pair. Users never open that URL in a browser.

Database
--------
Windows default: %ProgramData%\CatalogScanner\catalog.sqlite
Change inside Master -> Storage.
