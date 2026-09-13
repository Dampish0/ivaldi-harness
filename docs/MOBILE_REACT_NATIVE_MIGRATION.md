# React Native migration

Approved on 12 September 2026 after the native interaction comparison. The native implementation is in `experiments/mobile-native` while the replacement is being validated. It now targets real Ivaldi servers. The installed candidate keeps its separate application ID so the existing mobile app and credentials remain available during migration.

## What is reused

- The existing Ivaldi server and official OpenCode SDK, pinned to the same SDK version as shared UI.
- The shared pairing-v2 parser and encrypted relay implementation. `generate-portable.mts` copies the canonical source and records SHA-256 hashes. Native code must not edit the generated copies.
- Desktop theme colors, icon paths, Selawik typeface, and every existing language catalog.
- The server's sessions, models, agents, tools, approvals, and question contracts. Switching the client does not move or recreate server conversations.

## Native ownership

The connection adapter owns HTTP request fidelity, bearer headers, aborts, relay lifetime, identity probes and secure token storage. Only an explicit Connect action redeems a scanned or pasted link. Existing saved connections can restore automatically. Pairing secrets are single-use and never persisted. Long-lived tokens never enter URLs or ordinary app preferences.

One chat controller belongs to one connected runtime. It owns conversation state, drafts, live subscriptions and mutations. Switching runtimes disposes that controller and its transports. Server-side work continues when the phone sleeps; returning refreshes history and live status. The mobile app never infers a running response from persisted messages.

Drafts, mode, model selection, agent selection and favorites are stored per connection. Writes are serialized and flushed on background/disposal. A failed fetch preserves previously loaded conversations. A send with an unknown outcome retains its draft and message identity and requests authoritative history; it is not automatically submitted again.

Native views own navigation, text input, keyboard movement, drawer and sheet gestures, disclosures, message rendering and file selection. Work/Developer is a persistent preference in sidebar settings. Opening the sidebar never focuses its search input. Search requires an explicit tap.

## Migration checklist

These rows distinguish implementation from acceptance on a physical device. Phone results belong in the validation record below.

| Capability | Implementation |
| --- | --- |
| Saved connections, address/password/token | Native adapter and secure storage |
| Pairing link, camera QR, explicit confirmation | Native screen, shared parser |
| Direct transport and encrypted relay | Native HTTP plus shared relay client |
| Reconnect after background or stream failure | Native lifecycle and SDK event stream |
| Real chat history and project grouping | Native views and SDK global session pages |
| Expand/collapse projects and nested archive | Native retained disclosures |
| New chats and project conversations | Existing server directories and SDK creation |
| Model, provider, effort and agent selection | Real server catalog with native pickers |
| Send, stream, stop | SDK prompt, events, history reconciliation and abort |
| Drafts and file attachments | Native text input and document picker |
| Markdown, code, reasoning and tool output | Native message views |
| Permissions and questions | Native responses to existing SDK requests |
| Rename, archive and restore | Existing SDK mutations |
| Language and light/dark appearance | Existing catalogs and semantic colors |
| File/editor, Changes and terminal | Existing mobile workspace retained through Files and tools on direct connections; file listing exercised |
| Rich document extraction and generated previews | Pending reuse of existing document pipeline |
| Voice, notifications and background delivery | Pending native platform integration |
| Full settings, plugins, MCP and integrations management | Missing native pages. Retained web implementations are reached indirectly through Files and tools on direct connections; individual management flows still need acceptance |
| App identity replacement and credential transfer | Pending acceptance and signing plan |
| iOS | Not built or validated in this Windows task |

## Acceptance

For Settings work and remaining feature coverage, read the [Capacitor/native comparison](MOBILE_CAPACITOR_NATIVE_PARITY.md). It records the inspected Settings gap, preference ownership differences, retained-web limitations and implementation order.

