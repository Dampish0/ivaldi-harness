import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reusablePairingConnection } from './connection-identity.ts';
import type { SavedConnection } from './schema.ts';

const address = 'http://server.example:3901';
const direct: SavedConnection = { id: 'saved-local-id', label: 'Saved server', serverId: 'server-one', candidates: [{ type: 'lan', url: address }] };
const pairing: SavedConnection = { id: 'new-local-id', label: 'New pairing', candidates: [{ type: 'lan', url: address }] };
const relay: SavedConnection['candidates'][number] = { type: 'relay', relayUrl: 'wss://relay.example', serverId: 'server-one', hostEncPubJwk: { kty: 'EC', crv: 'P-256', x: 'synthetic-x', y: 'synthetic-y' } };

test('re-pairing the same verified server preserves its saved local ID', () => {
  assert.strictEqual(reusablePairingConnection([direct], pairing, 'server-one'), direct);
  assert.equal(pairing.id, 'new-local-id');
});

test('a different server at a reused address cannot overwrite the saved connection or token identity', () => {
  assert.equal(reusablePairingConnection([direct], pairing, 'server-two'), undefined);
  assert.equal(direct.id, 'saved-local-id');
  assert.equal(direct.serverId, 'server-one');
});

for (const serverId of [undefined, '', ' ']) {
  test(`${serverId === undefined ? 'an absent' : serverId === '' ? 'an empty' : 'a blank'} probe identity cannot merge existing saved credentials`, () => {
    assert.equal(reusablePairingConnection([direct], pairing, serverId), undefined);
  });
}

test('legacy direct records without a verified identity remain separate when paired again', () => {
  const legacy: SavedConnection = { id: 'legacy-id', label: 'Legacy direct server', candidates: direct.candidates };
  assert.equal(reusablePairingConnection([legacy], pairing, 'server-one'), undefined);
  assert.equal(reusablePairingConnection([legacy], pairing, undefined), undefined);
});

test('legacy relay records retain their existing relay pin as identity authority', () => {
  const legacy: SavedConnection = { id: 'legacy-relay-id', label: 'Legacy relay server', candidates: [relay] };
  const incoming = { ...pairing, candidates: [relay] };
  assert.strictEqual(reusablePairingConnection([legacy], incoming, 'server-one'), legacy);
  assert.equal(reusablePairingConnection([legacy], incoming, 'server-two'), undefined);
});

test('an explicit saved server pin outranks a conflicting relay candidate', () => {
  const conflicting = { ...direct, serverId: 'explicit-server', candidates: [relay] };
  assert.equal(reusablePairingConnection([conflicting], { ...pairing, candidates: [relay] }, 'server-one'), undefined);
});

test('identity matching does not broaden the preceding candidate-overlap reuse policy', () => {
  const moved = { ...pairing, candidates: [{ type: 'lan', url: 'http://moved.example:3901' }] } satisfies SavedConnection;
  assert.equal(reusablePairingConnection([direct], moved, 'server-one'), undefined);
});

test('a stale saved record at the same address cannot hide a later verified match', () => {
  const stale = { ...direct, id: 'stale-local-id', serverId: 'old-server' };
  assert.strictEqual(reusablePairingConnection([stale, direct], pairing, 'server-one'), direct);
});
