# OpenChamber agent guide

OpenChamber shares OpenCode UI across web, desktop, VS Code, hosted mobile, and Capacitor mobile.

## Required workflow

At every task's start, load `.agents/skills/communication-style/SKILL.md` before analysis, other tools, or responses. Apply it to all written output.

Before editing:

1. Follow this guide and load every matching skill below, its required companions, and task-required references.
2. Find and read the nearest `DOCUMENTATION.md` and applicable package `README.md`, when present. Discover module docs under `packages/**/DOCUMENTATION.md`; performance tooling docs live at `scripts/perf/DOCUMENTATION.md`.
3. Follow local code and test precedent.

Resolve material instruction conflicts before editing. Pure code-reading or explanation needs implementation skills only to interpret specialized subsystems.

## Boundaries and constraints

- `packages/ui` owns shared React UI, state, sync, and runtime contracts; `packages/web` owns web/server, CLI, and managed/external OpenCode lifecycle.
- `packages/electron` owns privileged native desktop behavior; `packages/vscode` owns extension host, webview, and runtime bridge.
- `packages/mobile` bundles the mobile web UI in Capacitor and connects to an existing server. `packages/docs` holds product docs and is not a Bun workspace.
- Shared UI uses `@opencode-ai/sdk/v2` for official OpenCode APIs; OpenChamber capabilities use `RuntimeAPIs`, `runtimeFetch`, and shared browser/realtime helpers. Server upstream integrations may use owning runtime modules.
- Electron runs the backend in-process, never as a sidecar. Development may use loopback/HMR UI; packaged UI uses `openchamber-ui://` assets with loopback APIs. Keep domain backends in web/runtime modules unless inherently native.
- Define shared contracts for every applicable runtime; make intentional runtime differences visible in code.
- Do not modify `../opencode`, a separate repository. Git/GitHub commands and dependency additions require explicit user requests.
- Never add or log secrets, bearer tokens, pairing credentials, or sensitive user data.
- Keep changes minimal, preserve unrelated work, keep entrypoints/bridges thin, and place domain logic in owning modules.
- Enforce security and correctness in core/runtime logic. Update owning docs when ownership, contracts, or invariants change.

## State correctness

- Prefer authoritative state over heuristics; derive live activity from live channels, not persisted history.
- Keep temporary fallbacks narrow and clear them when authoritative state arrives.
- Fetch failure must not appear as authoritative empty success.
- Make partial results, rollback, cleanup, and stale-data behavior explicit. One failed entity must not erase or block unrelated complete entities.

## Required skills

Skills live at `.agents/skills/<name>/SKILL.md` and own their detailed workflows. The table also defines canonical ownership: companion skills should link to the owner and add only local consequences, without copying rules.

| Change or task | Required skill |
|---|---|
| Source/dependencies, exports/contracts, builds/generated assets, ownership, scope/abstraction/validation risk | `openchamber-change-discipline` |
| CLI commands/prompts/output, non-TTY, `--quiet`, `--json` | `clack-cli-patterns` |
| Shared UI data access, SDK/server routes, runtime APIs/auth/URLs, bridges/switching | `ui-api-decoupling` |
| Electron main/preload/IPC, native UI, updater, deep links, SSH/tunnels, packaging, child processes | `desktop-shell` |
| Sync/bootstrap/reconnect, reducers/polling, optimistic state/queues, live status, reconciliation, cache lifecycle/directory scope | `sync-state-invariants` |
| Render/store/event hot paths, large lists, caches/indexes, lag/freezes, CPU/memory/startup regressions, measurement/optimization evidence | `performance-engineering` |
| WebSocket/SSE, streaming/runtime transport, private relay | `relay-transport` |
| UI components, styling/tokens, colors, buttons, icons, animation | `theme-system` |
| User-facing/accessibility text, labels, aria, toasts, dialogs, navigation copy | `locale-ui-patterns` |
| Settings UI/dialogs/configuration/search | `settings-ui-patterns` |
| Sortable/drag-to-reorder, including `@dnd-kit`, touch and wrapping layouts | `drag-to-reorder` |
| iOS Simulator build/launch/preview/gestures, `serve-sim` | `serve-sim` |
| App or VS Code `[Unreleased]` changelog entries | `changelog-authoring` |
| Skills, `AGENTS.md`, or docs reached through agent context pointers | `writing-for-agents` |

## Validation

Use `package.json` scripts and the narrowest checks covering the change:

- Executable source: focused tests and package-scoped type-check/lint.
- Cross-workspace contracts, root tooling, dependencies, shared generated assets: workspace-wide checks.
- Added/deleted/renamed source files or changed exports/types/entrypoints/import shape: run `bun run dead-code` and inspect its non-blocking report.
- Created or substantially rewritten JS/TS: run `bunx oxlint <changed-paths>`. Its vendored `anti-slop` plugin rejects unjustified assertions, weak `unknown`/`object`/`Record<string, unknown>` contracts, ad hoc `typeof` narrowing, and module mocking. Fix authored findings; leave unrelated backlog. Never silence rules, weaken severity, or launder types.
- Server/CLI JS, Electron helpers, and native behavior: use applicable focused tests, syntax checks, builds, or runtime checks. Type-check/lint alone is insufficient.
- Docs-only or isolated config: inspect edited text/references or relevant syntax/schema; no unrelated tests/builds.

Report what was and was not validated. Static checks do not establish runtime, relay, performance, or platform correctness.

## Pull requests

Before creating/updating a PR, read `CONTRIBUTING.md` and `.github/PULL_REQUEST_TEMPLATE.md`. Complete the template with final-HEAD evidence covering intent, affected runtimes, applicable guidance, validation, visual behavior, and failure/rollback considerations.
