# Ivaldi web

The `@ivaldi/web` workspace contains Ivaldi's browser UI, HTTP server, and CLI. It uses OpenCode as the coding runtime.

## Run from source

From the repository root, with Bun and Node.js 22+ installed:

```sh
bun install
bun run build:web
bun run start:web
```

For development, run `bun run dev:web:hmr`. See the [root README](../../README.md) for prerequisites and the [release checklist](../../docs/RELEASE_READINESS.md) for validation status. These instructions do not require a published npm package.

## CLI

The primary packaged executable is `ivaldi`. `openchamber` remains an alias for existing scripts. From a source checkout:

```sh
node packages/web/bin/cli.js --help
node packages/web/bin/cli.js --port 3000
node packages/web/bin/cli.js connect-url --port 3000 --qr
node packages/web/bin/cli.js stop
```

The CLI supports background servers, startup services, tunnels, and session commands. Use command-specific help for options. Releases are built and installed manually; the upstream npm package is not an Ivaldi update channel.

Update checks use `@ivaldi/web` and the Ivaldi GitHub release links. There is no default custom update API. Set `IVALDI_UPDATE_API_URL` only for a deliberately configured service; the legacy override is also accepted.

## Data compatibility

New installs use `~/.config/ivaldi`. An existing `~/.config/openchamber` directory is reused when the Ivaldi directory is absent. `IVALDI_DATA_DIR` takes precedence over the accepted legacy `OPENCHAMBER_DATA_DIR` override. No data or managed worktrees are moved automatically.

The server returns the resolved location in `GET /api/fs/home` as `dataDirectory`. Shared UI, desktop, and the VS Code bridge use this contract. Legacy runtime environment and protocol keys remain supported.

## Development references

- [CLI modules](bin/lib/DOCUMENTATION.md)
- [Filesystem API](server/lib/fs/DOCUMENTATION.md)
- [Contributing](../../CONTRIBUTING.md)

## License

MIT. See the repository license for upstream attribution.
