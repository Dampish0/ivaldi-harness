# Ivaldi

Ivaldi is a local workspace for running, supervising, and reviewing AI coding agents. It uses [OpenCode](https://opencode.ai) as the agent runtime and gives you one place to manage sessions, permissions, code changes, terminals, and remote access.

[Releases](https://github.com/Dampish0/ivaldi-harness/releases) | [Report a bug](https://github.com/Dampish0/ivaldi-harness/issues) | [Release readiness](docs/RELEASE_READINESS.md)

## Release status

Ivaldi 1.20.0 is available as a public preview with an unsigned Windows x64 installer and a VS Code extension package. Source checks and packaging pass, but native installation, restart recovery, and upgrade testing still block a stable declaration.

Releases are built and checked manually. This repository does not use GitHub Actions for CI or deployment, and the desktop app does not install updates automatically.

## What Ivaldi does

- Runs coding sessions through OpenCode with Manual, Auto, and Full access modes.
- Tracks active work, questions, approvals, costs, provider limits, and completion state across projects.
- Continues bounded session goals and recovers eligible goals after a server restart or reconnect.
- Compares up to five independent runs and can combine selected work into a new session.
- Reviews diffs through guided walkthroughs and opens affected files in their owning project.
- Includes terminals, app previews, a built-in desktop browser, GitHub issue and pull request context, and scheduled prompts.
- Connects desktop, web, VS Code, iOS, and Android clients to the same running workspace.

## Install

### Windows desktop

Download `Ivaldi-1.20.0-win-x64.exe` from the [preview release](https://github.com/Dampish0/ivaldi-harness/releases). The installer includes OpenCode 1.18.23, so it does not require a separate OpenCode installation.

The current Windows package is unsigned. Windows may show an unknown-publisher warning. Check the downloaded file against `SHA256SUMS.txt` from the same release.

### VS Code

Download `ivaldi-1.20.0.vsix`, open the Extensions view in VS Code, choose **Install from VSIX**, and reload the editor. The extension ID is `dampish0.ivaldi`.

### Web from source

Install Node.js 22 or newer, the Bun version declared in `package.json`, and the [OpenCode CLI](https://opencode.ai). Then run:

```bash
git clone https://github.com/Dampish0/ivaldi-harness.git
cd ivaldi-harness
bun install --frozen-lockfile
bun run build:web
node packages/web/bin/cli.js serve --ui-password choose-a-password
```

Ivaldi listens on localhost by default. Use `--lan` only on a trusted network and set a UI password before allowing another device to connect.

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

Useful commands:

```bash
bun run electron:dev
bun run electron:dev:bundled
bun run electron:build
bun run vscode:package
bun run build
bun run type-check
bun run lint
bun run test
bun run docs:validate
```

Desktop installers must be built on their target operating system. Windows produces an NSIS installer, Linux produces an AppImage for the native architecture, and macOS produces DMG and ZIP packages. Read the [desktop build guide](packages/electron/README.md) before packaging.

## Repository layout

| Path | Purpose |
| --- | --- |
| `packages/ui` | Shared React interface, state, synchronization, and runtime contracts |
| `packages/web` | Web app, server, CLI, and managed OpenCode lifecycle |
| `packages/electron` | Desktop shell and native integrations |
| `packages/vscode` | VS Code extension and runtime bridge |
| `packages/mobile` | Capacitor iOS and Android applications |
| `packages/docs` | Product documentation |

New installations store Ivaldi data in `~/.config/ivaldi`. Existing installations can reuse legacy data and environment names so upgrades do not strand projects or credentials. Those compatibility identifiers are implementation details and are not the Ivaldi product identity.

## Project documents

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release readiness](docs/RELEASE_READINESS.md)
- [Future journeys](futureJourneys.md)
- [Documentation](packages/docs/content/docs/index.mdx)

## Origins and license

Ivaldi is an independent project. It includes MIT-licensed work originally developed by OpenChamber contributors and uses OpenCode as its agent runtime. Ivaldi is not affiliated with either project.

Licensed under the [MIT License](LICENSE). The original copyright notice is retained as required by that license.
