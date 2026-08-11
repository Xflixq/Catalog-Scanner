Catalog Scanner Master
======================

What this is
------------
Portable master PC service for Catalog Scanner.

- Hosts the shared SQLite database (default on this PC)
- Shows a tether QR for Android first-boot pairing
- Generates one-time login codes for other PCs
- Lets you relocate the database path if needed

Install
-------
1. Run CatalogScannerMaster-Setup.exe (built from CatalogScannerMaster.iss)
2. Launch "Catalog Scanner Master"
3. Open the console URL shown in the window (usually http://127.0.0.1:47821)
4. Keep this PC on while scanners / other PCs are connected

Android first boot
------------------
1. Open the Android app
2. Scan the Tether QR from the master console
3. The phone stores the master URL + session and then opens the catalog

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
