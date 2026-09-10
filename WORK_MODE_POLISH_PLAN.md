# Work mode polish plan

## Goal

Make Work mode feel like a complete professional AI workspace rather than a coding product with developer controls hidden. Keep the same underlying agent capability. Simplify presentation, terminology, discovery, and defaults without weakening what the agent can do.

Developer mode remains the full OpenChamber/Ivaldi coding workspace and should not lose existing controls or observability.

## Product principles

- Hide implementation detail, not capability.
- Prefer normal work concepts such as chats, assistants, projects, files, tools, integrations, and models.
- Keep powerful features discoverable through contextual UI instead of permanently occupying toolbar space.
- MCP, Plugins, and Skills are first-class Work tools and must be easy to add, edit, install, and remove.
- Use progressive disclosure for advanced options.
- Preserve Developer behavior unless a change is intentionally shared.

## Phase 1: finish Work Settings

### Information architecture

- Keep the Work navigation focused on:
  - General
  - Appearance
  - Chat
  - AI
  - Notifications
  - Voice
  - Usage
  - About
  - Workspace: Projects, Integrations, Remote Instances
  - Tools: MCP, Plugins, Skills
  - Advanced
- Keep Providers, Agents, Behavior, Commands, and Shortcuts reachable through Advanced rather than first-class Work navigation.
- Keep Git, worktrees, terminal, remote instances, tunnel setup, raw OpenCode controls, and other developer-only configuration out of Work.

### Tools UX

- MCP must show an obvious Add MCP server action in Work.
- Plugins must show an obvious Add plugin action in Work.
- Skills must expose both Create and Skills Catalog in Work.
- Existing MCP servers, plugins, and skills must be directly selectable for editing.
- Keep compact icon-only management controls in Developer where appropriate.

### Settings QA

- Verify light and dark themes.
- Verify desktop and narrow/mobile layouts.
- Verify Settings search and Command Palette routing.
- Verify add/edit/delete flows for MCP, Plugins, and Skills.
- Verify Skills Catalog install flow.
- Verify Developer Settings still exposes the original technical controls.
- Remove remaining Work-facing developer terminology where a normal work term exists.

## Phase 2: new chat and empty workspace

This is the next major product-quality target.

### New chat screen

- Make the first screen explain what Ivaldi can do without looking like onboarding documentation.
- Show a small set of useful starter actions for normal work, not coding examples.
- Keep the composer visually dominant.
- Make the active project easy to understand.
- Surface files, browser, integrations, MCP, and Skills as available capabilities without turning the page into a dashboard.
- Use contextual hints that disappear once the user starts working.

### Suggested Work starter intents

- Summarize or analyze files.
- Research something using the browser.
- Draft or rewrite work content.
- Plan a project or task.
- Work with connected tools or integrations.

Avoid developer starters such as repository review, implementation planning, diff review, terminal tasks, or pull-request work.

## Phase 3: Work composer and contextual capability discovery

- Keep the agreed persistent Work composer controls:
  - attachment +
  - model selector
  - thinking level
  - send
- Keep the helper placeholder for now.
- Keep microphone, fullscreen, utility controls, persistent agent selector, provider selector, and developer controls hidden in Work.
- Keep `/plan` and the contextual planning suggestion chip.
- Show temporary chips for explicitly active assistants, browser/research state, integrations, or other exceptional context.
- Make attachment and tools menus use normal work language.

## Phase 4: project and workspace UX

- Audit project creation, selection, and project Settings in Work.
- Remove clone/Git/worktree concepts from Work entry points unless the user explicitly enters Developer mode.
- Keep project identity, project files, project knowledge/context, model defaults, and visual identity.
- Make it obvious which project a chat belongs to.
- Keep existing worktree-backed sessions selectable without exposing worktree management.

## Phase 5: transcript and activity polish

- Keep protocol/maintenance messages hidden in Work.
- Keep assistant output from hidden protocol turns.
- Keep Work activity compact and understandable.
- Prefer user-facing activity labels over shell/Git/OpenCode terminology when a generic label is accurate.
- Keep detailed raw execution available in Developer.
- Audit message actions so Work only exposes actions useful to normal work users.

## Phase 6: mobile and narrow layout

- Verify the Work composer on phone widths.
- Verify Settings navigation and split editors for MCP, Plugins, and Skills.
- Verify project switching, attachment flow, model selection, contextual chips, and new-chat starters.
- Avoid desktop-only density being squeezed into mobile.

