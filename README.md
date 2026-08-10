# Catalog Scanner

Local-first barcode catalog for web and Android (Expo).

## Requirements

- Node.js 20 or newer
- pnpm
- For Android device/emulator runs: Expo Go, or Android Studio / Android SDK for native builds

## Install

```bash
pnpm install
```

### Windows / pnpm 11 note

If install or `pnpm android:dev` fails with:

```text
ERR_PNPM_IGNORED_BUILDS Ignored build scripts: esbuild@...
```

this repo already allowlists `esbuild` in `pnpm-workspace.yaml`. Pull the latest fix, then reinstall:

```bash
pnpm install
```

If your pnpm still blocks builds, approve them once:

```bash
pnpm approve-builds
pnpm install
```

If you need to reinstall Expo for the Android workspace, use:

```bash
pnpm --filter @workspace/catalog-scanner-android add expo@~54.0.27
```

Do not use `npm install expo` at the repository root. This workspace is pnpm-managed and the root preinstall guard will stop npm on purpose.

## Boot the web site

The web app runs on port `20003`.

```bash
pnpm web:dev
```

Open the site at:

- http://localhost:20003/

## Boot the Android / Expo app

The Expo app uses port `18900` by default. Scripts are Windows-safe (no Unix `VAR=value` syntax).

```bash
pnpm android:dev
```

Useful variants:

```bash
# Tunnel when your phone is on a different network
pnpm android:dev:tunnel
# or
pnpm --filter @workspace/catalog-scanner-android run dev:tunnel

# Open Android emulator/device directly
pnpm --filter @workspace/catalog-scanner-android run dev:android

# Web preview of the Expo app
pnpm --filter @workspace/catalog-scanner-android run dev:web
```

Optional env overrides (PowerShell):

```powershell
$env:PORT=18900
$env:EXPO_PUBLIC_DOMAIN="localhost"
pnpm android:dev
```

Checks:

```bash
pnpm --filter @workspace/catalog-scanner-android typecheck
pnpm --filter @workspace/catalog-scanner-android run build
pnpm --filter @workspace/catalog-scanner-android run serve
```

## APK build

This workspace does not include a checked-in native Android project or an EAS build configuration, so an APK cannot be produced inside a plain container as-is.

To build an APK on a machine that has the Android SDK installed:

```bash
cd artifacts/catalog-scanner-android
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The APK is typically written under `android/app/build/outputs/apk/release/`.

For a cloud build, configure Expo Application Services (`eas.json`) and run an Android build from there.

## Notes

- The Android and web apps are both local-first.
- The web site is configured for the root path `/`.
- The Android static deployment uses `/catalog-scanner-android/` as its base path.
- Keep Expo on SDK 54 (`expo@~54.0.27`) for the Android app. Do not install Expo 57 at the repo root.
