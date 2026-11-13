# 3_sy — Black Workspace

Cross-platform recreation of the Android Black Workspace interaction.

## v0.2.0 — Native feedback and glass transitions
- Two independently draggable card rails with inertial scrolling
- Three spatial presets, switchable with controls or horizontal swipe
- Curved card layout, glass-style cards, flip interaction, and node search
- Browser glass-ripple / champagne-frost transition inspired by the supplied AGSL shaders
- Capacitor Haptics integration for Android; browser vibration fallback where supported
- Capacitor Android wrapper and GitHub Actions workflow for building a debug APK

## Run locally
```bash
npm install
npm run dev
```
Production web build: `npm run build`.

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

GitHub Actions: **Actions → Build Android APK → Run workflow**. Download the APK from the completed workflow artifact.

## Online preview
https://3-sy-workspace.vercel.app

## Porting notes
The supplied Android `HapticEngine` is represented by Capacitor Haptics on native Android and the browser vibration API where available. The three AGSL shaders cannot execute directly in browsers: the web build recreates their visual language with CSS backdrop blur, champagne tint, edge highlights, noise texture, ripple masking, and CSS 3D card flips. This is a visual/interaction port, not a byte-for-byte shader translation.

The original Android gravity-sensor behavior and any remaining native-only integrations still require the full Android project and relevant source files. The supplied haptics and shader source has now been incorporated into this port.
