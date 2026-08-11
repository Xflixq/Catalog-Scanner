# Catalog Scanner Master

Portable master PC service for Catalog Scanner.

## What it does

- Runs a LAN API + black/white console on this PC
- Stores the shared SQLite catalog (default on this machine)
- Shows a **tether QR** for Android first-boot pairing
- Generates one-time **login codes** for other PCs
- Lets you move the database path if needed

## Run in development

From the repo root:

```bash
pnpm install
pnpm master:dev
```

Open:

- http://127.0.0.1:47821

## Windows portable package

```bash
pnpm master:build
```

Then compile `installer/CatalogScannerMaster.iss` with Inno Setup to produce an installer.

If `pkg` is installed, `build:exe` also emits `dist/CatalogScannerMaster.exe`.

## Default ports / paths

- Port: `47821`
- Windows DB: `%ProgramData%\CatalogScanner\catalog.sqlite`
- macOS/Linux DB: `~/.catalog-scanner/catalog.sqlite`

Override with env vars:

```bash
PORT=47821
CATALOG_SCANNER_DATA_DIR=C:\Data\CatalogScanner
CATALOG_SCANNER_DB_PATH=D:\Shared\catalog.sqlite
```

## Client pairing

### Android

1. Start master
2. Open Android app
3. Scan the tether QR once
4. App stores master URL + session and opens the catalog

### Other PCs (web)

1. On master console, click **Generate code**
2. On the web app, enter master URL + code
3. Catalog loads from the master database

## Bulk scan rules

- Scan many barcodes into one batch
- Choose one name (select existing or add new)
- Saving:
  - new barcode → added under that name
  - same barcode already under that name → removed
  - barcode under a different name → moved
