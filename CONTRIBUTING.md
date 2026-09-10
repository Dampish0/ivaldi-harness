# Contributing to Ivaldi

## Getting Started

```bash
git clone https://github.com/Dampish0/ivaldi-harness.git
cd ivaldi-harness
bun install --frozen-lockfile
```

## Dev Scripts

Run commands from the project root unless a section says otherwise.

### Web

| Script | Description | Ports |
|--------|-------------|-------|
| `bun run dev` | Default web HMR dev flow. | auto-selected dev ports |
| `bun run dev:web:full` | Build watcher + Express server. No HMR — manual refresh after changes. | `3001` (server + static) |
| `bun run dev:web:hmr` | Vite dev server + Express API. **Open the Vite URL for HMR**, not the backend. | `5180` (Vite HMR), `3902` (API) |
| `bun run start:web` | Start the packaged web server. | `3000` by default |

Both are configurable via env vars: `OPENCHAMBER_PORT`, `OPENCHAMBER_HMR_UI_PORT`, `OPENCHAMBER_HMR_API_PORT`.

### Desktop (Electron)

```bash
bun run electron:dev          # HMR web UI + Electron shell
bun run electron:dev:bundled  # Electron shell using built web assets
bun run electron:build        # Package desktop app for the current platform
```

Desktop supports macOS, Windows, and Linux. The build output is written to `packages/electron/dist`.

macOS builds create `dmg` and `zip` files. You need Xcode/build tools for notarized packaging and icon asset work.

Windows builds create an NSIS installer. If signing env vars are not set, the build script makes an unsigned installer.

Linux builds produce an AppImage for the native x64 or arm64 host.

For desktop-specific details, see [`packages/electron/README.md`](./packages/electron/README.md).

### VS Code Extension

```bash
bun run vscode:dev      # Watch mode + Extension Development Host
bun run vscode:build    # Build extension + webview
bun run vscode:package  # Create a local .vsix package
```

`bun run vscode:dev` opens an Extension Development Host automatically. You can override the editor or workspace with `OPENCHAMBER_VSCODE_BIN` and `OPENCHAMBER_VSCODE_DEV_WORKSPACE`.

Example: `OPENCHAMBER_VSCODE_BIN=cursor bun run vscode:dev`.

### Shared UI (`packages/ui`)

No standalone app server. This is a source-level library used by Web, Desktop, and VS Code.

Useful package commands:

```bash
bun run build:ui
bun run type-check:ui
bun run lint:ui
```

## Build And Package Commands

| Command | What it does |
|---------|--------------|
| `bun run build` | Build all workspaces |
| `bun run build:web` | Build only `packages/web` |
| `bun run build:ui` | Build only `packages/ui` |
| `bun run build:electron` | Run Electron package build script without full packaging |
| `bun run electron:build` | Build packaged desktop app for the current OS |
| `bun run vscode:build` | Build the VS Code extension |
| `bun run vscode:package` | Package the VS Code extension as `.vsix` |
| `bun run pack:web` | Create a package archive for `@ivaldi/web` |

## Platform Build Notes

You usually build desktop installers on the target platform.

macOS:

```bash
bun run electron:build
bun run --cwd packages/electron verify:opencode-cli:packaged
```

Windows:

```bash
bun run electron:build
```

Linux x64 and arm64 AppImages are packaged natively on the matching host architecture. Use Bun for dependency installation and packaging orchestration:

```bash
OPENCHAMBER_TARGET_ARCH=x64 bun run electron:build
# On an arm64 host:
OPENCHAMBER_TARGET_ARCH=arm64 bun run electron:build

bun run --cwd packages/electron verify:linux-appimage
```

The final AppImage verifier checks desktop identity and the architecture of Electron, the bundled OpenCode CLI, and packaged native modules.

## Before Submitting

```bash
bun run type-check   # Must pass
bun run lint         # Must pass
bun run test         # Must pass
bun run build        # Must succeed
```

`bun run test` runs every suite in the repository: shared UI, VS Code, Electron,
web/server, and the root scripts. The UI, VS Code, and Electron suites keep
module-level singletons, so `scripts/run-isolated-tests.mjs` gives each test file
its own process instead of letting load order decide the result. Run a single
file directly while iterating (`bun test <file>`).

