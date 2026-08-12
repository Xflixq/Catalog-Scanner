DTM Inventory - Desktop apps and installers
==========================================

Preferred end-user apps (standalone .exe)
----------------------------------------
Build on Windows:

  cd C:\dev\dtm-inventory-master
  pnpm install
  pnpm master:app

Outputs:
  artifacts\master-server\dist\desktop\DTM Inventory Master-win32-x64\DTMInventoryMaster.exe
  artifacts\master-server\dist\desktop\DTM Inventory Setup-win32-x64\DTMInventorySetup.exe
  artifacts\master-server\dist\installer\DTMInventoryMaster.exe
  artifacts\master-server\dist\installer\DTMInventorySetup.exe
  artifacts\master-server\dist\installer\DTMInventoryMaster-App-Win64.zip
  artifacts\master-server\dist\installer\DTMInventorySetup-App-Win64.zip

These .exe apps embed Electron and use the DTM cube app icon.
They boot the same UI as:

  pnpm master:dev
  pnpm setup:dev

Optional MSI
------------
  pnpm master:setup
  (requires WiX: wix accept eula)

Icon
----
src\gui\shared\brand\app.ico  (from your cube logo)
