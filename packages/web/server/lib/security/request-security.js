import net from 'node:net';
import { isLoopbackBindHost } from './bind-host.js';

// Content types a browser can POST to another origin without a CORS preflight.
// Anything else (JSON, custom headers, PUT/PATCH/DELETE) is preflighted, and
// the CORS middleware only answers preflights from trusted origins.
const CORS_SIMPLE_CONTENT_TYPES = new Set([
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
]);

const stripIpv6Brackets = (hostname) => (
  hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
);

// `*.localhost` is reserved for loopback (RFC 6761) and browsers resolve it
// locally, so an attacker cannot serve a page from it.
const isLoopbackHostname = (hostname) => (
  isLoopbackBindHost(hostname) || hostname.endsWith('.localhost')
);

const isIpLiteral = (hostname) => net.isIP(stripIpv6Brackets(hostname)) !== 0;

// A missing, empty or malformed host throws, either on trim or in the URL
// parser, and counts as no host.
const parseHost = (value, protocol = 'http:') => {
  try {
    const url = new URL(`${protocol}//${value.trim()}`);
    return { host: url.host, hostname: url.hostname };
  } catch {
    return null;
  }
};

// Node gives a header as a string, or undefined when it is absent.
const firstHeaderValue = (value) => (
  String(value ?? '').split(',')[0].trim()
);

const isCorsSimplePost = (req) => {
  if (req.method !== 'POST') {
    return false;
  }
  const contentType = firstHeaderValue(req.headers['content-type']).split(';')[0].trim().toLowerCase();
  return contentType === '' || CORS_SIMPLE_CONTENT_TYPES.has(contentType);
};

