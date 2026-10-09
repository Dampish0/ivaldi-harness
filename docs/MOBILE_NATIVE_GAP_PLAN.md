# Native mobile gaps and next changes

Reviewed 15 September 2026 against native 0.2.11 and the current Capacitor/shared source, then updated through 0.2.15 registered projects on 22 September. This is the current work list. The [earlier Settings comparison](MOBILE_CAPACITOR_NATIVE_PARITY.md) preserves the original 0.2.4 baseline and subsequent implementation history. Installed evidence belongs in the [visual review](MOBILE_NATIVE_VISUAL_REVIEW.md).

## Assessment

The native app is still a migration candidate. Its chat, keyboard and navigation can improve independently of the old WebView, but it does not yet replace the old app's workflows. The framework change did not carry those workflows over automatically. Repeated visual passes have left larger holes in navigation, configuration and capability.

The main product problem is inconsistency. Some settings affect this phone, some affect one saved connection, others affect the server or a selected project. The retained web tools introduce another navigation stack and separate browser preferences. A user should not have to understand those implementation details to find a setting or return to a chat.

Keep React Native and finish complete user journeys. Reuse the existing server APIs, validation, labels, icons and themes. The desktop's restrained design is the reference. On a phone that means readable text, generous touch targets, a quiet composer, clear Back behavior and infrequent choices tucked into Settings. Copying every desktop control into the sidebar would recreate clutter.

## Current coverage

"Native" below means an implementation exists. It does not claim that every device, error case or animation has passed acceptance. "Web tools" means the retained whole mobile web app on direct connections; it is not an equivalent native destination and does not work over the native encrypted relay.

| User workflow | Native 0.2.15 coverage | Gap to close |
| --- | --- | --- |
| Connect to a server | Pairing, QR, manual address, saved connections, authentication, direct and encrypted relay connection paths | Recovery diagnostics, LAN/relay handover on network changes, acceptance on the phone after sleep and network loss |
| Change device preferences | System/Light/Dark, Selawik/system font, size, density, language and chat display, including before connecting and after failed reconnect | Theme palettes, code font, time format and week start are absent |
| Keep Work/Developer consistent | Mode lives in General and is saved per connection | Desktop treats mode as a device preference. Align that policy deliberately, preserving the current choice when migrating saved connections |
| Configure new chats | Server model, effort and agent defaults; per-chat selections | Project defaults, auxiliary models, retention and complete default precedence |
| Configure providers | Search, supported authentication, visibility and guarded custom-provider editor | Quota detail, remaining advanced fields and config-layer choice. Editing requires a compatible host |
| Choose the Settings project | Independent registered-project picker | Add, rename, remove or configure projects; browse host folders; manage worktrees |
| Configure agents and tools | Existing agent selection; web tools for much configuration | Native agent definitions, permissions, behavior, commands, hooks, MCP, plugins, skills and integrations |
| Find and organize chats | Search, managed chats, animated folders and archives; registered project names, host order and empty projects with local registry Retry; targeted row rename/archive/restore with retained edits | Child chats, worktree grouping, chat-list loading/retry and search scope |
| Send and follow up | Text, local attachments, model/effort/agent, streaming, Stop, questions and permissions | Queue and steer while busy, mentions, slash commands, goal/plan and permission controls |
| Read and act on messages | Markdown, code copy, reasoning/tools, local and embedded raster preview | Remote image handling, broader document preparation, fork/revert, context pinning and richer message actions |
| Use project tools | Authenticated retained web app with retry on direct connections | Open the requested Files, Notes, Changes or Terminal destination, preserve its route, and return without a second app shell |
| Use voice and notifications | No native integration | Permission handling, recording/playback, actual notification delivery, background behavior and preference pages |
| Use a tablet or foldable | Responsive phone overlays and rotation | Persistent navigation and an intentional wider workspace layout |
| Identify the installed app | Separate native candidate package | About/version diagnostics, update path, release signing and deliberate credential/data transfer before replacing Capacitor |

Source anchors: [Capacitor page allowlist](../packages/ui/src/apps/mobileSettingsPages.ts), [native Settings](../experiments/mobile-native/src/components/SettingsScreen.tsx), [sidebar](../experiments/mobile-native/src/components/Sidebar.tsx), [chat controller](../experiments/mobile-native/src/runtime/chat.ts), [workspace loader](../experiments/mobile-native/src/runtime/workspace.ts), [image handling](../experiments/mobile-native/src/runtime/images.ts), and [native ownership and acceptance](../experiments/mobile-native/README.md).

## First pass

