# 3_sy — Black Workspace

A cross-platform recreation of the Android Black Workspace interaction: two independently scrollable card rails, three animated spatial presets, curved card placement, inertial motion, card flipping, and searchable nodes.

## Current implementation
- Responsive browser experience (desktop and mobile web)
- Two independently draggable card rails with inertial scrolling
- Three spatial presets, switchable with controls or horizontal swipe
- Curved card layout, glass-style cards, flip interaction, and node search
- Capacitor Android wrapper and GitHub Actions workflow for building a debug APK

## Run locally
`npm install`
`npm run dev`

Build the web version with `npm run build`.

## Android APK
In an Android development environment:
```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```
The APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.

A GitHub Actions workflow named **Build Android APK** is included. Run it from **Actions → Build Android APK → Run workflow**; the APK is published as a workflow artifact.

## Online preview
This is a Vite project deployable on Vercel with the repository root as project root. Web deployment and Android packaging are separate targets.

## Source notes
The initial port is based on the four Kotlin source files supplied for workspace data, search matching, card visuals, and `BlackWorkspaceScreen`. Android gravity sensors, native haptics, and the custom blur-ripple shader are not yet ported. The fifth source file has not yet been received, so this is an initial functional port rather than a claim of pixel-perfect parity.
