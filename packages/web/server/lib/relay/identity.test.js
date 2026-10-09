import { describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';

import { createRelayIdentityRuntime } from './identity.js';
import { canonicalPublicJwkString } from './signing-key.js';

// In-memory settings store standing in for the on-disk settings file. Updates
// run one at a time, like the queue in settings-runtime.js.
const makeSettingsStore = (initial = {}) => {
  let settings = { ...initial };
  let queue = Promise.resolve();
  let writes = 0;
  return {
    updateSettings: (mutate) => {
      const run = queue.then(async () => {
        const next = await mutate({ ...settings });
        if (next) {
          writes += 1;
          settings = { ...next };
        }
        return { ...settings };
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
    peek: () => settings,
    writeCount: () => writes,
  };
};

describe('relay identity', () => {
  it('derives a stable serverId from the signing key and persists both keypairs', async () => {
    const store = makeSettingsStore();
    const runtime = createRelayIdentityRuntime({ crypto, ...store });
    const identity = await runtime.getRelayIdentity();

    const stored = store.peek();
    expect(stored.relaySigningKey).toBeDefined();
    expect(stored.relayEncryptionKey).toBeDefined();

    const expectedServerId = crypto
      .createHash('sha256')
      .update(canonicalPublicJwkString(stored.relaySigningKey.publicJwk))
      .digest('base64url');
    expect(identity.serverId).toBe(expectedServerId);
    expect(identity.hostEncPubJwk.crv).toBe('P-256');
  });

  it('reuses an existing signing key (serverId stays stable across installs)', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    void privateKey;
    const publicJwk = publicKey.export({ format: 'jwk' });
    const store = makeSettingsStore({
      relaySigningKey: {
        privateJwk: crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }),
        publicJwk,
      },
    });
    // Match private to public so importing works.
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    store.peek().relaySigningKey.privateJwk = pair.privateKey.export({ format: 'jwk' });
    store.peek().relaySigningKey.publicJwk = pair.publicKey.export({ format: 'jwk' });

    const runtime = createRelayIdentityRuntime({ crypto, ...store });
    const identity = await runtime.getRelayIdentity();
    const expected = crypto
      .createHash('sha256')
      .update(canonicalPublicJwkString(pair.publicKey.export({ format: 'jwk' })))
      .digest('base64url');
    expect(identity.serverId).toBe(expected);
  });

  it('creates one identity when two runtimes ask at the same time', async () => {
    const store = makeSettingsStore();
    const [first, second] = await Promise.all([
      createRelayIdentityRuntime({ crypto, ...store }).getRelayIdentity(),
      createRelayIdentityRuntime({ crypto, ...store }).getRelayIdentity(),
    ]);

    expect(first.serverId).toBe(second.serverId);
    expect(first.hostEncPubJwk).toEqual(second.hostEncPubJwk);
    expect(store.writeCount()).toBe(2);
  });

  it('never creates keys when the settings file cannot be read', async () => {
    const runtime = createRelayIdentityRuntime({
      crypto,
      updateSettings: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });

    await expect(runtime.getRelayIdentity()).rejects.toThrow('Unexpected end of JSON input');
  });

  it('produces a verifiable relay auth signature', async () => {
    const store = makeSettingsStore();
    const runtime = createRelayIdentityRuntime({ crypto, ...store });
    const identity = await runtime.getRelayIdentity();
    const { ts, sig, pk } = identity.signRelayAuth('host-control', null);

    const canonical = Buffer.from(pk, 'base64url').toString('utf8');
    const publicJwk = JSON.parse(canonical);
    const key = crypto.createPublicKey({ key: publicJwk, format: 'jwk' });
    const ok = crypto.verify(
      'SHA256',
      Buffer.from(`${ts}.${identity.serverId}.host-control.`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sig, 'base64url'),
    );
    expect(ok).toBe(true);
  });
});