The replacement is accepted per completed flow, not because the project compiles. Use the bundled release-mode APK on the Android emulator for repeatable functional checks. Verify cold start, connect, open existing history, a real streamed answer, stop, model changes, draft persistence, repeated drawer/keyboard handoffs, nested folders, attachments, background/resume and connection failure. Verify approval and question replies with deterministic test requests before trusting them for consequential actions. The physical phone is no longer needed for this development loop; device frame performance remains a later acceptance check.

Keep the current mobile app installed until these flows pass. A local native candidate is not a GitHub release or a claim of complete feature parity.

## Validation record, 12 and 13 September 2026

The first connected Android build was installed alongside Capacitor on the Samsung S24 Ultra. It opened real desktop history, including reasoning and tool output. A new conversation returned the requested real response, `Native connection works.` The phone connected through USB forwarding to the running desktop server.

Testing moved to the existing Android 35 `IvaldiReleaseQa` emulator when the user said the phone would be unplugged. The test scripts now default to that emulator and require an explicit serial to touch a physical phone.

The direct fixture exercised the real native adapter and official SDK. Pairing redeemed once, subsequent requests authenticated, streamed replies arrived, the native Stop button reached the abort endpoint, a permission reply arrived as `once`, and a question reply arrived as `Passed`. A draft survived model selection and a full app restart. Opening the sidebar left Android's input state at `mInputShown=false`.

The encrypted fixture uses the production JavaScript host handshake and tunnel dispatcher. It verified native ECDH, HKDF and AES-GCM, pairing, saved authentication, creating a conversation, streamed replies and files selected through Android's document picker. The final native build sent another attachment successfully. Request counters reached three prompts, two file attachments and no rejected authentication requests.

Testing caught three platform boundaries before this build was packaged. React Native Request has no readable body property, its Response constructor cannot construct a streaming response, and its window global lacks DOM wake events. Native adapters now handle request serialization and response lifetime explicitly. The native relay disables DOM wake listeners. A shared regression test covers reconnect and disposal without DOM events.

