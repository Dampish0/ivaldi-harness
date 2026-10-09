import { describe, expect, mock, test } from 'bun:test';

let nextResponse = new Response('{}');

mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: mock(async () => nextResponse),
}));

const { fetchPasskeyStatus } = await import('./passkeys');

describe('fetchPasskeyStatus', () => {
  test('reads the status the server reports', async () => {
    nextResponse = Response.json({ enabled: true, hasPasskeys: true, passkeyCount: 2, rpID: 'example.test' });

    expect(await fetchPasskeyStatus()).toEqual({ enabled: true, hasPasskeys: true, passkeyCount: 2, rpID: 'example.test' });
  });

  test('fails instead of reporting passkeys as off when the request fails', async () => {
    nextResponse = Response.json({ error: 'Passkey store unavailable' }, { status: 500 });

    await expect(fetchPasskeyStatus()).rejects.toThrow('Passkey store unavailable');
  });
});
