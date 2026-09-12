# Ivaldi Mobile

Capacitor shell for the dedicated Ivaldi mobile web interface.

The mobile package reuses the web build, then rewrites `mobile.html` to `index.html` in `packages/mobile/dist` so native iOS/Android always launch `MobileApp` instead of the hosted surface selector.

## Runtime Model

- The native app bundles the mobile UI only; it does not embed the Ivaldi web server or OpenCode server.
- On first launch in Capacitor, the app shows a connection screen for an existing Ivaldi server.
- Pairing QR scans and pasted links accept `ivaldi://connect` and legacy `openchamber://connect` links. Mobile builds predating the Ivaldi prefix need an update to read newly generated links.
- Connections are saved locally in the app and can be managed from `Instances` in the sessions drawer footer (a persistent left sidebar on tablets).
- The connection screen and the `Instances` entry are Capacitor-only. Hosted `mobile.html` in a normal browser keeps the regular web behavior.
- Phones use a chats/projects drawer with a dismissible backdrop. Its header contains search and an icon-only New chat action. The footer shows the current mode and opens a menu with Work and Developer choices, Files and tools, and project management. Instances and Settings remain footer shortcuts. Work keeps Files, Notes, and MCP in the workspace and skips Git/worktree discovery used only for developer presentation. Developer also adds Changes and Terminal. Tablets retain resizable sidebars and their existing responsive Settings navigation.
- The conversation header has Menu, the conversation title or Ivaldi, and a compose icon. Developer also has a workspace shortcut. Mode selection uses the same device-local store as desktop. An ordinary managed-chat draft does not inherit a project subtitle from the last active project. Workspace tabs retain text labels when inactive.
- Both modes use the compact resting composer on phones. Tapping it focuses the shared editor. Expanded Work keeps attachment, model, and the primary action in one footer and omits permanent permission and goal controls. Developer retains its additional controls. Tablets and hardware keyboards keep the expanded editor. Switching modes preserves the current draft and execution capability.
- Mobile Work groups per-message actions and execution metadata behind a disclosure. Developer retains the detailed footer. Work's model picker puts the current model first, followed by provider sections and favorites without duplicates. Thinking and favorite controls for the selected model live in the footer. Model context limits and capability badges remain in Developer's picker. The phone welcome shows two starters with the full editable list behind Show more.
- Native installs default to bundled Selawik, Microsoft's open-source replacement for Segoe UI, to approximate the Windows desktop typography. Saved font choices are preserved. Appearance exposes the interface font on phones, and Reset uses the native default. Desktop and hosted browser defaults remain System.
- `useMobilePanelPresence` owns reversible sheet and drawer transitions. Sheets fade with 16 pixels of travel over 180 milliseconds; drawers use 220 milliseconds. Closed sheets immediately release Back and focus and become inert, then unmount after the transition. Reduced motion skips travel and the exit delay.
- `mobileBackNavigation.ts` routes Android Back through the top `MobileOverlayPanel` before the active page's nested handlers. Files handles the open file, search, and parent folder; Changes handles its open diff; compact Settings handles detail navigation. Register through `useMobileBackHandler` only while the owning page or overlay is active.
- `useMobileModalFocus.ts` owns focus trapping, Escape, scroll locking, and focus restoration for full-screen pages, phone drawers, and picker panels. Retained closed drawers are inert. The tablet workspace panel handles Escape locally so it cannot dismiss a dialog above it.
- Mobile configuration recovery re-runs initialization when project settings arrive after connection bootstrap. An unavailable model list offers retry and provider settings; an unmatched search is a separate state.
- The history drawer lists managed Chats before Projects, using the existing session ordering, pagination, child expansion, and swipe actions. Chats do not require a registered project. Workspace tab selection scrolls into view when mode changes add or remove tabs.
- Files resets its route on runtime or effective-project changes and rejects late listing/search results after navigation. Listing and search failures offer Retry. Closing the drawer preserves its route within the same project. Changes also resets its diff route on project changes and shares `ImageDiffViewer` with desktop for original/modified image comparisons.
- The tablet layout is a live size class (`useTabletLayout`), not a device check: any surface whose short side is at least 600px gets it, and the workspace only becomes a side panel where the width can host the sidebar, the panel and a readable chat at once. Book foldables therefore pick it up when unfolded, keep the portrait layout in both orientations (their long side is barely wider than a tablet's short one), and drop back to the phone layout when folded shut. The Android activity declares the matching `configChanges`, so folding resizes the WebView instead of recreating it.
- Password-protected Ivaldi servers can be unlocked from the mobile app. The app stores the issued client token with the saved connection.
- In Developer mode, the Terminal workspace runs its PTY on the active Ivaldi server over the shared authenticated runtime transport; it never opens a local shell on the phone or tablet. Closing the terminal detaches the renderer while the server session remains available for reattachment. On touch devices, dragging scrolls the buffer while long-pressing and dragging selects terminal text.

## Commands

Run these from `packages/mobile`, or use the root `mobile:*` aliases.

- `bun run build`: builds `packages/web` and prepares mobile web assets.
- `bun run build:assets`: prepares mobile assets from an existing `packages/web/dist` build; the root workspace build uses this to avoid rebuilding web.
- `bun run sync`: prepares assets and runs `cap sync`.
- `bun run add:ios`: creates the native iOS project.
- `bun run add:android`: creates the native Android project.
- `bun run build:android:debug`: builds a debug Android APK without launching an emulator.
- `bun run build:ios:simulator`: builds an iOS Simulator app without launching Xcode or Simulator.
- `bun run sim:run`: boots a simulator if needed, installs the built iOS app, and launches it.
- `bun run sim:dev`: one-command dev loop — builds the simulator app, installs + launches it, starts the `serve-sim` stream, and prints the preview URL; Ctrl+C stops the stream. Pass `--no-build` to skip the build step.
- `bun run sim:serve`: starts `serve-sim` in detached JSON mode and prints the browser preview URL.
- `bun run sim:list`: lists running `serve-sim` streams.
- `bun run sim:kill`: stops running `serve-sim` streams.
- `bun run open:ios`: opens the iOS project.
- `bun run open:android`: opens the Android project.

## Headless Quickstart

```sh
bun run build
bun run sync
bun run build:ios:simulator
bun run build:android:debug
```

These commands build and sync the native projects without launching Xcode, Android Studio, Simulator, or an emulator.

## Android preview package

The Android package ID is `dev.ivaldi.mobile`, with version code `12002` for 1.20.1 preview 2. It uses the same release key as preview 1, so that published APK updates in place. The older 1.20.0 preview used a different key and requires reinstalling. Retain the 1.20.1 release key for every subsequent update. The distributable APK is a signed release build, not the debug APK. Build it after preparing and syncing the web assets:

```sh
bun run build
bunx cap sync android
cd android
./gradlew assembleRelease
```

Set `IVALDI_ANDROID_KEYSTORE_PATH`, `IVALDI_ANDROID_KEYSTORE_PASSWORD`, `IVALDI_ANDROID_KEY_ALIAS`, and `IVALDI_ANDROID_KEY_PASSWORD` in the build environment before the Gradle command. Keep the signing key and password outside the repository and back them up securely. Future updates to `dev.ivaldi.mobile` must use the same signing key and a higher version code. Verify the resulting `android/app/build/outputs/apk/release/app-release.apk` with Android SDK `apksigner` before publishing it. A build without those variables is unsigned and must not be distributed.

The existing iOS native project has not been migrated to the new package ID or validated for this preview. Do not treat the Android result as an iOS release check.

## Local Tooling

The default scripts assume the local Homebrew/Xcode paths prepared for this workspace:

- Xcode: `/Applications/Xcode.app/Contents/Developer`
- JDK 21: `/opt/homebrew/opt/openjdk@21`
- Android SDK: `/opt/homebrew/share/android-commandlinetools`

Override `DEVELOPER_DIR`, `JAVA_HOME`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT` when using a different local setup.

Required local tools:

- Xcode with iOS Simulator support.
- CocoaPods for iOS dependency installation.
- JDK 21 for Android Gradle builds.
- Android SDK command-line tools with platform/build-tools 35.

## Troubleshooting

- If `xcodebuild` reports that the active developer directory is Command Line Tools, keep using the provided scripts or set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- If Android builds fail with `Unable to locate a Java Runtime` or `source release: 21`, install/use JDK 21 and set `JAVA_HOME` accordingly.
- If Android SDK packages are missing, install `platform-tools`, `platforms;android-35`, and `build-tools;35.0.0`, then accept SDK licenses.
- If CocoaPods cannot find Capacitor pods after reinstalling dependencies, run `bun install` from the workspace root, then rerun `bun run sync`.
- If connecting to a remote Ivaldi server fails from the app while `/health` works in curl, check that the server build includes the packaged-client CORS allowlist for `capacitor://localhost` and local dev origins.
- If `serve-sim` preview says the stream is not producing frames, check the raw MJPEG stream before assuming the simulator stopped. In prior testing the raw stream worked while the browser preview UI stayed stale.

## Generated Assets

Launcher and notification icon sources live under `packages/mobile/assets/`. Keep those sources and the generated iOS/Android assets in sync when the product icon changes.

## Push notifications

Android builds apply the Google Services plugin only when `android/app/google-services.json` exists. The repository does not include a Firebase configuration. Create an Ivaldi-owned Firebase project, register the Android package used by the build, and place its downloaded configuration at that path for local or release builds that need push notifications. Git ignores the file because it identifies the owning Firebase project.

Without that file, Android still builds and runs, but push registration is unavailable. Keep Firebase service-account credentials in the relay deployment, never in this repository.
