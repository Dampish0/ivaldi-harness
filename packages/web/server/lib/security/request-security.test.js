import { describe, expect, test } from 'bun:test';
import { createRequestSecurityRuntime } from './request-security.js';

const createRuntime = () => createRequestSecurityRuntime({
  readSettingsFromDiskMigrated: async () => ({}),
});

describe('request security runtime', () => {
  test('allows packaged client origins for remote client transports', async () => {
    const runtime = createRuntime();

    await expect(runtime.isRequestOriginAllowed({
      headers: {
        origin: 'openchamber-ui://app',
        host: '192.168.1.130:1202',
      },
      socket: {},
    })).resolves.toBe(true);

    await expect(runtime.isRequestOriginAllowed({
      headers: {
        origin: 'capacitor://localhost',
        host: '192.168.1.130:1202',
      },
      socket: {},
    })).resolves.toBe(true);

    // Android Capacitor WebView (androidScheme 'https') reports this origin.
    await expect(runtime.isRequestOriginAllowed({
      headers: {
        origin: 'https://localhost',
        host: '192.168.1.130:1202',
      },
      socket: {},
    })).resolves.toBe(true);
  });

  test('rejects unknown origins', async () => {
    const runtime = createRuntime();

    await expect(runtime.isRequestOriginAllowed({
      headers: {
        origin: 'https://evil.example.com',
        host: '192.168.1.130:1202',
      },
      socket: {},
    })).resolves.toBe(false);
  });
});

const createGuardRuntime = ({
  authEnabled = false,
  tunnelHost = null,
  publicOrigin = '',
  lanAllowed = false,
} = {}) => createRequestSecurityRuntime({
  readSettingsFromDiskMigrated: async () => (publicOrigin ? { publicOrigin } : {}),
  isUiAuthEnabled: () => authEnabled,
  getActiveTunnelHost: () => tunnelHost,
  isUnauthenticatedLanAllowed: () => lanAllowed,
});

const request = (method, headers) => ({ method, headers, socket: {} });

describe('cross-site request guard', () => {
  test('refuses a form post from another site', async () => {
    const runtime = createGuardRuntime({ authEnabled: true });

    await expect(runtime.getUntrustedHttpRequestReason(request('POST', {
      host: '127.0.0.1:3000',
      origin: 'https://evil.example',
      'content-type': 'application/x-www-form-urlencoded',
    }))).resolves.toBe('cross-site');

    await expect(runtime.getUntrustedHttpRequestReason(request('POST', {
      host: '127.0.0.1:3000',
      origin: 'null',
      'content-type': 'text/plain;charset=UTF-8',
    }))).resolves.toBe('cross-site');
  });

  test('refuses an origin-less form post the browser marks cross-site', async () => {
    const runtime = createGuardRuntime();

    await expect(runtime.getUntrustedHttpRequestReason(request('POST', {
      host: 'localhost:3000',
      'sec-fetch-site': 'cross-site',
      'content-type': 'multipart/form-data; boundary=x',
    }))).resolves.toBe('cross-site');
  });

  test('leaves JSON posts to CORS preflight', async () => {
    const runtime = createGuardRuntime();

    await expect(runtime.getUntrustedHttpRequestReason(request('POST', {
      host: 'localhost:3000',
      origin: 'https://evil.example',
      'content-type': 'application/json',
    }))).resolves.toBe(null);
  });

  test('allows same-host, loopback, packaged, tunnel, and configured public origins', async () => {
    const runtime = createGuardRuntime({
      tunnelHost: 'abc.trycloudflare.com',
      publicOrigin: 'https://ivaldi.example.com',
    });
    const formPost = (headers) => runtime.getUntrustedHttpRequestReason(request('POST', {
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    }));

    await expect(formPost({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })).resolves.toBe(null);
    await expect(formPost({ host: '127.0.0.1:3000', origin: 'http://localhost:5173' })).resolves.toBe(null);
    await expect(formPost({ host: '127.0.0.1:3000', origin: 'openchamber-ui://app' })).resolves.toBe(null);
    await expect(formPost({ host: 'abc.trycloudflare.com', origin: 'https://abc.trycloudflare.com' })).resolves.toBe(null);
    await expect(formPost({
      host: '127.0.0.1:3000',
      'x-forwarded-host': 'proxy.example.com',
      origin: 'https://proxy.example.com',
    })).resolves.toBe(null);
    await expect(formPost({ host: '127.0.0.1:3000', origin: 'https://ivaldi.example.com' })).resolves.toBe(null);
  });

  test('allows a form post with no origin and no fetch metadata', async () => {
    const runtime = createGuardRuntime();

    await expect(runtime.getUntrustedHttpRequestReason(request('POST', {
      host: 'localhost:3000',
      'content-type': 'application/x-www-form-urlencoded',
    }))).resolves.toBe(null);
  });
});