export const createRequestSecurityRuntime = (deps) => {
  const {
    readSettingsFromDiskMigrated,
    isUiAuthEnabled = () => false,
    getActiveTunnelHost = () => null,
    isUnauthenticatedLanAllowed = () => false,
  } = deps;
  // Origins of packaged (non-browser) clients whose WebView origin never
  // matches the server host: the desktop shell, the iOS Capacitor WebView
  // (capacitor://localhost), and the Android Capacitor WebView, which uses
  // androidScheme 'https' and therefore reports 'https://localhost'. Missing
  // the Android origin 403'd every WebSocket upgrade from the Android app
  // (message stream, terminal, dictation) while SSE kept working.
  const packagedClientOrigins = new Set([
    'openchamber-ui://app',
    'capacitor://localhost',
    'https://localhost',
  ]);

  const getUiSessionTokenFromRequest = (req) => {
    const cookieHeader = req?.headers?.cookie;
    if (!cookieHeader || typeof cookieHeader !== 'string') {
      return null;
    }
    const segments = cookieHeader.split(';');
    for (const segment of segments) {
      const [rawName, ...rest] = segment.split('=');
      const name = rawName?.trim();
      if (!name) continue;
      if (name !== 'oc_ui_session') continue;
      const value = rest.join('=').trim();
      try {
        return decodeURIComponent(value || '');
      } catch {
        return value || null;
      }
    }
    return null;
  };

  const rejectWebSocketUpgrade = (socket, statusCode, reason) => {
    if (!socket || socket.destroyed) {
      return;
    }

    const message = typeof reason === 'string' && reason.trim().length > 0 ? reason.trim() : 'Bad Request';
    const body = Buffer.from(message, 'utf8');
    const statusText = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error',
    }[statusCode] || 'Bad Request';

    try {
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
        'Connection: close\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        `Content-Length: ${body.length}\r\n\r\n`
      );
      socket.write(body);
    } catch {
    }

    try {
      socket.destroy();
    } catch {
    }
  };

  const getRequestOriginCandidates = async (req) => {
    const origins = new Set();
    const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
      ? req.headers['x-forwarded-proto'].split(',')[0].trim().toLowerCase()
      : '';
    const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http');

    const forwardedHost = typeof req.headers['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host'].split(',')[0].trim()
      : '';
    const host = forwardedHost || (typeof req.headers.host === 'string' ? req.headers.host.trim() : '');

    if (host) {
      origins.add(`${protocol}://${host}`);
      const [hostname, port] = host.split(':');
      const normalizedHost = typeof hostname === 'string' ? hostname.toLowerCase() : '';
      const portSuffix = typeof port === 'string' && port.length > 0 ? `:${port}` : '';
      if (normalizedHost === 'localhost') {
        origins.add(`${protocol}://127.0.0.1${portSuffix}`);
        origins.add(`${protocol}://[::1]${portSuffix}`);
      } else if (normalizedHost === '127.0.0.1' || normalizedHost === '[::1]') {
        origins.add(`${protocol}://localhost${portSuffix}`);
      }
    }

    try {
      const settings = await readSettingsFromDiskMigrated();
      if (typeof settings?.publicOrigin === 'string' && settings.publicOrigin.trim().length > 0) {
        origins.add(new URL(settings.publicOrigin.trim()).origin);
      }
    } catch {
    }

    return origins;
  };

  const isRequestOriginAllowed = async (req) => {
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    if (!originHeader) {
      return false;
    }

    if (packagedClientOrigins.has(originHeader)) {
      return true;
    }

    let normalizedOrigin = '';
    try {
      normalizedOrigin = new URL(originHeader).origin;
    } catch {
      return false;
    }

    const allowedOrigins = await getRequestOriginCandidates(req);
    return allowedOrigins.has(normalizedOrigin);
  };

  // A failed read and a missing, non-string or invalid value all throw here,
  // and each one means there is no public origin to trust.
  const readPublicOrigin = async () => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      return new URL(settings.publicOrigin.trim());
    } catch {
      return null;
    }
  };

  // Without a UI password the server binds to loopback, so a legitimate
  // browser reaches it as localhost, an IP literal, the active tunnel host,
  // or the configured public origin. Any other name means a DNS rebinding
  // page is talking to us under its own hostname.
  const isTrustedHostHeader = async (req) => {
    const host = parseHost(req.headers?.host);
    if (!host) {
      // Browsers always send Host. A request without one is not a browser.
      return true;
    }
    if (isLoopbackHostname(host.hostname) || isIpLiteral(host.hostname)) {
      return true;
    }
    const tunnelHost = parseHost(getActiveTunnelHost() || '');
    if (tunnelHost && tunnelHost.hostname === host.hostname) {
      return true;
    }
    const publicOrigin = await readPublicOrigin();
    return Boolean(publicOrigin && publicOrigin.hostname === host.hostname);
  };

  // Compares hosts rather than full origins: a TLS-terminating proxy that
  // does not set X-Forwarded-Proto still yields a matching host, and a scheme
  // difference on the same host is not a cross-site request.
  const isTrustedBrowserOrigin = async (req, origin) => {
    if (packagedClientOrigins.has(origin)) {
      return true;
    }
    let url;
    try {
      url = new URL(origin);
    } catch {
      // Includes the opaque "null" origin of sandboxed frames and file pages.
      return false;
    }
    if (isLoopbackHostname(url.hostname)) {
      return true;
    }
    for (const candidate of [req.headers?.host, firstHeaderValue(req.headers?.['x-forwarded-host'])]) {
      const host = parseHost(candidate, url.protocol);
      if (host && host.host === url.host) {
        return true;
      }
    }
    const publicOrigin = await readPublicOrigin();
    return Boolean(publicOrigin && publicOrigin.origin === url.origin);
  };

  const isCrossSiteBrowserRequest = async (req) => {
    const origin = firstHeaderValue(req.headers?.origin);
    if (origin) {
      return !(await isTrustedBrowserOrigin(req, origin));
    }
    return firstHeaderValue(req.headers?.['sec-fetch-site']).toLowerCase() === 'cross-site';
  };

  const shouldCheckHost = () => !isUiAuthEnabled() && !isUnauthenticatedLanAllowed();

  /**
   * Why an HTTP request must be refused before routing, or null to continue.
   * Blocks DNS rebinding when no UI password is set, and cross-site form
   * posts in every mode.
   */
  const getUntrustedHttpRequestReason = async (req) => {
    if (shouldCheckHost() && !(await isTrustedHostHeader(req))) {
      return 'untrusted-host';
    }
    if (isCorsSimplePost(req) && await isCrossSiteBrowserRequest(req)) {
      return 'cross-site';
    }
    return null;
  };

  /**
   * Gate for WebSocket upgrades when no UI password is set. With a password,
   * each socket runtime checks the session token and origin itself.
   */
  const getUntrustedUnauthenticatedUpgradeReason = async (req) => {
    if (isUiAuthEnabled()) {
      return null;
    }
    if (shouldCheckHost() && !(await isTrustedHostHeader(req))) {
      return 'untrusted-host';
    }
    if (await isCrossSiteBrowserRequest(req)) {
      return 'cross-site';
    }
    return null;
  };

  return {
    getUiSessionTokenFromRequest,
    rejectWebSocketUpgrade,
    isRequestOriginAllowed,
    getUntrustedHttpRequestReason,
    getUntrustedUnauthenticatedUpgradeReason,
  };
};
