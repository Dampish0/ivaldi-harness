# Future journeys

Planned improvements for Ivaldi, recorded on 2026-09-07.

## Restart recovery

Restart recovery is required for the stable release. The implementation on `codex/release-readiness` discovers saved active goals when the server's shared event stream connects, checks live activity, and resumes eligible work. Focused tests cover recovery and duplicate prevention. Packaged restart validation is still required before this journey is complete.

- Reconcile persisted active goals with authoritative session and live activity state when the backend starts or reconnects.
- Resume eligible work without duplicating a turn or interrupting work already running.
- Preserve paused, blocked, completed, and budget-limited states.
- Show when work recovered, stopped, or needs user attention. Treat unavailable state as unknown and retry recovery.

Complete when an active goal survives a backend restart and continues once eligible, while paused goals stay paused and recovery does not automatically replay a continuation whose delivery is uncertain. Interrupted turns must expose a reason and a recovery action. Record the packaged results in [release readiness](docs/RELEASE_READINESS.md).

## Split and clean up heavy files

Several core files combine enough responsibilities to make changes difficult to review and maintain. Start with:

- `packages/electron/main.mjs`
- `packages/ui/src/components/chat/ChatInput.tsx`
- `packages/ui/src/stores/useConfigStore.ts`
- `packages/ui/src/sync/sync-context.tsx`

The merge with local `main` adopts the split session sidebar and shortcut modules and the revised chat timeline. Ivaldi's Work-mode controls and presentation remain part of those modules. The files above still need focused cleanup.

Extract focused modules around existing responsibilities, keep entrypoints thin, remove obsolete code, and finish partially completed migrations where relevant. Preserve runtime ownership and existing behavior. Choose splits by responsibility rather than an arbitrary line limit.

Complete each cleanup when the extracted modules have clear owners, callers use them consistently, and the affected behavior passes the repository's applicable checks.

## Project identity and scope

The project is Ivaldi. Its repository, package names, extension identity, application data, documentation, and release process are owned independently. GitHub Actions workflows have been removed, releases are built and published manually, and automatic desktop updates remain disabled. The remaining work is to validate the distributed identity and agree the audience and supported scope.

Workspace packages now use `@ivaldi/*`, the extension uses `dampish0.ivaldi`, and fresh installs use `~/.config/ivaldi`. Existing legacy data stays in place. A local Ivaldi VSIX has been built; Marketplace publication and native installer validation remain separate release work.

- Align product names, installation instructions, release links, marketplace references, and user-facing documentation.
- Identify compatibility names and upstream attribution that should remain intentional.
- Decide the primary audience and the outcomes the next release should support.
- Define the roles of Work and Developer mode while preserving their shared agent capability.
- Keep the near-term release scope explicit and separate from longer-term roadmap ideas.

Complete when a new user can identify what Ivaldi is, install the intended build, and understand its supported workflows. The next release should have an agreed audience and a bounded feature scope.
