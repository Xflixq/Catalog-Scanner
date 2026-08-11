DTM Inventory Master
======================

End users
---------
Run DTMInventoryMaster.msi

That installs Master on this PC. Open "DTM Inventory Master" from the Start Menu.
No browser. No command prompt windows.

What Master does
----------------
- Hosts the shared catalog database
- Shows the Android tether QR
- Creates login codes for other PCs

Database
--------
Windows default: %ProgramData%\DTMInventory\catalog.sqlite

Firewall
--------
Allow inbound TCP 47821 on the master PC LAN profile.

Developers
----------
pnpm master:dev    Master desktop GUI
pnpm setup:dev     Product-style setup GUI
pnpm master:build
pnpm master:setup  Builds MSI
