# Catalog Scanner

Portable barcode catalog system:

- **Master PC** hosts the shared database and pairing console
- **Android app** pairs once with a tether QR, then bulk-scans
- **Web app** connects with a login code from the master

Black / white UI on every surface.

## Requirements

- Node.js 20+
- pnpm
- For Android device runs: Expo Go (or Android SDK for native builds)
- For Windows master installer: Inno Setup (optional), and optionally `pkg` for a standalone `.exe`

## Install

```bash
pnpm install
```

### Windows / pnpm 11 note

If install fails with `ERR_PNPM_IGNORED_BUILDS` for esbuild, this repo already allowlists it in `pnpm-workspace.yaml`. Re-run:

```bash
pnpm install
```

## 1) Start the master PC

```bash
pnpm master:dev
```

Open the console:

- http://127.0.0.1:47821

On that page you can:

- show the **Android tether QR**
- generate **login codes** for other PCs
- change the **database path**

Default DB location:

- Windows: `%ProgramData%\CatalogScanner\catalog.sqlite`
- macOS/Linux: `~/.catalog-scanner/catalog.sqlite`

### Windows installer / exe

```bash
pnpm master:build
```

Then build `artifacts/master-server/installer/CatalogScannerMaster.iss` with Inno Setup.

If `pkg` is available, `master:build` also creates `artifacts/master-server/dist/CatalogScannerMaster.exe`.

## 2) Boot Android

```bash
pnpm android:dev
```

On first launch:

1. Scan the master **tether QR**
2. The app stores the master URL + session
3. Use **Scan barcodes** for bulk capture
4. Choose one name (select existing or add new)
5. Save the batch

Rules:

- scanning the same code again in the current batch removes it
- saving a barcode that already exists under the same name removes it from the catalog

## 3) Boot web (other PCs)

```bash
pnpm web:dev
```

Open http://localhost:20003 and connect with:

1. master URL (example `http://192.168.0.5:47821`)
2. one-time login code from the master console

## Catalog behaviour

- Catalog is grouped by product name
- Expand a group to see every barcode
- No “stored locally” labels — data lives on the master (or the configured DB path)

## Useful checks

```bash
pnpm --filter @workspace/catalog-scanner-android typecheck
pnpm --filter @workspace/catalog-scanner-web typecheck
pnpm --filter @workspace/master-server typecheck
```

## Notes

- Keep the master PC online while scanners / other PCs are connected
- Allow inbound TCP `47821` (or your configured port) on the master LAN firewall
- Android and web both use the same black/white finish as the master console
