DTM Inventory Master
====================

Install location
----------------
Default (no admin): %LOCALAPPDATA%\Programs\DTM Inventory
Admin / MSI:        %ProgramFiles%\DTMInventoryMaster

Open "DTM Inventory Master" from the Start Menu or desktop shortcut.
No browser. No command prompt windows.

What Master does
----------------
- Hosts the shared inventory database
- Shows the Android tether QR
- Creates login codes for other PCs

Database
--------
Windows default: %ProgramData%\DTMInventory\catalog.sqlite
  (or %LOCALAPPDATA%\DTMInventory if ProgramData is blocked)

Firewall
--------
Allow inbound TCP 47821 on the master PC LAN profile.

Developers
----------
pnpm install
pnpm master:dev
pnpm setup:dev
pnpm master:build
pnpm master:setup

Note: Master GUI runs the database API under system Node.js so native
modules match your installed Node (avoids Electron ABI errors).