## Phase 7: final consistency audit

- Search Work-visible UI for developer terminology including:
  - session
  - agent
  - OpenCode
  - Git
  - worktree
  - terminal
  - diff
  - subagent
  - provider
- Keep a term when it is genuinely the correct concept, such as MCP or model provider configuration.
- Verify Settings search does not reveal hidden developer controls.
- Verify Command Palette does not reveal hidden developer controls.
- Verify Work and Developer screenshots in light and dark themes.

## Validation gates

For each completed slice:

- Run focused tests for changed behavior.
- Run `bun run --cwd packages/ui type-check`.
- Run `bun run --cwd packages/ui lint`.
- Run `bunx oxlint` on newly created or substantially rewritten TypeScript/JavaScript files and inspect any findings in touched code.
- Run `bun run dead-code` when source files, exports, entrypoints, or import shape change.
- Perform runtime visual QA for any user-facing UI change.
- Do not mass-fix unrelated pre-existing anti-slop or dead-code debt.

## Current status

- Work/Developer product mode split is implemented.
- Work composer is simplified.
- `/plan` and the contextual planning suggestion are implemented. Desktop runtime QA confirms the suggestion appears for planning intent; the shared mobile composer uses the same detector and submission path.
- Work Settings information architecture has been rebuilt.
- MCP, Plugins, and Skills are first-class Work Tools with explicit add/create actions.
- Project Settings is restored in Work without Git/worktree management.
- Work Chat and AI Settings have been simplified.
- New-chat and empty-workspace polish is implemented on desktop and mobile, including work-oriented starters and a short capability hint.
- Work project creation, project menus, project identity, Archive, Scheduled Tasks, session switching, and transcript metadata use work-facing language and hide repository/operator controls while preserving underlying behavior.
- Work Add Project has been audited at runtime. It exposes local project browsing and Add project only; Clone repository and Git identity controls remain Developer-only.
- Scheduled Tasks and "new chat from this answer" keep model selection and completion-loop capability in Work while hiding agent, reasoning-variant, provider-switching, permission, Git, and worktree controls from the normal path.
- Work keeps model selection in the composer across every available provider without exposing provider configuration controls there. Provider identity remains visible in the picker so same-named models are distinguishable. If no model is available, the empty picker offers a recovery action that opens the Providers editor in Settings.
- Work uses removable command chips for transient modes such as `/plan` and `/goal` instead of permanent operator buttons or raw slash syntax in the editable prompt. `/compact` remains an ordinary one-shot slash action.
- Work exposes Remote Instances as a normal Workspace settings destination so instance switching and the optional current-instance header control are reachable without digging through Advanced.
- Mobile Work mode uses Chats terminology, skips presentation-only Git/worktree discovery, exposes Files / Notes / MCP in the workspace drawer, and keeps Projects / MCP / Plugins / Skills available in Settings. Developer mobile retains Changes, Terminal, Git, and worktree controls.
- Legacy timestamp-generated session titles are normalized to `Untitled chat` in Work across the mobile header, mobile and desktop switchers, mobile chat drawer, desktop sidebar, and Archive. User-written titles are preserved.
- Work Usage hides raw authentication diagnostics such as provider-specific backend failure strings and shows `Authentication required`; Developer keeps the diagnostic detail. Provider/service names remain visible because they identify the account that needs attention.
- The final Work-visible terminology scan is clean apart from literal user/provider content such as an `OpenCode Go` service name or a `.gitconfig` filename. Those are not presentation leaks and remain untouched.
- Desktop and 430×932 mobile runtime QA has been completed for the core Work/Developer splits above. Dark and light Work captures exist for the main desktop/mobile states, with targeted dark-theme captures for the detailed Work/Developer comparisons.
- Final focused validation: 151 tests passed across the Work-mode, planning, transcript, settings-search, locale, session-title, provider-auth, and update-toast suites; UI TypeScript and ESLint pass.
- Focused anti-slop validation on new/clean Work-mode helpers reports 0 warnings and 0 errors. A broader touched-file scan still reports pre-existing runtime-narrowing/type-assertion debt; it was not mass-fixed.
- `bun run dead-code` completes and still reports the repository's existing broad backlog, including 2 unused files plus many old exports/types. No new Work-mode helper was identified as dead.
- No known architectural Work/Developer gap remains in this plan. Native-device simulator QA and an exhaustive every-dialog review can continue as a separate release-hardening pass if wanted.