The document picker waits for the UI-thread keyboard and composer collapse before opening Android's document activity. Repeated cancellation exposed a second problem. React state and animated values were closed, but Android restored an earlier expanded composer. The native build disables Reanimated's settled-animation React synchronization, which has an [upstream reproduction of stale styles after Android resume](https://github.com/software-mansion/react-native-reanimated/issues/9574). The [feature flag documentation](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/) explains its registry optimization and required native rebuild. Large-list performance still needs measurement with this setting. The emulator recording exercises the sidebar, repeated project expansion, sidebar search, composer and model sheet.

The contained workspace loaded the running desktop server's existing mobile app and file listing. It currently requires a direct connection. The old workspace does not honor a direct Settings route consistently, so the candidate exposes one Files and tools entry. It does not present that route as a native Settings implementation.

The APK includes arm64 and x86_64 and runs without Metro. It uses a local debug signing key in a release-mode build. The existing Capacitor installation and credentials are preserved. No GitHub release was published for this candidate.

With the settled-animation optimization disabled, three consecutive picker cancellations returned the composer to the same collapsed bounds, `[37, 2190, 1043, 2316]`, on the 1080 by 2400 emulator. Android reported the keyboard hidden and the editor unfocused each time. Selecting and sending a file also retained the correct bottom position. Screenshots and synthetic request counters are in `experiments/mobile-native/artifacts`.

The final interaction recording covers project expansion and collapse, explicit sidebar search, composer focus, model selection, and opening the drawer from the keyboard. A separate 1.3 font-scale check kept the header and composer controls readable; the emulator was restored to 1.0. Android gfxinfo recorded 337 frames, a 32 ms 95th percentile, and 23 missed frame deadlines, 6.82 percent. This run used the emulator's SwiftShader renderer and screen recording. It is a diagnostic baseline, not a phone smoothness claim. Shutting down the encrypted fixture retained the conversation and the app remained open.

The local APK is `artifacts/mobile-motion/ivaldi-native-0.2.0-android.apk`, SHA-256 `3d2b7ecdecfa29a49945b9aea764e4bc5e95734b43898ff3f574f3701125f5a2`.

Static and contract checks passed: native type-check, 16 native runtime tests, 34 shared pairing/relay tests, repository workspace type-check and lint, plus ESLint and oxlint on authored native code. The non-blocking dead-code report still lists existing workspace backlog, including two unused files and 222 exports. These checks do not establish device frame performance or complete feature parity.

The build remains a migration candidate. Complete native settings, document extraction and generated previews, notification/voice integration, automatic switching between direct and relay candidates, and iOS acceptance are outstanding. The Work/Developer preference controls the current UI and the retained workspace; parity with every desktop composer enrichment and workflow has not been established. Large histories, large project lists and motion on the actual phone still need broader acceptance. Emulator recordings do not prove physical-device frame performance.

## Visual corrections in 0.2.1

The [native visual review](MOBILE_NATIVE_VISUAL_REVIEW.md) records the next pass. It corrects composer layout and draft visibility, attachment controls, model sheets, landscape keyboard behavior, sidebar clutter, Settings navigation, Markdown formatting and connection setup. Successful pairing now records a digest so Android Activity recreation can restore the connection without replaying a consumed link.

The updated local APK is `artifacts/mobile-motion/ivaldi-native-0.2.1-android.apk`, SHA-256 `d5d9d63ee30af60b7337a8c8dbd97c0cdbacc36ec9fe42ec95994a36fd6fb879`. It is version code 3, uses the same separate application ID and local signing key, and was installed and exercised on the Android 35 emulator. The review contains the validation details and limits for this build.

## Layout revision in 0.2.2

The [visual review](MOBILE_NATIVE_VISUAL_REVIEW.md) now records the composer and navigation redesign. Model selection is in the header, attachment/send controls share a baseline, and menus, pickers, connection setup and request panels follow consistent spacing. Native request panels remain visible with empty conversation history. Advanced workspace tools still use the existing web implementation.

The local acceptance APK is `artifacts/mobile-motion/ivaldi-native-0.2.2-android.apk`, version code 4, SHA-256 `24ea4f42d8dbb23a3a65aae2ca4bed664cb91a1f959ec53dc6c76ed2d63080fa`. It was installed on the Android 35 emulator. The visual review records checks and platform limits.

## Conversation interactions in 0.2.3

The [visual review](MOBILE_NATIVE_VISUAL_REVIEW.md) records the next conversation pass. It adds a keyboard-aware return-to-latest control, code headers and copy actions, copy confirmation, attachment cards, and distinct work/retry feedback. It also fixes the composer's landscape background. The final emulator checks include clipboard round trips, history position, rotation, permission/question responses, Stop and a streamed reply.

The local acceptance APK is `artifacts/mobile-motion/ivaldi-native-0.2.3-android.apk`, version code 5, SHA-256 `92ee491b67e79291bc6035f141a092072a3b9400974425c614d89b1a33b7d0c3`. The visual review contains the recording, frame sample and remaining platform limits.

## Image attachments in 0.2.4

The [visual review](MOBILE_NATIVE_VISUAL_REVIEW.md) records native draft/history thumbnails and full-screen image viewing, including pinch, double-tap, pan, zoom controls, rotation and failed-preview recovery. It documents the local-picker and embedded-image boundary. Remote and Markdown image resolution remain outstanding.

The local acceptance APK is `artifacts/mobile-motion/ivaldi-native-0.2.4-android.apk`, version code 6, SHA-256 `5487a521e46d6858d6906c61a0430fc50d8b610b022318f791d25eb8dc9c6d2c`. The Android emulator exercised the final attachment, preview, Back and send flow. The review contains the recording, static checks and platform limits.

## References

- [Expo streaming fetch](https://docs.expo.dev/versions/v57.0.0/sdk/expo/)
- [Expo document picker](https://docs.expo.dev/versions/v57.0.0/sdk/document-picker/)
- [Native WebCrypto coverage](https://github.com/margelo/react-native-quick-crypto/blob/main/.docs/implementation-coverage.md)
