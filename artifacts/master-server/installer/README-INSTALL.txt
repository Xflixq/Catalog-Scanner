DTM Inventory Master
====================

Install location
----------------
Default (no admin): %LOCALAPPDATA%\Programs\DTM Inventory
Admin / MSI:        %ProgramFiles%\DTMInventoryMaster

Open "DTM Inventory Master" from Start Menu or desktop.
No browser. No command prompt windows.

Database
--------
%ProgramData%\DTMInventory\catalog.sqlite
(or %LOCALAPPDATA%\DTMInventory if ProgramData is blocked)

Developers
----------
pnpm install
pnpm master:dev
pnpm setup:dev

Notes
-----
- Setup defaults to a user-writable folder (no Program Files / EPERM).
- Master GUI runs the database API under system Node.js so better-sqlite3
  matches your Node version (fixes Electron NODE_MODULE_VERSION errors).
