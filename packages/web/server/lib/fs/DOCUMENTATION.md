# FS Module Documentation

## Purpose
Own filesystem API behavior for the web server runtime, including workspace-bound file operations, directory listing, and reveal.

## Entrypoints and structure
- `packages/web/server/lib/fs/routes.js`: route registration and runtime-owned state for `/api/fs/*` endpoints.
- `packages/web/server/lib/fs/search.js`: fuzzy filesystem search runtime used by non-FS routes (for example project icon discovery).

## Public exports
- `registerFsRoutes(app, dependencies)` from `routes.js`
  - Registers all filesystem routes:
    - `GET /api/fs/home`
    - `POST /api/fs/mkdir`
    - `GET /api/fs/read`
    - `GET /api/fs/raw`
    - `GET /api/fs/serve/:path(*)`
    - Both send `X-Content-Type-Options: nosniff`. HTML, SVG and XML responses also carry `Content-Security-Policy: sandbox allow-scripts allow-forms`, so a user file never runs with the app's origin. PDF is exempt because Chromium will not render it sandboxed. In a sandboxed preview, session cookies are not sent for relative subresources, so with a UI password set, an HTML preview's own CSS, JS and images do not load.
    - `POST /api/fs/write`
    - `POST /api/fs/upload`
    - `POST /api/fs/delete`
    - `POST /api/fs/rename`
    - `POST /api/fs/reveal`
    - `GET /api/fs/list`
  - Enforces workspace boundary checks with active project + worktree fallback support.
- `createFsSearchRuntime({ fsPromises, path, spawn, resolveGitBinaryForSpawn })` from `search.js`
  - Returns `{ searchFilesystemFiles(rootPath, options) }`.
  - Supports fuzzy matching, hidden-file handling, and optional `git check-ignore` filtering.

## Composition contract with `index.js`
- `GET /api/fs/home` returns `{ home, dataDirectory }`. The VS Code bridge returns the same fields. Shared UI uses the runtime's data directory for projects and chats; older servers without the additive field retain the legacy home-relative fallback. Failed responses are errors, never an empty directory.
- `index.js` provides composition-time dependencies only (platform primitives + callbacks such as `resolveProjectDirectory`, `normalizeDirectoryPath`, and `buildAugmentedPath`).
- `index.js` no longer owns FS route handlers.

## Notes for contributors
- Keep filesystem policy (workspace root checks, error mapping) inside this module, not in the composition root.
- Filesystem `EPERM`/`EACCES` failures use the stable `reason: "os-permission"` response marker. Policy denials such as workspace-boundary or missing-grant failures must not use that marker because a native folder picker cannot remediate them.
- Read-only routes authorize the requested path against the workspace before resolving symlinks. A symlink reached through the workspace may therefore target a file outside it, while a directly requested outside path still requires an exact-path grant. Write routes keep canonical-target boundary checks.
- If adding new `/api/fs/*` endpoints, add them in `routes.js` and extend this document.
- `GET /api/fs/list` may resolve symlinks with `realpath` to read directory contents, but the response `path` and each entry `path` must stay in the caller's requested path space (`path.join(requestedPath, name)`). Returning real paths breaks file-tree expansion for directories reached through workspace symlinks.
- On Windows, `GET /api/fs/list` leaves out directory links whose listing fails with `EPERM` or `EACCES`. These are the legacy profile junctions such as `Cookies` or `My Documents`, which deny listing to everyone. Links the user created still appear.
- `POST /api/fs/upload` accepts one `application/octet-stream` body with `path` and optional `overwrite=true` query parameters. The body streams into a same-directory temp file with a 100 MiB default cap configurable through `OPENCHAMBER_FS_UPLOAD_MAX_BYTES`; failed and oversized uploads clean up that temp file. New files commit through an atomic no-replace link, existing files return `409` unless overwrite is explicit, directory targets are rejected, and the destination parent resolves before writing so uploads cannot escape through workspace symlinks.
