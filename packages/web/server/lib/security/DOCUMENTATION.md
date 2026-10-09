# Request security module

## Purpose
Owns the checks every HTTP request and WebSocket upgrade passes before any route or socket runtime sees it: bind policy, origin validation, and the request guard against cross-site and DNS rebinding attacks.

## Files
- `bind-host.js`: loopback detection and the refusal to bind a network-exposed host without a UI password, unless `OPENCHAMBER_ALLOW_UNAUTHENTICATED_LAN=true`.
- `request-security.js`: `createRequestSecurityRuntime(deps)`.

## Runtime dependencies
- `readSettingsFromDiskMigrated`: source of the optional `publicOrigin` setting.
- `isUiAuthEnabled()`, `getActiveTunnelHost()`, `isUnauthenticatedLanAllowed()`: read on every request, because the UI auth controller and tunnel change after startup.

## Returned API
- `getUiSessionTokenFromRequest(req)`, `rejectWebSocketUpgrade(socket, status, reason)`.
- `isRequestOriginAllowed(req)`: the strict origin match used by authenticated sockets and the realtime proxy. A missing Origin is not allowed.
- `getUntrustedHttpRequestReason(req)`: returns `'untrusted-host'`, `'cross-site'`, or `null`. `index.js` runs it as middleware right after CORS and answers 403.
- `getUntrustedUnauthenticatedUpgradeReason(req)`: the same checks for WebSocket upgrades when no UI password is set. The terminal, message stream, dictation and dev tunnel runtimes call it in their no-auth branch. With a password they keep their session and origin checks instead.

## Invariants
- Host check, DNS rebinding: applies only when no UI password is set and unauthenticated LAN is not allowed. The raw Host must be a loopback name including `*.localhost`, an IP literal, the active tunnel host, or the `publicOrigin` host. Any other name is a page that rebound its own domain to this machine.
- Cross-site check: applies in every mode, to POSTs a browser can send without a CORS preflight, which means form encoded, multipart, `text/plain` or no content type. Everything else is preflighted, and CORS answers preflights only for packaged and loopback origins.
- An origin is trusted when it is a packaged client origin, has a loopback hostname, has the same host as the raw Host or the first `X-Forwarded-Host`, or equals `publicOrigin`. The opaque `null` origin is never trusted.
- Without an Origin header, a request counts as cross-site only when `Sec-Fetch-Site` says so. Non-browser clients send neither.
- A reverse proxy that rewrites Host and does not set `X-Forwarded-Host` must configure `publicOrigin`, or form posts and unauthenticated sockets from its origin are refused.
- `trust proxy` is `'loopback'`. Only proxies on this machine, such as the tunnel connectors, may set `X-Forwarded-*`. `req.ip` is the only client IP source for rate limiting.
- Tunnel scope classification in `../opencode/tunnel-auth.js` reads the raw Host plus every `X-Forwarded-Host` value, never `req.hostname`. A request is local only if all of them are local.

## Known gaps
- The private relay reaches this server from loopback with a loopback Host, so these checks cannot tell relay traffic from a local browser. Revoking a paired device does not cut off its relay access. Tracked as SEC-4 in `docs/QUALITY_REVIEW.md`.