- [x] Open the same native device Settings from the connection screen, including after failed reconnect. Keep appearance, chat display and language available without a runtime. Hide unavailable server destinations from navigation and search. Preserve connection forms when returning.
- [x] Reduce sidebar header clutter and improve project-row hierarchy. Keep New chat as a small compose action, distinguish archives from projects, and show project compose actions where the project is expanded. Preserve folder animation, search focus policy and active-chat visibility.
- [x] Correct unreadable status-bar icons when connection/device Settings use light mode.
- [x] Keep sidebar search results usable above the landscape keyboard at large text sizes. Dismissal must restore navigation and retain the query.
- [x] Validate the installed APK in both themes, larger system text, portrait and landscape. Check explicit search focus, keyboard dismissal, nested Back, interrupted connection attempts and preference persistence. Record the APK identity and the actual device used.

All three installed acceptance phases passed on 0.2.12 in the Android 15 emulator. The [0.2.12 review](MOBILE_NATIVE_VISUAL_REVIEW.md#device-settings-and-sidebar-cleanup-version-0212) links the screenshots, results and APK identity. The phone disconnected before installation. These checks do not complete the remaining workflows or establish physical-device animation quality.

## Sidebar actions, version 0.2.13

- [x] Rename, archive and restore the chosen row without selecting it first. Long press opens its actions; the selected row also has a quiet overflow control.
- [x] Preserve the sidebar search, active chat, model and draft when another row is edited. Closing the action sheet returns to that search without opening the keyboard.
- [x] Keep failed rename edits visible with a local error. Archive retry preserves the original intent when a later server event changes the row. Pending writes block duplicate submission and dismissal.
- [x] Reject stale responses for deleted or moved sessions. Accepted updates survive a list read that began before the mutation. Archiving the active chat preserves its draft for restoration.
- [x] Keep the rename input and Save visible above the landscape keyboard at system text scale 2.0. Back and explicit keyboard dismissal preserve the entered title. Both themes and long titles were inspected.
- [x] Give saved-connection removal a concise Delete button. Cancel preserves the connection; confirmed deletion removes only its own saved record.

The [0.2.13 review](MOBILE_NATIVE_VISUAL_REVIEW.md#targeted-sidebar-actions-version-0213) records the installed tests and remaining visual refinements. These changes close targeted chat organization, not the whole sidebar or Settings migration.

## Short forms and confirmations, version 0.2.14

- [x] Size short action, rename and confirmation sheets from their content. Preserve scrolling and keyboard clearance in the shorter landscape viewport.
- [x] Show the start of a long title before editing. Explicit focus selects the existing title; opening Rename keeps the keyboard hidden.
- [x] Replace Android's connection-removal alert with the native theme, a concise destructive action, a target name and an explanation of what deletion affects. Preserve Cancel, Back and local Retry.
- [x] Stop tiny text-measurement changes from restarting sheet height animation while idle. The installed large-text rename now settles with zero frames over a five-second idle sample, and the frame counter still responds to editing.

The [0.2.14 review](MOBILE_NATIVE_VISUAL_REVIEW.md#short-forms-and-confirmations-version-0214) records the build, installed checks and the limits of the motion evidence. These form changes do not close the remaining project or Settings workflows.

## Registered projects, version 0.2.15

- [x] Use the registered project name and host registry order in the sidebar. Include empty projects, with a quiet compose action when expanded. Keep unregistered directories that still contain chats accessible.
- [x] Preserve open folders across registry rename, reorder, removal and refresh. Normalize path separators without inferring parent-project or worktree ownership.
- [x] Keep known project names and chats after a failed registry read. Offer Retry beside the affected list; a failed request must not become an empty list.
- [x] Show the chosen project's registered name in the new-chat header and welcome text. Starting that draft and cold relaunch preserve its text, model and project context.
- [x] Check the installed build on the S24 Ultra in normal dark Work mode and large-text light Developer mode, including portrait and landscape. Folder and compose controls remain separate and reachable without opening the keyboard.
- [x] Fix the reduced-motion startup crash found during phone acceptance. Omit entrance/exit animation builders when reduced motion is enabled. Three reduced-motion and three normal cold starts preserved the draft, project and model with no process errors.

The [0.2.15 review](MOBILE_NATIVE_VISUAL_REVIEW.md#registered-projects-version-0215) records the comparison, build identity and acceptance limits. Host registry order is not desktop's device-local manual sorting. Project registration, metadata editing, defaults, worktrees and child chats remain open.

## Following passes, in order

| Priority | Work | Completion evidence |
| --- | --- | --- |
| 1 | Daily reliability and recovery | Reproduce reported failures before changing code. Cold launch, reconnect, background/resume, app recreation, draft retention, Send/Stop and model recovery pass. A failed read never clears valid data |
| 2 | Sidebar workflows | Preserve accepted row actions and registered-project behavior. Add child/worktree structure, clear chat-list recovery and deliberate search scope |
| 3 | Project configuration and remaining daily Settings | Safe project registration and edits without activating a chat or deleting a directory; project defaults; useful Usage and About pages; agent configuration with source-aware, guarded writes |
| 4 | Follow-up composer and message actions | Queue/steer captures the chosen model, agent and project; failed sends remain recoverable; mentions and document preparation preserve the draft; fork/revert affects the selected message and has clear consequences |
| 5 | Tools and advanced configuration | Targeted Files/Notes/Changes/Terminal navigation, then MCP/plugins/skills/integrations and other configuration. Test direct and relay capability separately. Preserve tool state and native Back behavior |
| 6 | Platform features and release readiness | Real voice and notification checks, large-screen layout, network handover, release signing and migration from the old package. iOS needs its own build and device acceptance |

Short forms and registered-project display are implemented. Next work should cover project registration and metadata edits, then project defaults and agent configuration. Project operations must stay separate from chat activation and preserve unrelated registry entries.

The Settings persistence prerequisite is closed. Regression tests reproduced a failed save blocking later saves, unreadable settings being overwritten, and a migration racing a save. The server now rejects unreadable files and serializes migration reads with saves through a queue that recovers after rejection. On 22 September, native 0.2.14 passed failed-save Retry, independent later saves, read failure, malformed-file recovery and cold-relaunch draft retention on the S24 Ultra. See the [installed recovery evidence](MOBILE_NATIVE_VISUAL_REVIEW.md#settings-persistence-recovery-on-the-s24-ultra). This is a host fix and requires restarting the host to use it.

Project editing needs targeted host operations. The native picker currently parses only `id`, `path` and `label`, while the desktop registry also holds icons, colors and other metadata. Sending that projection back as a replacement `projects` array would lose omitted fields and could overwrite another client's change. Reuse the host's validation and Settings queue, applying each registration, rename or removal to its latest registry without activating a chat or deleting a directory.

The generic Settings writer also validates every path when it receives a replacement project list and drops entries whose directories are missing. A targeted rename must preserve unrelated registrations, including temporarily unavailable directories. Validate a newly registered path directly, and keep the mutation inside the existing queue with a revision check on the edited record. The current desktop `addProject` activates the project, so it cannot serve as the native Settings registration operation unchanged.

## Completion criteria

Completion means the workflows in the coverage table are implemented and accepted, or the user has explicitly agreed to remove them from scope. A placeholder, hidden destination or whole embedded web app does not close a native workflow.

The Android completion check includes an installed APK with a working upgrade path, preserved connections and drafts, complete daily Settings and project workflows, sending and following up, attachments, message actions, tool navigation and recovery after network loss or app recreation. The sidebar, composer, pickers and Settings must pass visual and interaction review in both modes, both themes, large text and both orientations. Motion must cover the documented transitions and reduced-motion behavior, with recorded and measured checks on the available Android device or emulator. Report phone smoothness as unverified when only an emulator was available. Known functional, navigation or data-loss bugs keep completion open.

Notify the user when these criteria are met and identify the tested build and platforms. An Android result is not an iOS completion claim. External requirements that prevent validation or delivery must be reported as concrete blockers rather than silently marked complete.

## Visual and interaction acceptance

The sidebar should prioritize finding a conversation. Keep connection and mode context in the footer, with separate access to Settings and connections. Avoid permanent action icons on every closed folder. Selected rows need a quiet fill, long labels must truncate without stealing action space, and empty/error/loading states must be distinguishable.

Settings should use the same native rows and page headers throughout. Search must open a usable destination with the correct Back path. Device settings remain available offline. Server and project operations must keep their scope, preserve edits on failure and expose recoverable errors where the user is working.

Version 0.2.14 replaces the platform deletion dialog with the native theme and sizes short sheets to their content. Its long-title rename shows the beginning before focus. Preserve those behaviors in future forms, including local errors, pending actions, large text and keyboard transitions. Reachable controls are only part of visual acceptance.

Motion remains part of each workflow's acceptance. Record drawer opening, project/archive expansion, search, keyboard/composer movement, picker transitions and Back. Check rapid reversal and reduced motion. Existing motion code is not evidence that it looks good. Static screenshots establish layout only; emulator recordings do not establish smoothness on the Samsung.

Update this list when a workflow actually passes, with a link to evidence. Do not count a placeholder page, hidden button or entire embedded web app as a completed native feature.

One unresolved observation from this review is the 0.2.11 drawer failing to open after pairing while other chat controls responded. A cold restart restored it. This has no established cause yet and must remain a recovery investigation until the triggering sequence is reproduced and fixed.
