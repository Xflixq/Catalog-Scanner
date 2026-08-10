# Catalog Scanner

## Requirements

- Node.js 20 or newer
- pnpm
- For Android APK builds: Android Studio or the Android SDK command-line tools, plus Java and Gradle

## Install

```bash
pnpm install
```

If you need to reinstall Expo for the Android workspace, use:

```bash
pnpm --filter @workspace/catalog-scanner-android add expo
```

Do not use `npm install expo` at the repository root. This workspace is pnpm-managed and the root preinstall guard will stop npm on purpose.

## Boot the web site

The web app runs on port `20003`.

```bash
PORT=20003 BASE_PATH=/ pnpm --filter @workspace/catalog-scanner-web dev
```

Open the site at:

- http://localhost:20003/

If you want the production build instead:

```bash
PORT=20003 BASE_PATH=/ pnpm --filter @workspace/catalog-scanner-web build
PORT=20003 BASE_PATH=/ pnpm --filter @workspace/catalog-scanner-web serve
```

## Boot the Android app

The Android Expo app uses port `18900`.

```bash
PORT=18900 pnpm --filter @workspace/catalog-scanner-android dev
```

Useful checks:

```bash
pnpm --filter @workspace/catalog-scanner-android typecheck
pnpm --filter @workspace/catalog-scanner-android run build
pnpm --filter @workspace/catalog-scanner-android run serve
```

## APK build

This workspace does not include a checked-in native Android project or an EAS build configuration, so an APK cannot be produced inside this container as-is.

To build an APK on a machine that has the Android SDK installed, the usual path is:

1. Generate native Android files with Expo.
2. Open or use the generated `android/` project.
3. Run Gradle to assemble a release APK.

Example workflow:

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The APK is typically written under `android/app/build/outputs/apk/release/`.

If you want a cloud build instead, configure Expo Application Services (`eas.json`) and run an Android build from there.

## Notes

- The Android and web apps are both local-first.
- The web site is configured for the root path `/`.
- The Android static deployment uses `/catalog-scanner-android/` as its base path.
