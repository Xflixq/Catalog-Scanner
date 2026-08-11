# DTM Inventory

Desktop Master app, Android scanner, and web client for shared inventory cataloging.

## Brand

- Name: **DTM Inventory**
- Primary: `#293588`
- Surfaces: white / soft `#EEF0F8`
- Logo: `artifacts/master-server/src/gui/shared/brand/logo.png`

## Quick start (Windows)

```powershell
pnpm install
pnpm master:dev    # Master desktop GUI
pnpm setup:dev     # Product setup GUI
pnpm android:dev
pnpm web:dev
```

## Build MSI

```powershell
pnpm master:build
pnpm master:setup
# artifacts/master-server/dist/installer/DTMInventoryMaster.msi
```

## Data

Windows default DB: `%ProgramData%\DTMInventory\catalog.sqlite`
