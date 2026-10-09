import { describe, expect, it } from 'vitest';
import { createTunnelAuth } from './tunnel-auth.js';

const tunnelRequest = (headers, remoteAddress = '127.0.0.1') => ({
  headers,
  // What Express derives from X-Forwarded-Host when the hop is trusted.
  hostname: headers['x-forwarded-host'] || headers.host,
  socket: { remoteAddress },
});

const createActiveTunnelAuth = () => {
  const auth = createTunnelAuth();
  auth.setActiveTunnel({ tunnelId: 'tunnel-1', publicUrl: 'https://abc.trycloudflare.com', mode: 'quick' });
  return auth;
};

describe('tunnel request scope', () => {
  it('classifies the tunnel host as tunnel scope', () => {
    const auth = createActiveTunnelAuth();

    expect(auth.classifyRequestScope(tunnelRequest({ host: 'abc.trycloudflare.com' }))).toBe('tunnel');
  });

  it('keeps tunnel traffic in tunnel scope when the client claims a local forwarded host', () => {
    // The tunnel connector runs on loopback, so Express trusts its
    // X-Forwarded-Host and req.hostname would read "localhost".
    const auth = createActiveTunnelAuth();

    expect(auth.classifyRequestScope(tunnelRequest({
      host: 'abc.trycloudflare.com',
      'x-forwarded-host': 'localhost',
    }))).toBe('tunnel');
  });

  it('does not treat a local Host as local when a forwarded host names somewhere else', () => {
    const auth = createActiveTunnelAuth();

    expect(auth.classifyRequestScope(tunnelRequest({
      host: '127.0.0.1:3000',
      'x-forwarded-host': 'attacker.example',
    }))).toBe('unknown-public');
  });

  it('classifies a loopback request with a loopback Host as local', () => {
    const auth = createActiveTunnelAuth();

    expect(auth.classifyRequestScope(tunnelRequest({ host: '127.0.0.1:3000' }))).toBe('local');
    expect(auth.classifyRequestScope(tunnelRequest({ host: 'localhost:3000' }))).toBe('local');
  });

  it('treats an unknown public host as unknown-public while a tunnel is active', () => {
    const auth = createActiveTunnelAuth();

    expect(auth.classifyRequestScope(tunnelRequest({ host: 'other.example' }, '203.0.113.9'))).toBe('unknown-public');
  });
});
