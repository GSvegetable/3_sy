# 3_sy — Dual Rail Demo

A web preview of the two-rail card interaction from the Android Black Workspace project.

## v0.3.0 — Minimal rail-only preview

- Removed web-only search, preset buttons, headings, help text, and decorative panels.
- The preview now contains only the two card rails and their cards.
- Fixed a startup error caused by JavaScript trying to bind search events after the search field was removed.
- Kept card flip, independent rail scrolling with inertia, and horizontal preset switching.
- Kept Capacitor Haptics on supported Android builds, with browser vibration as a fallback where available.

## Online preview

https://3-sy-workspace.vercel.app

## Run locally

```bash
npm install
npm run dev
```

Create a production web build:

```bash
npm run build
```

## Android APK

```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`.

If the Android project has already been added, do not run `npx cap add android` again; run `npx cap sync android` instead.

## Porting scope and known differences

The web preview is a browser implementation, not a pixel-identical rendering of the original Android app. Android AGSL shaders and native gravity-sensor behavior do not run directly in a browser. The web version approximates card materials and transitions with CSS. Native haptic feedback is available through Capacitor on supported Android builds; browser vibration support varies by device and browser.

The current preview focuses on the two-rail layout and its core interactions. Further visual matching should be based on direct comparison with the original Android app.
