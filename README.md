# Catalog Scanner

Portable barcode catalog system:

- **Master PC** hosts the shared database and pairing console
- **Android app** pairs once with a tether QR, then bulk-scans
- **Web app** connects with a login code from the master
- **Downloads page** serves built MSI / APK / portable packages locally

Black / white UI on every surface.

## Requirements

- Node.js 20+
- pnpm
- PowerShell 7+ (`pwsh`) for the one-command build
- Optional for real MSI: [WiX Toolset](https://wixtoolset.org/) (`candle` / `light`)
- Optional for real APK: Android Studio + JDK, or EAS CLI

## Install

```bash
pnpm install
```

## One-command build (PowerShell)

From the repo root:

```powershell
pwsh -File scripts/build-all.ps1
```

Useful flags:

```powershell
pwsh -File scripts/build-all.ps1 -SkipApk
pwsh -File scripts/build-all.ps1 -StartPortal
```

This produces packages under:

- `dist/downloads/`
  - master portable zip / exe / msi (when WiX is installed)
  - Android APK (when Android SDK/EAS is available)
- `dist/downloads-portal/` small local webpage

Start the downloads page:

```powershell
pnpm downloads:dev
```

Open http://127.0.0.1:47880

## Run live

### Master PC

```bash
pnpm master:dev
```

Console: http://127.0.0.1:47821

### Android

```bash
pnpm android:dev
```

First boot: scan the master tether QR.

Bulk scan behaviour:

- aim one barcode inside the white target box
- **2 second cooldown** after each accepted scan
- last scanned code is shown clearly
- same code again removes it from the batch
- each saved item stores a **scanned date/time**

### Web (other PCs)

```bash
pnpm web:dev
```

Connect with master URL + one-time login code.

## Packaging commands

```bash
pnpm master:build      # bundle master server
pnpm master:msi        # MSI via WiX, or portable zip fallback
pnpm android:apk       # APK best-effort (EAS local / Gradle / export fallback)
pnpm downloads:build   # copy tiny downloads webpage
pnpm build:all         # full PowerShell pipeline
```

## Notes

- Default master DB: `%ProgramData%\CatalogScanner\catalog.sqlite` on Windows
- Allow inbound TCP `47821` on the master LAN firewall
- If WiX or Android SDK are missing, the build still finishes with portable fallbacks and writes README notes into `dist/downloads/`
