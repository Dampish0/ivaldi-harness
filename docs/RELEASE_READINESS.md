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
| Candidate version and commit | Pending |
| Audience and supported workflows | Pending |
| Included platforms and architectures | Pending |
| Build machine, commands, and artifact names | Pending |
| SHA-256 hashes of distributed artifacts | Pending |
| Signing or notarization status | Pending |
| Previous version used for upgrade validation | Pending |
| Tester, date, and result for each platform | Pending |

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
packaged app. Install the Spectre libraries matching the Windows toolset and
architecture, then retry `bun run electron:build`. No installer has been produced
or published by this work.

## Release decision

Publish only platforms with complete candidate records and packaged checks.
Installation failure, data loss, incorrect permissions, duplicate recovery work,
and unverified upgrades block the affected platform. Keep untested platforms out
of availability claims.

Automatic checkpoints, large-file refactors, and a new automated user-flow
framework are roadmap work. Existing critical behavior still needs evidence from
the candidate build before a stable release.
