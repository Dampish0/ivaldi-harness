# Mobile app comparison: Capacitor and React Native

Reviewed 13 September 2026. Settings is the main subject; the final comparison table covers other migration gaps.

## Implementation status for 0.2.10

Models and Providers now includes a native custom-provider editor. It provides provider ID/name, OpenAI Chat Completions, OpenAI Responses and Anthropic Messages protocols, base URL, API-key or environment credentials, and separate model/header detail pages. These pages reuse the Settings header and focused-field form handling used by sign-in. Validation identifies the affected field or row, and leaving unsaved changes requires an explicit discard. This section records implemented source and fixture behavior; installed 0.2.10 acceptance belongs in the [visual review](MOBILE_NATIVE_VISUAL_REVIEW.md).

Safe editing requires a host with the new guarded `/api/provider/:id/editor` routes. An app update alone does not add that server capability. Older or unsupported hosts show an explicit upgrade/unavailable state. The editor reads the winning raw configuration layer rather than inferring an editable definition from the merged model catalog. Revisions protect create, update and delete across layer changes. The server preserves unknown provider/options fields and extra metadata on models kept in the form. Unsupported configuration shapes stay unavailable for native editing.

Blank edit credentials preserve the full existing environment list and inline key. An explicit credential change uses SDK auth followed by guarded config persistence, or an environment reference in config. Auth success followed by config failure remains visible as partial success with pending Apply. Retry preserves the accepted credential; conflicts require Reload. Reopened partial creates retain safe credential-presence metadata, and cold-start recovery requires a fresh server read before accepting a blank key. Deletion affects only the displayed config scope and retains stored auth and other layers. The [native README](../experiments/mobile-native/README.md#custom-providers) owns the detailed failure, lifetime and credential contracts.

Quota/usage details, advanced provider fields and an independent Settings project/config-layer selector remain missing. The editor uses the current chat or draft directory, creates in user config, and edits the existing winning layer. This is a supported custom-provider workflow, not full provider or Settings parity.

## Earlier implementation status for 0.2.9

Models & Providers now has native provider search, connection details, API-key entry and OAuth sign-in. OAuth preserves the server's method index, conditional text/select prompts and auto/code callback behavior. Catalog, authentication-method and source failures have separate Retry states. Saving credentials leaves an explicit Apply step. Managed Apply refreshes models without replacing the current chat or draft; failed refresh can retry without restarting again. External servers retain manual restart guidance. After restarting externally, the user confirms with "I've restarted the server". The guidance clears only after provider and chat-model reads succeed, without another restart request.

Model visibility is a device preference with individual and provider-wide controls. Hidden models leave the chat and default-model pickers, including favorites, while current choices, favorites and saved server defaults remain intact. Writes commit after storage succeeds. At 0.2.9, custom-provider creation/editing, quota details and config-layer editing remained in the retained web implementation. The native provider page did not provide full parity with every desktop provider control.

Settings and default-model search now reserve space for the keyboard. Landscape editing uses a compact search row and primary result labels, with an explicit keyboard-dismiss action. The query survives dismissal, and normal headers and secondary labels return afterward. Installed emulator checks include result selection at Android font scale 2.0.

Provider authentication forms use the same Settings navigation. In landscape with the keyboard open, the large header gives way to the focused field and a Done control. Conditional OAuth fields scroll into the remaining viewport without replacing the input. API keys, OAuth prompts and authorization codes were entered at Android font scale 2.0 in an installed release-mode build. The short viewport still requires scrolling or dismissing the keyboard to reach controls farther down the form.

Saved connections now temporarily hides Settings. Closing the connection manager restores its page, search and scroll position with the keyboard dismissed. A confirmed connection starts a fresh chat lifetime, including reconnecting to the same server. Network preparation can be cancelled without allowing its late response to change the active server. Single-use pairing credentials can finish saving as an inactive connection so they remain usable.

Files and tools has an explicit loading and failure flow with Retry. Retry fetches fresh authenticated HTML. Closing during a load, changing its scope or receiving a late browser callback cannot restore abandoned content. This remains a contained web implementation with its existing direct-connection requirement.

The sidebar opens a restored chat's project and archive ancestors once its session is known. Manual collapse survives reopening and metadata updates; selecting another chat reveals its new location. This fixes navigation continuity without adding another persisted preference.

Chat now has native display controls for reasoning visibility and disclosure, plain-text or Markdown user messages, code wrapping, and Bash/edit tool expansion. Search reaches the corresponding section. These are device preferences consumed by native messages, with durable writes and Retry on failure. Existing server settings and web-tool preferences keep their own scope. This restores part of the original Chat page; follow-ups, draft policy, retention and the other unmigrated controls remain outstanding.

The model picker's thinking page now returns to its model list on Android Back. Both pages share a reversible transform/opacity transition, and the model list retains its search and scroll position. The visual review records installed-build verification.

Sessions now contains native new-chat defaults for model, effort and agent. The model page supports search and long model names; all three choices use the connected server's existing Settings endpoint. Saving a default affects subsequent new chats. Native chat now remembers model and agent choices by session so switching back does not inherit a newer chat's defaults. Failed reads and writes retain explicit Retry actions and leave the last committed values intact. The page states which connection owns the setting.

This build also replaces the misleading blank screen for a missing restored chat with draft recovery. An authoritative missing-session response and a failed lookup have different messages. Continuing in a new chat creates it without sending, preserving the old draft, its attachments and any separate new-chat draft. The visual review records the APK checks and their limits.

The first Settings rebuild replaces the preference sheet with a full-screen native flow. General, Appearance, Language and Saved connections form the root. Search indexes implemented destinations and opens their control pages. Mode now sits inside General, and nested pages retain their scroll position when navigating back.

Appearance adds an explicit System/Light/Dark preference, Selawik or system font, text size from 80 to 150 percent and spacing density from 80 to 120 percent. The numeric controls change in steps of five, reset to 100 percent and show a live preview. Native appearance writes commit after persistence, preserve the previous value on failure and offer Retry within Settings. The new store reads the previous Light/Dark preference when no new-format appearance value exists. Mode remains per connection and also waits for a successful write before changing.

These changes did not complete Settings parity. Quota details, agent management, projects, MCP, plugins, skills, integrations and the other server configuration pages remain outstanding. The retained web app still has the direct-connection limit described below. Its server-backed new-chat defaults now apply to native chat, while web appearance and chat display preferences still belong to that web UI. Build results, emulator evidence and outstanding checks belong in the [native visual review](MOBILE_NATIVE_VISUAL_REVIEW.md). Storage and ownership contracts are in the [native README](../experiments/mobile-native/README.md#native-settings-and-appearance).

The sections beginning with Finding preserve the 0.2.4 baseline and the requirements that led to this rebuild. Their screenshots and missing-feature tables describe that baseline. The implementation status above records which parts have since changed.

### Remaining provider work

The native provider flow now includes supported custom-provider protocol, base URL, model and header configuration. Remaining provider work includes quota and usage credentials, richer model metadata and controls for advanced configuration fields. Unknown fields survive supported edits, while definitions that cannot be projected safely remain unavailable in the native editor.

Source metadata identifies saved auth and user/project/custom configuration without exposing paths or values. The guarded editor can update or remove the winning layer for the current directory on supported hosts; native still has no independent project-scope or layer selector. Host-managed Claude CLI sign-in remains separate from stored OpenCode credentials. Future provider work should reuse the owning server contracts and preserve the distinction between sign-in, configuration, quota and explicit Apply.

## Finding

The React Native candidate replaced a complete Settings system with a small preference sheet. It retained the desktop colors, Selawik font and icons, but lost most of the configuration, navigation and feedback that made the original app useful. That is the main reason Settings feels unfinished.

This was an incomplete migration. React Native does not require this reduction. Making the existing six rows prettier would leave most of the problem intact.

The next implementation should restore the shared product's organization and behavior in native screens. Keep the quiet desktop design, adapt its spacing and navigation to a phone, and reuse the existing configuration contracts. Settings should feel like part of Ivaldi, with the restrained presentation the user liked in desktop Codex and ChatGPT.

## What was inspected

| Evidence | Scope |
| --- | --- |
| Installed Capacitor app | `dev.ivaldi.mobile`, version 1.20.1, code 12002. Opened Settings, navigation, Appearance and typography controls against the running local desktop server. |
| Installed native candidate | `dev.ivaldi.nativecomparison`, version 0.2.4, code 6. Opened Settings and Language using the synthetic native QA server. Checked Back and keyboard state. |
| Device | Android 35 emulator, 1080 by 2400, density 420, portrait, system font scale 1.0. Both apps remain installed. |
| Repository | Mobile page allowlist, shared Settings routing/search, individual controls, native Settings, preference storage and retained WebView. Broader workflow comparison is source review. |

This review establishes what is present in the inspected screens and current source. It does not establish that every provider, plugin, notification or voice workflow works in either installed build. No server configuration was edited, no real chat was submitted, and no application code or APK was changed for this review.

The installed Capacitor build is not identical to current source. Its typography screen shows font selection, terminal/editor size, spacing and input offset. Current shared source also has an interface text-size control that was absent from that installed screen. The tables distinguish this difference.

Screenshots captured during the review:

| Capacitor | React Native |
| --- | --- |
| [Settings navigation](../experiments/mobile-native/artifacts/settings-capacitor-navigation.png) | [Entire Settings sheet](../experiments/mobile-native/artifacts/settings-native-sheet.png) |
| [Appearance](../experiments/mobile-native/artifacts/settings-capacitor-appearance.png) | [Language after settling](../experiments/mobile-native/artifacts/settings-native-language-settled.png) |
| [Typography controls](../experiments/mobile-native/artifacts/settings-capacitor-typography.png) | [Language during transition](../experiments/mobile-native/artifacts/settings-native-language.png) |

These are local evidence files under the native artifacts directory.

## Why native Settings feels worse

| Difference | Original Capacitor/shared app | Native candidate | Consequence |
| --- | --- | --- | --- |
| Structure | Full-screen Settings with grouped navigation and separate pages. | A 560dp preferred-height sheet, capped by available space. | Most of the screen still belongs to a dimmed chat while configuration is squeezed below it. |
| Information density | Categories lead to focused controls and entity details. | Two Mode rows, two Appearance rows, Language and Saved connections. | Four concerns occupy the entire Settings screen. Missing categories have no discoverable destination. |
| Hierarchy | Common settings, Workspace, AI & Agents, Tools, Prompts and System. Work mode changes the hierarchy. | Mode is the first and most prominent decision; both modes show the same tiny Settings list. | An infrequent choice consumes prime space without explaining the rest of the product. |
| Search | Searchable pages and stable controls, with navigation to the target. | No Settings search. | There is no way to look for fonts, providers, permissions or defaults. |
| Appearance | Theme behavior, palettes, localization, typography and density. | Light/Dark plus a separate Language list. | Matching the default font has not restored control over readability. |
| Control language | Shared Settings rows, restrained selections and contextual help. | Chat picker rows, wide filled selected backgrounds and mixed navigation arrows. | Settings looks like another chat menu. Language uses a down chevron even though it opens a child screen. |
| Feedback | Shared save-state reporting, delayed Saving indication and visible failure. | Persistence failures become a general chat error behind the open sheet. | The user can miss a failed preference change while still in Settings. |
| Navigation and motion | Explicit mobile navigation stages, route depth and page transitions. | Sheet entry/exit animates; Language swaps content inside the same sheet. | Animated chrome does not provide a coherent transition between Settings pages. |
| Project scope | Settings can inspect a different project without relocating chat. | No Settings project selector or project configuration pages. | Native project grouping is not a replacement for project configuration. |

The native keyboard behavior checked here is correct: opening Settings and navigating Language left Android reporting `mInputShown=false`. Preserve that. There is no reason to focus search until the user taps it.

One transition screenshot contains the outgoing Saved connections computer icon while Language rows are already visible. A later settled screenshot is clean. This is evidence of an inconsistent intermediate frame, not a claim that the final Language layout is permanently broken. Record and reproduce this handoff during the rebuild; isolated icon animations should not outlive their page.

Source: [native Settings and navigation](../experiments/mobile-native/src/components/ChatScreen.tsx), [Overlay sizing and motion](../experiments/mobile-native/src/components/Overlay.tsx), [native buttons](../experiments/mobile-native/src/components/ui.tsx), [shared Settings routing](../packages/ui/src/components/views/SettingsView.tsx), [save feedback](../packages/ui/src/components/sections/shared/SettingsPageLayout.tsx).

## Settings coverage

The [mobile allowlist](../packages/ui/src/apps/mobileSettingsPages.ts) contains 22 route slugs. [MobileApp](../packages/ui/src/apps/MobileApp.tsx) removes About for Capacitor, leaving 21 eligible routes across modes and nested destinations. This is not a count of 21 simultaneously visible navigation items. Work mode moves several pages under Advanced, and Skills Catalog is a nested destination.

In the table, **missing** means missing from native Settings. Some server pages have a retained web implementation, with the limitations in the following section. **Partial** means a related native behavior exists but does not cover the original configuration.

| Original page or route | What it provides | Native status |
| --- | --- | --- |
| General, `general` | Applicable security, privacy, transport, tools and editor/terminal preferences, with runtime guards. | Missing. Saved connections is a separate connection manager, not this page. |
| Appearance, `appearance` | Theme, localization, type and density. | Partial. Light/Dark and language only. |
| Chat, `chat` | Reasoning visibility, user-message behavior, tool display, code wrapping, draft persistence and developer follow-up behavior. | Missing configuration. Native chat has fixed rendering choices and persists drafts. |
| Sessions, `sessions` | Default model, thinking effort, agent, auxiliary model choices and retention controls. | Partial related behavior. Chat model/effort/agent selection does not configure all these defaults or retention rules. |
| Notifications, `notifications` | Delivery choices, event preferences and applicable notification controls. | Missing native Settings and native notification integration. |
| Voice, `voice` | Playback and recognition configuration where supported. | Missing native Settings and voice integration. |
| Projects, `projects` | Project registration and configuration, with project detail navigation. | Missing. Grouping existing sessions by directory does not register or edit projects. |
| Git, `git` | Git preferences, identity and related configuration. | Missing. A web Changes view is a different workflow. |
| Integrations, `integrations` | Integration management and provider/plugin setup routes. | Missing native page. Retained web implementation only. |
| Models & Providers, `providers` | Provider configuration and model management. | Partial related behavior. Native can select a model already exposed by the server; it cannot manage the provider here. |
| Agents, `agents` | Agent configuration and editing. | Partial related behavior. Native can select an existing agent. |
| Agent Behavior, `behavior` | Instruction and behavior configuration. | Missing native page. |
| Commands, `commands` | Command definitions and editing. | Missing native page. |
| Lifecycle hooks, `lifecycle-hooks` | Lifecycle automation configuration. | Missing native page. |
| MCP, `mcp` | MCP server configuration and management. | Missing native page. |
| Plugins, `plugins` | Plugin management. | Missing native page. |
| Skills, `skills.installed` | Installed skills and their details. | Missing native page. |
| Skills Catalog, `skills.catalog` | Skill discovery and installation. | Missing native destination. |
| Magic Prompts, `magic-prompts` | Prompt configuration. | Missing native page. |
| Usage, `usage` | Usage/provider detail views. | Missing native page. |
| Advanced, `advanced` | Work-mode gateway to AI configuration, commands and lifecycle hooks. | Missing. Native has a mode preference without this supporting navigation. |

The owning pages are selected in [SettingsView's `renderPageContent`](../packages/ui/src/components/views/SettingsView.tsx). [OpenChamberPage](../packages/ui/src/components/sections/openchamber/OpenChamberPage.tsx) defines the ordinary preference groups. [Product-mode policy](../packages/ui/src/lib/productMode.ts) and [Work Advanced](../packages/ui/src/components/sections/openchamber/WorkAdvancedSettingsPage.tsx) define what stays visible or reachable in Work mode.

Android push is a qualified baseline. The Capacitor implementation exists, but [its README](../packages/mobile/README.md) states that push registration is unavailable without Firebase configuration. Delivery was not tested in this review. Voice availability also depends on the runtime and platform; a Settings control alone does not prove working audio.

### Appearance deserves its own migration

| Control | Capacitor/shared baseline | Native 0.2.4 |
| --- | --- | --- |
| System / Light / Dark | Explicit three-way choice. | Follows the system before an override, but offers only Light/Dark. Once changed, there is no UI to return to System. |
| Separate light and dark themes | Theme selectors and reload action. | Two bundled palettes; no theme selection or reload. |
| Interface font | Selector and reset. Installed build shows Selawik. | Fixed Selawik family. No selector or reset. |
| Interface text size | Present in current source, 50 to 200 percent with reset. Absent from the installed baseline screen. | No app setting. OS text scaling remains separate. |
| Code font | Selector and reset. | No setting. |
| Terminal/editor text size | Separate controls and resets, with mode guards. | No native settings. These tools remain web-based. |
| Spacing density | Percentage and reset. | Fixed native spacing. |
| Language | Shared catalog selection. | Implemented with all 11 generated catalogs. |
| Time format and week start | Explicit preferences. | No settings. |
| Install name, orientation, browser keyboard behavior and input offset | Web/PWA or viewport-specific controls appear in shared Appearance. | Require platform review. Browser layout workarounds should not become native settings by default. |

There is also a misleading native state: before an override, the screen marks either Light or Dark as selected even though the actual preference is System. Selecting the already-active color does nothing, so the visible selection does not reliably describe stored intent.

The user's preferred starting point is desktop Selawik. Keep it as the default. Typeface choice alone cannot fix oversized headers, inconsistent line heights, poor alignment or excess spacing. A native text-size preference must affect headers, controls, composer and messages without clipping, and must work together with Android accessibility scaling.

Source: [shared appearance controls](../packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx), [native ThemeProvider](../experiments/mobile-native/src/ThemeProvider.tsx), [native typography](../experiments/mobile-native/src/theme.ts).

## Why the retained web app does not close the gap

Files and tools is useful migration reuse, but it is not integrated Settings parity.

It loads the connected server's hosted mobile HTML, not the installed Capacitor bundle. The available UI follows that server's deployed version, and Capacitor-only features do not carry over without their native bridge.

1. Its URL is `/mobile`, optionally with a session. It does not target Settings or a particular tool. The user enters a second app navigation flow under a Files and tools header.
2. The entry requires a direct connection and is disabled on relay. A configuration workflow reachable only through this route is unavailable to a relay-only native connection.
3. The WebView uses an ephemeral session and is destroyed on close. Native preferences live in AsyncStorage. There is no bridge that makes web font, theme or language changes configure native chat.
4. The bootstrap passes mode and session context. It does not establish shared preference ownership or full project/navigation continuity.
5. Server-owned changes may affect the same server, but local web preferences belong to the embedded app. These two kinds of changes must not be presented as equivalent.
6. A failed load shows Unavailable, with no in-place Retry. Individual management flows have not passed acceptance merely because the web app opens.

Source: [workspace URL and bootstrap](../experiments/mobile-native/src/runtime/workspace.ts), [WebView lifecycle](../experiments/mobile-native/src/components/Workspace.tsx), [connection capability](../experiments/mobile-native/src/runtime/connection.ts).

### Preference ownership must be explicit

| State | Current difference | Required behavior for the rebuild |
| --- | --- | --- |
| Work/Developer | Shared app persists a device preference; native stores it per connection. | Choose one product policy and migrate deliberately. A connection change should not silently redefine an infrequently changed app preference. |
| Appearance and language | Native and retained web preferences are separate. | Native Settings controls native consumers. Label any separately scoped web-tool preferences where that distinction affects the user. |
| Model and agent | Native remembers selections per connection. Shared Settings also configures defaults. | Distinguish current chat choice, new-chat default and server configuration. |
| Project configuration | Shared Settings has its own selected project. | Viewing another project's settings must preserve the active chat and draft. |
| Persistence failure | Native reports a general chat error. | Show failure in the open Settings page, preserve the attempted value, and provide a safe retry or rollback. |

Source: [shared mode store](../packages/ui/src/stores/useProductModeStore.ts), [native preferences and writes](../experiments/mobile-native/src/runtime/chat.ts), [Settings project scope](../packages/ui/src/hooks/useSettingsDirectory.ts).

## What the new Settings should look and behave like

Use a full-screen native Settings flow on phones. Its root is a quiet list of categories with current-value summaries where useful, explicit search, one header and one close action. Detail pages have a Back action and retain their previous scroll position. Longer forms get the screen space they need.

Keep Mode inside General as one row showing the current value. Selecting it opens Work/Developer choices. It should not dominate Settings or return to the chat header. Preserve the shared Work-mode policy: common pages stay easy to reach, and Advanced provides the appropriate configuration destinations without making users switch modes to find them.

Use the existing Selawik family, semantic theme colors and icon set. Build native equivalents of the shared Settings page, section, field, choice and help patterns. Sections should be separated by spacing and restrained dividers. Keep control baselines consistent, allow translated labels to wrap, and maintain at least 44dp touch targets without making every row a large card. Successful ordinary changes should remain quiet; pending writes and failures need visible, contextual feedback.

Search should find stable settings as well as page names. A result for a font or default model must open the relevant page and reveal the actual control. The same availability rules must govern navigation, search and destination rendering. Opening Settings must leave the keyboard hidden; tapping search may open it.

### Settings motion requirements

| Interaction | Intended behavior | Acceptance evidence |
| --- | --- | --- |
| Open and close Settings | One coordinated full-screen transition; outgoing chat does not flash its composer or regain focus. | Recording from an open keyboard, repeated open/close, Android Back. |
| Category, nested list and detail navigation | Direction follows navigation depth; header and content move together. Back restores the previous page and position. | Repeated forward/back and interrupted transitions. |
| Choice changes | Immediate press feedback; selection changes within stable row bounds. | Rapid theme/mode changes, including System appearance. |
| Expand/collapse sections or project folders | Animate the content height and disclosure indicator together, including reversal halfway through. | Record opening and closing both empty and populated groups. |
| Search and results | Keyboard follows explicit input focus. Results change without moving the page header or exposing unrelated content. | Search, clear, choose a result, return to the same query. |
| Save and error feedback | Reserve or smoothly reveal its space near the relevant page/control. | Delayed save, forced failure and successful retry. |
| Reduced motion | Preserve focus and state changes with reduced movement. | Repeat navigation with the OS preference enabled. |

A checkmark animation or a moving sheet is insufficient evidence that the page transition works. Record intermediate frames as well as settled screenshots. Emulator recordings establish behavior; phone smoothness remains a separate measurement.

### What to improve from the original

The original has its own layout problems. Appearance repeats the title below an already titled header. Its long vertical stacks and large gaps push typography several screens down. Browser install and keyboard controls compete with everyday appearance choices. The navigation screenshot also gives a fixed Reload OpenCode action persistent space.

Keep the useful categorization, search, scope and detailed controls. Shorten the ordinary paths, remove repeated headings, and place runtime maintenance actions in their relevant context. Desktop-only window, tray and local SSH controls are not missing phone features. About is explicitly excluded in Capacitor, so a missing desktop updater page should not inflate the parity list.

## Implementation order and reuse

| Order | Work | Reuse | Completion criterion |
| --- | --- | --- | --- |
| 1 | Native Settings navigation, search, category rows, General/Mode, Appearance and language. | Shared labels, page identities, search semantics, mode policy, themes and font assets. Adapt browser-dependent modules before importing them. | System/Light/Dark, readability controls, navigation and local save failures work in the installed APK. No empty category placeholders presented as completed pages. |
| 2 | Daily configuration: Chat, Sessions/defaults, Projects, Models & Providers, Agents and Usage. | Existing SDK/API contracts and domain validation. Keep runtime/auth handling in the native runtime owner. | A user can change a supported preference, see its actual effect, restart and verify persistence. Project Settings never relocates chat. |
| 3 | MCP, plugins, skills, integrations, behavior, commands, hooks, Git and prompt configuration. | Existing domain implementations and server endpoints. A targeted web page can be an interim route for complex forms after navigation and transport support are solved. | Each supported flow opens from Settings, explains its scope, saves correctly, handles failure and returns predictably. Direct and relay support are recorded separately. |
| Parallel platform work | Notifications and Voice. | Existing preference models and server contracts; native permissions, delivery and audio need native implementation. | Permission denial, configuration, actual delivery/playback, background behavior and return navigation pass on Android. |

React DOM Settings components cannot be mounted directly in React Native. Reuse their contracts and behavior; create native view components. Avoid copying entire shared stores with browser globals into the native app. The existing generated-source mechanism can carry portable metadata where appropriate, with one canonical owner.

Any interim web route should open the requested Settings destination, identify which runtime it configures, and return to the native Settings context. Loading the entire `/mobile` app again is not the completion criterion. Keep credentials under the existing runtime boundary and out of URLs.

For each implemented page, test normal use, failed writes, restart persistence, long labels, Android font scales 1.0/1.3/2.0, portrait/landscape, keyboard handoffs, Back and accessibility traversal. Test relevant direct/relay behavior and reduced motion. A visible control counts as implemented only when its consumer and persistence behavior work.

## Other differences that still affect the app

These findings are source review, not new end-to-end acceptance results.

| Workflow | Capacitor/shared app | Native candidate |
| --- | --- | --- |
| Core chat | Existing sessions, models, agents, streaming and approvals. | Native implementations exist. Previous acceptance evidence is in the migration and visual review documents. |
| Files and tools | Dedicated Files, Notes and MCP tabs, plus Changes and Terminal in Developer mode; visited panes retain state. | Entire web mobile app on direct connections. The WebView is recreated after closing. |
| History and projects | Child chats, worktree groups, row actions and project management/reordering. | Root-session directory groups, animated folders, archive groups and project chats. No equivalent native project editor, worktree manager or full history row actions. Current-chat rename/archive exists separately. |
| Follow-ups while working | Queueing and steering in the shared composer. | The controller refuses Send while the session is busy. Stop is available; a native follow-up queue is missing. |
| Composer features | Mentions, slash commands, goal/plan entry and permission-mode controls. | Text, local file attachments, model/effort/agent selection, Send and Stop. These richer input workflows have not been migrated. |
| Messages and attachments | User message actions such as fork/revert/context pinning, broader previews and document preparation. | Copy, reasoning/tool disclosures and local or embedded PNG/JPEG/WebP previews. Remote/Markdown images, document extraction and user-message action parity remain incomplete. |
| Tablets and foldables | Size-dependent persistent/resizable navigation and workspace layout. | Phone-style overlays across widths. Rotation support does not establish a tablet layout. |
| Connection handover | Reprobes on resume and can switch LAN/relay candidates. | Chooses transport at connection establishment. Stream reconnect does not automatically switch the runtime's transport. |
| Voice and background notifications | Existing shared/Capacitor integration, subject to platform setup. | Native integration remains pending. |

Source entry points: [workspace tabs](../packages/ui/src/apps/MobileWorkspaceDrawer.tsx), [Capacitor history](../packages/ui/src/apps/MobileSessionsSheet.tsx), [shared composer](../packages/ui/src/components/chat/ChatInput.tsx), [message actions](../packages/ui/src/components/chat/message/MessageBody.tsx), [native sidebar](../experiments/mobile-native/src/components/Sidebar.tsx), [native controller](../experiments/mobile-native/src/runtime/chat.ts), [native message views](../experiments/mobile-native/src/components/MessageRow.tsx), [native image boundary](../experiments/mobile-native/src/runtime/images.ts).

The [migration record](MOBILE_REACT_NATIVE_MIGRATION.md) and [native visual review](MOBILE_NATIVE_VISUAL_REVIEW.md) remain the records of completed builds and tests. This document records the missing product behavior and the order for restoring it. It does not mark the Settings rebuild complete.
