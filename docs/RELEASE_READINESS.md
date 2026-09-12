# Ivaldi stable release readiness

The target is a stable release. Packaged installation, restart recovery, and
upgrade validation remain required. Larger refactors and product scope decisions
are tracked in [futureJourneys.md](../futureJourneys.md).

## Manual distribution

Ivaldi releases belong to [Dampish0/ivaldi-harness](https://github.com/Dampish0/ivaldi-harness/releases).
There are no GitHub Actions workflows. Builds, validation, review, and publishing
are manual. Desktop automatic updates are disabled; users install newer Ivaldi
builds while retaining application data. Workspace packages use `@ivaldi/*` and
the VS Code extension uses `dampish0.ivaldi`. npm and Marketplace publication
require separate release setup and are not implied by these names.

Run local validation on the reviewed checkout, commit the intended changes, and
build each platform from that same commit. Use `bun run electron:build` on the
target platform. See the [desktop prerequisites](../packages/electron/README.md#platform-notes).
No branch or tag push automatically builds or publishes artifacts.

## Candidate record

A result from an earlier checkout does not validate a later candidate.

| Field | Evidence |
| --- | --- |
| Candidate version and commit | 1.20.1, tag `v1.20.1-preview.1`; exact source commit in release verification attachment |
| Audience and supported workflows | Public preview for agent sessions and review; not a stable-release sign-off |
| Included platforms and architectures | Windows x64, Linux x64, Android release APK, VS Code VSIX |
| Build machine, commands, and artifact names | Windows native and Ubuntu 24.04 WSL x64; commands and artifact names in `VERIFICATION.md` on the release |
| SHA-256 hashes of distributed artifacts | `SHA256SUMS.txt` on the release |
| Signing or notarization status | Windows unsigned; Android signed with the new Ivaldi release key; Linux and VSIX unsigned |
| Previous version used for upgrade validation | Windows QA profile retained across reinstall of the final 1.20.1 candidate; 1.20.0 upgrade not validated. Android 1.20.0 requires reinstall because the key changed. |
| Tester, date, and result for each platform | Codex, 2026-09-12. Windows installer and backend passed; Linux extracted AppImage and backend passed; Android install, conversation, and restart passed; VSIX packaging passed. |

## 1.20.1 preview checks, 2026-09-12

The final Windows NSIS installer installed into a test directory and launched the packaged `openchamber-ui://app/index.html` page. Onboarding saved a QA name; the final rebuilt installer retained that name and returned HTTP 200 from its backend. The Linux x64 AppImage passed architecture, bundled OpenCode 1.18.23, and native-module verification. Its extracted application reached onboarding and returned HTTP 200 under WSLg. Direct FUSE execution and a conventional Linux desktop install remain untested.

Linux first launch exposed an Electron ASAR limitation in `fs.cpSync` while installing the bundled original skill. The installer now traverses the directory through ASAR-aware reads. Both desktop packages were rebuilt after the fix. The original-skill tests passed, and Linux then launched in a fresh profile.

The Android 1.20.1 APK has package ID `dev.ivaldi.mobile`, version code `12001`, and a new signing key. Its signature was verified. On an Android 15 x64 emulator it installed, connected to the demo server, displayed the actual agent conversation and changes, and retained its connection and conversation after force-stop and restart. The old 1.20.0 signature cannot be upgraded in place.

Workspace type-check and lint passed. Script tests passed in 2 files, UI tests in 337 files, VS Code tests in 26 files, and Electron tests in 17 files. Web full-suite runs each reported 1 failing timing-sensitive SSE test, with 1,765 passing tests and 3 skipped. The proxy and event-stream tests passed separately, 19 and 9 tests respectively. This is an unresolved full-suite limitation, not a clean test-suite result. The changed original-skill module passed its 3 tests. Dead-code inspection retained the existing 2 unused files, 222 exports, 163 exported types, and 1 duplicate export. Documentation validation passed for 460 pages and 46 sidebar links.

The README now uses promotional compositions based on a populated demo, with links to the original captures. A real OpenCode session built Atlas, added keyboard shortcuts, checked JavaScript syntax, and reviewed accessibility. The desktop capture uses production web assets; the mobile capture comes from the signed APK. See `docs/images/README.md` for image provenance and prompts.

## Public preview correction, 2026-09-12

The first public preview, `v1.20.0-rc.1`, had a Windows startup failure. Its installer was removed from the GitHub release. The installed log identified a missing `zod` package imported by the web server's lifecycle-hook configuration. `@ivaldi/web` now declares `zod` as a production dependency so the Electron package includes it. The corrected unpacked app started its loopback server and bundled OpenCode CLI in an isolated test profile before the final UI rebuild. The final NSIS installer has been rebuilt, but installation and launch of that final installer still need a native smoke test.

The Android preview uses package ID `dev.ivaldi.mobile` and version code `12000`. Its release APK is signed with a key kept outside this repository. On an Android 15 x64 emulator, the signed APK installed, launched, connected by address to an isolated Ivaldi server, displayed its example project, opened Settings, and retained the connection after force-stop and restart. This check used an ADB loopback connection. Physical-device installation, remote HTTPS, QR pairing, and provider-backed conversations remain untested. Firebase is not configured, so push notifications are unavailable. The iOS native project is outside this preview and has not been migrated or validated.

The root README screenshots were captured from this candidate using a separate test profile. The desktop layout was captured in a browser using the same production web assets staged into Electron. The mobile Settings screenshot comes from the signed APK in the emulator. The example project was created in the app; no screenshot labels were synthesized or replaced. The localized Projects heading is visible in the desktop capture. It still needs a visual check in the final installed Windows package.

Package inspection also found that bundling `electron-log` embedded the build machine's absolute directory in its preload initialization. It now stays external and resolves its installed package directory at runtime. The rebuilt ASAR contains `electron-log` and `zod`, and its main bundle no longer contains the private build path. Windows remains unsigned. Final installer launch is a publication gate; a successful build or archive inspection does not satisfy it.

## Build checks

- [ ] Run the repository's build, type-check, lint, and test scripts on the candidate commit.
- [ ] Run Electron architecture and updater tests.
- [ ] Build the native installer for every platform being released.
- [ ] Run `verify:opencode-cli:packaged` from the Electron package.
- [ ] For Linux, run `verify:linux-appimage` on the final AppImage.
- [ ] Inspect font-resolution and chunk warnings; check affected content in the packaged app.

The workspace build does not package Electron. Electron's `type-check` checks
main/preload syntax, and its `lint` script is currently a no-op. Record those limits.

## Packaged app checks

Use a disposable project and OS account or test machine. Test the actual installer.

- [ ] Install and launch without a separate OpenCode CLI. Confirm Ivaldi identity, version, and bundled runtime.
- [ ] Configure a provider, send a first message, and receive a complete response.
- [ ] Stop an active turn and confirm it stays stopped.
- [ ] Close and reopen the app. Confirm projects, messages, drafts, and provider configuration remain available.
- [ ] Exercise Manual, Auto, and Full access; confirm permission behavior matches the displayed mode.
- [ ] Review a file change and open the correct file in the correct project.
- [ ] If remote or mobile access is included, pair, disconnect, and reconnect. Confirm sessions and pending requests return.
- [ ] Install over the previous Ivaldi version. Confirm data is retained and the new version launches.
- [ ] Confirm automatic updates stay disabled and manual update instructions identify the correct artifacts.
- [ ] Record failures and retest fixes on the rebuilt candidate.

## Restart recovery gate

The server discovers active goals at startup and reconnect, then checks live
parent/child activity and the transcript. Failed reads retry. Paused, settled,
archived, and child sessions are excluded. Counters survive recovery.

A persisted continuation marker prevents automatic replay when delivery is
uncertain. An idle unfinished turn blocks for inspection. Send a message to
continue an interrupted conversation before resuming its goal. Restore a missing
objective file or edit the objective before resuming a goal blocked for that reason.

- [ ] Restart with an idle active goal. Confirm one continuation or a correct audit settlement without a new user event.
- [ ] Restart during parent or child work. Confirm live work is not interrupted or duplicated.
- [ ] Disconnect the event stream, let a turn finish, then reconnect. Confirm recovery observes the missed completion.
- [ ] Confirm paused, blocked, completed, budget-limited, and archived goals retain their state.
- [ ] Simulate an interrupted turn and lost prompt response. Confirm a visible reason and recovery action without automatic replay.
- [ ] Pause or stop during an audit. Confirm no later continuation is sent.
- [ ] Verify permission prompts, questions, objective files, and token/turn limits across restart.

Recovery runs in the web server, including Electron's backend and servers used by
mobile clients. Extension-only VS Code displays goals but does not run this loop.
Multiple independent Ivaldi servers must not control goals on the same upstream;
the upstream metadata API has no atomic dispatch claim. State these limits in
release notes and define which configurations the release supports.

## Merged source validation, 2026-09-09

The release-readiness branch integrates local `main` while retaining Ivaldi's Work-mode presentation, three permission modes, restart recovery, manual distribution, and separate package identity. The merge adopts the upstream split sidebar, shortcut registration, and chat timeline modules.

| Check | Result |
| --- | --- |
| Full workspace build, type-check, and lint | Passed |
| Full tests | Passed: 2 script files, 335 UI files, 26 VS Code files, 17 Electron files, and 174 web files. Web reported 1,763 passed tests and 3 skipped. |
| Draft variant and permission regression | Passed, 7 tests, including explicit variant inheritance and Work-mode permissions |
| Electron main bundle, server syntax, and CLI help | Passed |
| Docs validation and frozen dependency install | Passed, 460 pages and 46 sidebar links; no lockfile changes required |
| Merge-file oxlint review | 327 findings; each flagged source line also exists in a merge parent. No rules were disabled. |
| Final identity audit | Ivaldi VSIX packaged; web updater defaults no longer contact upstream. All 15 package-manager tests passed. |
| Final dead-code report | Inspected: 2 unused files, 222 unused exports, 163 unused exported types, and 1 duplicate export |
| GitHub CI/CD | No tracked workflow files; release publication remains manual |
| Native installation, restart, and upgrade journeys | Not validated; the Windows build prerequisite below remains unresolved |

These are source and build checks. They do not establish stable-release readiness or prove native installation and provider-backed recovery.

## Earlier packaging evidence, 2026-09-08

These results cover the earlier release-readiness checkout. They are retained to
identify the packaging blocker and are not a completed candidate record.

| Check | Result |
| --- | --- |
| Goal and event-stream tests | Passed, 58 tests across 9 files, including local HTTP/SSE integration |
| Web package type-check and lint | Passed |
| Electron architecture and updater tests | Passed, 38 and 18 tests respectively |
| Electron main bundle and changed server syntax | Passed; the server remains external to the main bundle |
| New recovery module and tests, oxlint | Passed |
| Existing goal runtime, oxlint | 60 findings on pre-existing statements; no findings on new statements |
| Dead-code report after CI cleanup | Inspected; 2 unused files, 222 unused exports, 157 unused exported types, and 1 duplicate export; no new recovery file or export reported |
| Docs validation | Passed, 460 pages and 46 sidebar links |
| Repository cleanup checks | Zero GitHub workflow files; 35 local documentation links resolve; CLI syntax/help and diff whitespace checks passed |
| Earlier production web build and desktop staging | Passed with font-resolution and chunk warnings |
| Windows Computer Use helper and staged OpenCode CLI | Passed with .NET 10.0.301 and OpenCode 1.18.21 |
| Windows installer build | Blocked by MSB8040, missing Visual Studio Spectre-mitigated C++ libraries |
| Packaged install, recovery, permissions, and upgrade checks | Not run |
| Full workspace build, lint, and tests | Superseded by the merged source validation above |

The recovery integration uses a local upstream fixture, not a real provider or
packaged app. At the time of this earlier record, the missing Spectre libraries
blocked the Windows installer. Later preview builds resolved that packaging
prerequisite; the candidate above records their remaining validation gaps.

## Release decision

Publish only platforms with complete candidate records and packaged checks.
Installation failure, data loss, incorrect permissions, duplicate recovery work,
and unverified upgrades block the affected platform. Keep untested platforms out
of availability claims.

Automatic checkpoints, large-file refactors, and a new automated user-flow
framework are roadmap work. Existing critical behavior still needs evidence from
the candidate build before a stable release.
