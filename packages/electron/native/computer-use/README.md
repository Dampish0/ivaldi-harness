# Ivaldi Computer Use helper

This Windows-only helper gives the managed `ivaldi_computer` OpenCode tool a
small JSON-lines protocol for listing, inspecting, and operating one desktop
window. It is intentionally separate from the Electron renderer and runs with
the same integrity level as Ivaldi.

Build it from `packages/electron`:

```sh
bun run build:computer-use
```

The build publishes a self-contained `win-x64` executable to `publish/`.
Electron Builder creates it automatically and copies only the executable into
the packaged app's `computer-use` resource directory.

## Safety boundaries

- OpenCode's normal tool permission rules govern every `ivaldi_computer` call.
- One process-global lease prevents two sessions from controlling the desktop
  at the same time.
- Input actions require the latest snapshot ID; stale observations are rejected.
- Ivaldi/OpenChamber, elevated windows, terminals, password managers, Windows
  Security, UAC, and credential surfaces are excluded.
- Password accessibility elements are redacted and reject typing.
- Screenshots are returned in memory as tool attachments and are not written to
  temporary files by the helper.
- The header stop control and `Ctrl+Alt+Escape` terminate the helper immediately
  and release the lease.