For docs-only changes, validation may be enough:

```bash
bun run docs:validate
```

## Code Style

- Functional React components only
- TypeScript strict mode — no `any` without justification
- Use existing theme colors/typography from `packages/ui/src/lib/theme/` — don't add new ones
- Components must support light and dark themes
- Prefer early returns and `if/else`/`switch` over nested ternaries
- Tailwind v4 for styling; typography via `packages/ui/src/lib/typography.ts`

## Pull Requests

Pull requests are review handoffs, not just diffs. A reviewer must be able to
understand the intended behavior, assess the risk, and verify the result
without reconstructing the contributor's work.

Before opening a pull request:

1. Read [`AGENTS.md`](./AGENTS.md), every project skill matching the character
   of the change, and the nearest package README and module `DOCUMENTATION.md`.
2. Keep the change focused. Separate unrelated cleanup or refactors.
3. Run the validation required by the applicable project guidance, not only
   the broad commands above.
4. Complete the pull request template with concrete, current evidence.

### Pull Request Contract

Every pull request must explain:

- **Intent:** the user or maintainer problem being solved and the resulting
  behavior.
- **Non-goals:** nearby behavior intentionally left unchanged when the scope
  could otherwise be ambiguous.
- **Affected surfaces:** packages, runtimes, persisted/external contracts, and
  user-visible states affected by the change.
- **Repository guidance:** the skills and owning documentation that were
  applicable, why they applied, and how the implementation satisfies their
  important constraints.
- **Validation:** exact automated and manual checks performed, their result,
  and anything that was not verified. A command name without a result is not
  evidence.
- **Risk and failure behavior:** meaningful failure, rollback, cleanup,
  compatibility, security, performance, or cross-runtime considerations.

Do not claim a runtime, platform, relay path, performance characteristic, or
interaction is correct based only on type-checking or linting. If required
validation could not be performed, state that explicitly and explain why.

### Visual Evidence

User-visible changes require evidence that lets a reviewer compare the
behavior before and after the change. Attach screenshots for static states and
a short recording for motion, gestures, drag-and-drop, focus, or multi-step
interactions.

Claims about performance, memory, CPU, rendering, startup, or similar empirical
behavior require relevant before and after measurements.

Choose evidence based on the affected behavior:

- Include before and after states. If a meaningful before state cannot be
  captured, explain why.
- Include narrow/mobile and desktop states when shared or responsive UI is
  affected.
- Include light and dark states when colors, styling, surfaces, or visual
  states change.
- Include relevant loading, empty, error, disabled, long-content, or
  high-contrast states when the change affects them.
- For Settings changes, show the relevant narrow and wide settings pane states.

Evidence must represent the current pull request HEAD. After implementation
changes that can affect the demonstrated behavior, refresh the evidence or
state why it remains valid. If there is genuinely no user-visible change, say
so and provide a concrete reason; deleting the evidence section is not an
exemption.

### Review and validation

Reviews and release checks are manual. This repository has no GitHub Actions
workflows or automated review labels. Run the checks required for the change,
record their results for the current commit, and include the evidence described
above. Maintainers review correctness, repository guidance, and that evidence
before merging. See [release readiness](docs/RELEASE_READINESS.md) for packaging
and release gates.

### Keeping PRs active

Push updates or leave a comment when work is waiting on a reviewer or an external
dependency. Maintainers close inactive pull requests manually; there is no stale
bot. Reopening a closed PR is fine if it becomes relevant again.

## Project Structure

```
packages/
  ui/        Shared React components, hooks, stores, and theme system
  web/       Web server (Express) + frontend (Vite) + CLI
  electron/  Electron desktop shell
  vscode/    VS Code extension (extension host + webview)
```

See [AGENTS.md](./AGENTS.md) for detailed architecture reference.

## Not a developer?

You can still help:

- Report bugs or UX issues — even "this felt confusing" is valuable feedback
- Test on different devices, browsers, or OS versions
- Suggest features or improvements via issues
- Help others in Discord

## Questions?

Open an [Ivaldi issue](https://github.com/Dampish0/ivaldi-harness/issues).