describe('DNS rebinding guard', () => {
  test('refuses an unknown hostname when no UI password is set', async () => {
    const runtime = createGuardRuntime();

    await expect(runtime.getUntrustedHttpRequestReason(request('GET', {
      host: 'evil.example:57123',
    }))).resolves.toBe('untrusted-host');
  });

  test('accepts loopback names, IP literals, the tunnel host, and the public origin', async () => {
    const runtime = createGuardRuntime({
      tunnelHost: 'abc.trycloudflare.com',
      publicOrigin: 'https://ivaldi.example.com',
    });
    const get = (host) => runtime.getUntrustedHttpRequestReason(request('GET', { host }));

    await expect(get('localhost:3000')).resolves.toBe(null);
    await expect(get('app.localhost:3000')).resolves.toBe(null);
    await expect(get('127.0.0.1:3000')).resolves.toBe(null);
    await expect(get('[::1]:3000')).resolves.toBe(null);
    await expect(get('192.168.1.20:3000')).resolves.toBe(null);
    await expect(get('abc.trycloudflare.com')).resolves.toBe(null);
    await expect(get('ivaldi.example.com')).resolves.toBe(null);
  });

  test('defers to authentication once a UI password is set', async () => {
    const runtime = createGuardRuntime({ authEnabled: true });

    await expect(runtime.getUntrustedHttpRequestReason(request('GET', {
      host: 'evil.example:57123',
    }))).resolves.toBe(null);
  });

  test('defers to the operator when unauthenticated LAN access is explicitly allowed', async () => {
    const runtime = createGuardRuntime({ lanAllowed: true });

    await expect(runtime.getUntrustedHttpRequestReason(request('GET', {
      host: 'my-desktop.lan:3000',
    }))).resolves.toBe(null);
  });
});

describe('unauthenticated WebSocket upgrade guard', () => {
  test('refuses a cross-site or rebound upgrade without a UI password', async () => {
    const runtime = createGuardRuntime();

    await expect(runtime.getUntrustedUnauthenticatedUpgradeReason(request('GET', {
      host: '127.0.0.1:3000',
      origin: 'https://evil.example',
    }))).resolves.toBe('cross-site');

    await expect(runtime.getUntrustedUnauthenticatedUpgradeReason(request('GET', {
      host: 'evil.example:3000',
      origin: 'http://evil.example:3000',
    }))).resolves.toBe('untrusted-host');
  });

  test('allows same-origin, packaged, and origin-less upgrades', async () => {
    const runtime = createGuardRuntime();
    const upgrade = (headers) => runtime.getUntrustedUnauthenticatedUpgradeReason(request('GET', headers));

    await expect(upgrade({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })).resolves.toBe(null);
    await expect(upgrade({ host: '127.0.0.1:3000', origin: 'capacitor://localhost' })).resolves.toBe(null);
    await expect(upgrade({ host: '127.0.0.1:3000' })).resolves.toBe(null);
  });

  test('leaves authenticated upgrades to the session and origin checks', async () => {
    const runtime = createGuardRuntime({ authEnabled: true });

    await expect(runtime.getUntrustedUnauthenticatedUpgradeReason(request('GET', {
      host: '127.0.0.1:3000',
      origin: 'https://evil.example',
    }))).resolves.toBe(null);
  });
});
