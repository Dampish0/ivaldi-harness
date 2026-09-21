import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import type { NativeRuntime } from './connection.ts';
import { ProvidersStore, ProviderOperationError, collectPromptInputs, createProvidersStore, defaultPromptValues, oauthAuthorizationSchema, providerAuthMethods, providerAuthMethodsSchema, providerCatalogSchema, providerSourcesSchema, shouldOpenOAuthUrl, supportsApiKey, visiblePrompts, type AuthPrompt, type OAuthAuthorization, type ProviderCatalog, type ProvidersTransport } from './providers.ts';

const catalog: ProviderCatalog = { all: [
  { id: 'api', name: 'API provider', source: 'api', models: { 'org/model': { id: 'org/model', name: 'API model' } } },
  { id: 'oauth', name: 'Browser provider', models: {} },
  { id: 'only-oauth', name: 'Browser only', models: {} },
  { id: 'claude-code', name: 'Claude Code', models: {} },
], connected: [], default: { api: 'org/model' } };
const prompts: AuthPrompt[] = [
  { type: 'select', key: 'account', message: 'Account', options: [{ label: 'Personal', value: 'personal' }, { label: 'Team', value: 'team' }] },
  { type: 'text', key: 'workspace', message: 'Workspace', when: { key: 'account', op: 'eq', value: 'team' } },
  { type: 'text', key: 'personal', message: 'Personal name', when: { key: 'account', op: 'neq', value: 'team' } },
];
const methods = providerAuthMethodsSchema.parse({ api: [{ type: 'api', label: 'API key' }], oauth: [{ type: 'api', label: 'API key' }, { type: 'oauth', label: 'Browser auto' }, { type: 'oauth', label: 'Browser code', prompts }], 'only-oauth': [{ type: 'oauth', label: 'Browser' }], 'claude-code': [{ type: 'oauth', label: 'Claude Code' }] });
const authorization: OAuthAuthorization = { url: 'https://auth.example/sign-in', method: 'auto', instructions: 'Complete the synthetic sign-in.' };
const sources = (stored: boolean) => ({ auth: { exists: stored }, user: { exists: true }, project: { exists: false }, custom: { exists: false } });
function setup(overrides: Partial<ProvidersTransport> = {}) {
  let stored = false;
  let directory: string | undefined | null = '/project-one';
  const calls = { catalog: 0, methods: 0, source: 0, key: 0, remove: 0, authorize: 0, callback: 0, apply: 0, refresh: 0 };
  const transport: ProvidersTransport = {
    directory: () => directory,
    catalog: async () => { calls.catalog++; return catalog; },
    methods: async () => { calls.methods++; return methods; },
    source: async () => { calls.source++; return sources(stored); },
    saveKey: async () => { calls.key++; stored = true; return true; },
    removeAuth: async () => { calls.remove++; stored = false; return { success: true, removed: true, requiresRestart: true, restartDeferred: true }; },
    authorize: async (_id, method) => { calls.authorize++; return { ...authorization, method: method === 2 ? 'code' : 'auto' }; },
    callback: async () => { calls.callback++; stored = true; return true; },
    apply: async () => { calls.apply++; return { success: true, requiresReload: true }; },
    refreshModels: async () => { calls.refresh++; },
    ...overrides,
  };
  return { store: new ProvidersStore(transport), calls, transport, directory(value: string | undefined | null) { directory = value; } };
}

test('unresolved provider scope rejects every read and mutation before any adapter call', async () => {
  const { store, calls } = setup({ directory: () => null });
  let configActions = 0;
  const unavailable = (error: Error) => error instanceof ProviderOperationError;
  await assert.rejects(store.load(), unavailable);
  await assert.rejects(store.loadCatalog(), unavailable);
  await assert.rejects(store.loadMethods(), unavailable);
  await assert.rejects(store.loadSource('api'), unavailable);
  assert.equal(store.getSnapshot().sources.api.error, true);
  await assert.rejects(store.saveApiKey('api', 'synthetic-key'), unavailable);
  await assert.rejects(store.removeStoredAuth('api'), unavailable);
  await assert.rejects(store.authorize('oauth', 1, {}), unavailable);
  await assert.rejects(store.completeOAuth('oauth', 1), unavailable);
  await assert.rejects(store.apply(), unavailable);
  await assert.rejects(store.confirmManualRestart(), unavailable);
  await assert.rejects(store.configurationChange('api', async () => { configActions++; }), unavailable);
  assert.deepEqual(Object.values(calls), Object.values(calls).map(() => 0));
  assert.equal(configActions, 0);
  assert.deepEqual(store.getSnapshot().catalog, { value: null, loading: false, error: true });
  assert.deepEqual(store.getSnapshot().methods, { value: null, loading: false, error: true });
  assert.equal(store.getSnapshot().mutation, null);
});

test('resolved project and resolved host-default can each retry an unresolved catalog', async () => {
  for (const resolved of ['/restored-project', undefined]) {
    const fixture = setup();
    fixture.directory(null);
    await assert.rejects(fixture.store.load());
    const requested: Array<string | undefined> = [];
    fixture.transport.catalog = async directory => { requested.push(directory); return catalog; };
    fixture.directory(resolved);
    await fixture.store.load();
    await fixture.store.saveApiKey('api', 'synthetic-key');
    assert.deepEqual(requested, [resolved]);
    assert.deepEqual(fixture.store.getSnapshot().catalog.value, catalog);
    assert.equal(fixture.store.getSnapshot().catalog.error, false);
    assert.equal(fixture.calls.key, 1);
  }
});

test('scope becoming unresolved discards late reads and blocks loaded provider actions while retaining pending Apply', async () => {
  const fixture = setup();
  await fixture.store.load();
  await fixture.store.saveApiKey('api', 'synthetic-key');
  const pending = Promise.withResolvers<ProviderCatalog>();
  fixture.transport.catalog = async () => pending.promise;
  const old = fixture.store.loadCatalog();
  const calls = { ...fixture.calls };
  fixture.directory(null);
  await assert.rejects(fixture.store.load());
  await assert.rejects(fixture.store.saveApiKey('api', 'synthetic-replacement'));
  await assert.rejects(fixture.store.removeStoredAuth('api'));
  await assert.rejects(fixture.store.apply());
  const unavailable = fixture.store.getSnapshot();
  pending.resolve(catalog); await old;
  assert.strictEqual(fixture.store.getSnapshot(), unavailable);
  assert.deepEqual(fixture.calls, calls);
  assert.deepEqual(unavailable.pendingRestart, ['api']);
  assert.equal(unavailable.applyState, 'pending');
  assert.equal(unavailable.catalog.value, null);
});

test('manual restart acknowledgment remains pending while scope is unresolved and can retry after resolution', async () => {
  const fixture = setup({ apply: async () => ({ success: true, requiresManualRestart: true }) });
  await fixture.store.load(); await fixture.store.saveApiKey('api', 'synthetic-key');
  assert.equal(await fixture.store.apply(), 'manual');
  fixture.directory(null);
  const calls = { ...fixture.calls };
  await assert.rejects(fixture.store.confirmManualRestart());
  assert.deepEqual(fixture.calls, calls);
  assert.equal(fixture.store.getSnapshot().applyState, 'manual');
  assert.deepEqual(fixture.store.getSnapshot().pendingRestart, ['api']);
  fixture.directory('/restored-project');
  assert.equal(await fixture.store.confirmManualRestart(), 'ready');
});

test('provider parsing strips credentials, options and paths from snapshots', () => {
  const safe = providerCatalogSchema.parse({ ...catalog, all: [{ ...catalog.all[0], key: 'synthetic-private-key', options: { apiKey: 'synthetic-option-key' } }] });
  assert.equal(JSON.stringify(safe).includes('synthetic-'), false);
  assert.deepEqual(safe.all[0], catalog.all[0]);
  const source = providerSourcesSchema.parse({ ...sources(true), auth: { exists: true, key: 'synthetic-private-key' }, user: { exists: true, path: '/private/config' } });
  assert.deepEqual(source, sources(true));
});

test('parallel read failure retains the successful catalog without inventing API support', async () => {
  const { store, calls } = setup({ methods: async () => { throw new Error('Private upstream response'); } });
  await assert.rejects(store.load(), ProviderOperationError);
  assert.deepEqual(store.getSnapshot().catalog.value, catalog);
  assert.equal(store.getSnapshot().methods.error, true);
  assert.equal(providerAuthMethods(store.getSnapshot(), 'only-oauth'), null);
  assert.equal(supportsApiKey(providerAuthMethods(store.getSnapshot(), 'only-oauth')), false);
  await assert.rejects(store.saveApiKey('api', 'synthetic-private-key'));
  assert.equal(calls.key, 0);
});

test('overlapping catalog and method reads share requests and failed refresh preserves data', async () => {
  const pending = Promise.withResolvers<void>();
  let requests = 0;
  let fail = false;
  const { store } = setup({ catalog: async () => { requests++; await pending.promise; if (fail) throw new Error('Failed'); return catalog; } });
  const first = store.loadCatalog();
  assert.strictEqual(first, store.loadCatalog());
  pending.resolve(); await first;
  assert.equal(requests, 1);
  const saved = store.getSnapshot().catalog.value;
  fail = true;
  await assert.rejects(store.loadCatalog());
  assert.strictEqual(store.getSnapshot().catalog.value, saved);
  assert.equal(store.getSnapshot().catalog.error, true);
});

test('successful empty catalog differs from failed and malformed catalogs', async () => {
  const { store, transport } = setup();
  await store.load();
  transport.catalog = async () => JSON.parse('{"all":false}');
  await assert.rejects(store.loadCatalog());
  assert.deepEqual(store.getSnapshot().catalog.value, catalog);
  transport.catalog = async () => ({ all: [], connected: [], default: {} });
  await store.loadCatalog();
  assert.deepEqual(store.getSnapshot().catalog.value, { all: [], connected: [], default: {} });
  assert.equal(store.getSnapshot().catalog.error, false);
});

test('one source failure preserves its previous data and unrelated provider sources', async () => {
  const { store, transport } = setup();
  await Promise.all([store.loadSource('api'), store.loadSource('oauth')]);
  const saved = store.getSnapshot().sources;
  transport.source = async () => { throw new Error('Private upstream response'); };
  await assert.rejects(store.loadSource('api'));
  assert.strictEqual(store.getSnapshot().sources.oauth, saved.oauth);
  assert.strictEqual(store.getSnapshot().sources.api.value, saved.api.value);
  assert.equal(store.getSnapshot().sources.api.error, true);
});

test('saving an API key stores no secret, reports pending apply and leaves runtime availability authoritative', async () => {
  let received = '';
  const { store, calls, transport } = setup();
  const save = transport.saveKey;
  transport.saveKey = async (id, key, signal) => { received = key; return save(id, key, signal); };
  await store.load();
  await store.saveApiKey('api', ' synthetic-private-key ');
  assert.equal(received, 'synthetic-private-key');
  assert.equal(calls.key, 1);
  assert.deepEqual(store.getSnapshot().pendingRestart, ['api']);
  assert.equal(store.getSnapshot().applyState, 'pending');
  assert.deepEqual(store.getSnapshot().catalog.value?.connected, []);
  assert.equal(store.getSnapshot().sources.api.value?.auth.exists, true);
  assert.equal(JSON.stringify(store.getSnapshot()).includes('synthetic-private-key'), false);
});

test('API writes require loaded capability, nonempty input and cannot target OAuth-only providers', async () => {
  const { store, calls } = setup();
  await assert.rejects(store.saveApiKey('api', 'key'));
  await store.load();
  await assert.rejects(store.saveApiKey('api', ' '));
  await assert.rejects(store.saveApiKey('only-oauth', 'key'));
  assert.equal(calls.key, 0);
  assert.equal(supportsApiKey([]), true);
  assert.equal(supportsApiKey(methods.oauth), true);
  assert.equal(supportsApiKey(methods['only-oauth']), false);
});

test('failed mutation keeps committed data and sanitizes upstream errors', async () => {
  const { store } = setup({ saveKey: async () => { throw new Error('synthetic-secret-in-server-error'); } });
  await store.load();
  await assert.rejects(store.saveApiKey('api', 'synthetic-private-key'), error => error instanceof ProviderOperationError && error.message === 'request');
  assert.equal(store.getSnapshot().mutation, null);
  assert.deepEqual(store.getSnapshot().pendingRestart, []);
  assert.equal(JSON.stringify(store.getSnapshot()).includes('synthetic-'), false);
});

test('a successful credential write remains successful when its subsequent source refresh fails', async () => {
  const { store } = setup({ source: async () => { throw new Error('Offline'); } });
  await store.load(); await store.saveApiKey('api', 'synthetic-private-key');
  assert.deepEqual(store.getSnapshot().pendingRestart, ['api']);
  assert.equal(store.getSnapshot().sources.api.error, true);
  assert.equal(store.getSnapshot().error, null);
});

test('same-frame mutations cannot issue duplicate credential requests', async () => {
  const pending = Promise.withResolvers<boolean>();
  let writes = 0;
  const { store } = setup({ saveKey: async () => { writes++; return pending.promise; } });
  await store.load();
  const first = store.saveApiKey('api', 'synthetic-first');
  await assert.rejects(store.saveApiKey('api', 'synthetic-second'), error => error instanceof ProviderOperationError && error.code === 'busy');
  pending.resolve(true); await first;
  assert.equal(writes, 1);
});

test('stored-auth removal preserves provider configuration and empty removal creates no pending apply', async () => {
  const { store, calls, transport } = setup();
  await store.load(); await store.loadSource('api');
  await assert.rejects(store.removeStoredAuth('api'));
  assert.equal(calls.remove, 0);
  await store.saveApiKey('api', 'key');
  await store.apply();
  await store.removeStoredAuth('api');
  assert.equal(store.getSnapshot().sources.api.value?.auth.exists, false);
  assert.equal(store.getSnapshot().sources.api.value?.user.exists, true);
  await store.apply();
  transport.source = async () => sources(true); await store.loadSource('api');
  transport.removeAuth = async () => ({ success: true, removed: false, requiresReload: false });
  await store.removeStoredAuth('api');
  assert.deepEqual(store.getSnapshot().pendingRestart, []);
});

test('conditional prompts preselect choices, reject missing and invalid answers, and exclude hidden values', () => {
  assert.deepEqual(defaultPromptValues(prompts), { account: 'personal', workspace: '', personal: '' });
  assert.deepEqual(visiblePrompts(prompts, { account: 'team' }).map(prompt => prompt.key), ['account', 'workspace']);
  assert.throws(() => collectPromptInputs(prompts, { account: 'team' }), error => error instanceof ProviderOperationError && error.field === 'workspace');
  assert.throws(() => collectPromptInputs(prompts, { account: 'invalid', personal: 'Name' }), error => error instanceof ProviderOperationError && error.field === 'account');
  assert.deepEqual(collectPromptInputs(prompts, { account: 'team', workspace: ' Team ', personal: 'hidden-private-answer', unrelated: 'private' }), { account: 'team', workspace: 'Team' });
});

test('CLI authentication metadata cannot authorize deleting stored API credentials', async () => {
  const { store, calls } = setup({ source: async () => sources(true) });
  await store.load(); await store.loadSource('claude-code');
  await assert.rejects(store.removeStoredAuth('claude-code'), ProviderOperationError);
  assert.equal(calls.remove, 0);
});

test('OAuth methods preserve the original array index and their transient authorization details', async () => {
  let authorized = -1;
  let inputs: { [key: string]: string } = {};
  const { store } = setup({ authorize: async (_id, method, values) => { authorized = method; inputs = values; return { ...authorization, method: 'code' }; } });
  await store.load();
  await assert.rejects(store.authorize('oauth', 0, {}));
  const result = await store.authorize('oauth', 2, { account: 'team', workspace: 'Team', personal: 'hidden-private-answer' });
  assert.equal(authorized, 2); assert.deepEqual(inputs, { account: 'team', workspace: 'Team' });
  assert.equal(result?.method, 'code');
  assert.equal(JSON.stringify(store.getSnapshot()).includes(authorization.url), false);
  assert.equal(JSON.stringify(store.getSnapshot()).includes('hidden-private-answer'), false);
});

test('auto OAuth performs its callback without a code; code OAuth trims and requires its pasted code', async () => {
  const callbacks: { method: number; code?: string }[] = [];
  const { store } = setup({ callback: async (_id, method, code) => { callbacks.push({ method, code }); return true; } });
  await store.load();
  await store.authorize('oauth', 1, {});
  assert.equal(await store.completeOAuth('oauth', 1, 'ignored'), true);
  await store.authorize('oauth', 2, { account: 'team', workspace: 'Team' });
  await assert.rejects(store.completeOAuth('oauth', 2, ' '));
  assert.equal(await store.completeOAuth('oauth', 2, ' synthetic-code '), true);
  assert.deepEqual(callbacks, [{ method: 1, code: undefined }, { method: 2, code: 'synthetic-code' }]);
  assert.deepEqual(store.getSnapshot().pendingRestart, ['oauth']);
  assert.equal(JSON.stringify(store.getSnapshot()).includes('synthetic-code'), false);
});

test('failed OAuth callback can be retried without authorizing again', async () => {
  let callbacks = 0;
  const { store, calls } = setup({ callback: async () => ++callbacks > 1 });
  await store.load(); await store.authorize('oauth', 1, {});
  await assert.rejects(store.completeOAuth('oauth', 1));
  assert.equal(await store.completeOAuth('oauth', 1), true);
  assert.equal(calls.authorize, 1);
});

test('cancelling authorization aborts its signal and discards late URL details', async () => {
  const pending = Promise.withResolvers<OAuthAuthorization>();
  let aborted = false;
  const { store } = setup({ authorize: async (_id, _method, _inputs, _directory, signal) => { signal.addEventListener('abort', () => { aborted = true; }); return pending.promise; } });
  await store.load();
  const request = store.authorize('oauth', 1, {});
  store.cancelOAuth(); pending.resolve(authorization);
  assert.equal(await request, null); assert.equal(aborted, true);
  await assert.rejects(store.completeOAuth('oauth', 1));
  assert.equal(store.getSnapshot().mutation, null);
});

test('late completed callback records an accepted credential without replacing a newer OAuth flow', async () => {
  const pending = Promise.withResolvers<boolean>();
  let aborted = false;
  const { store, transport } = setup({ callback: async (_id, _method, _code, _directory, signal) => { signal.addEventListener('abort', () => { aborted = true; }); return pending.promise; } });
  await store.load(); await store.authorize('oauth', 1, {});
  const previous = store.completeOAuth('oauth', 1);
  store.cancelOAuth();
  await store.authorize('oauth', 2, { account: 'team', workspace: 'Team' });
  pending.resolve(true);
  assert.equal(await previous, false); assert.equal(aborted, true);
  assert.deepEqual(store.getSnapshot().pendingRestart, ['oauth']);
  transport.callback = async () => true;
  assert.equal(await store.completeOAuth('oauth', 2, 'new-code'), true);
});

test('Claude Code OAuth does not open its informational URL or require an OpenCode restart', async () => {
  const { store, calls } = setup(); await store.load(); await store.authorize('claude-code', 0, {});
  assert.equal(shouldOpenOAuthUrl('claude-code', authorization), false);
  assert.equal(shouldOpenOAuthUrl('oauth', authorization), true);
  assert.equal(await store.completeOAuth('claude-code', 0), true);
  assert.deepEqual(store.getSnapshot().pendingRestart, []);
  assert.equal(calls.refresh, 1);
});

test('authorization rejects executable URLs, unknown completion modes and empty details', () => {
  for (const value of [{ ...authorization, url: 'javascript:alert(1)' }, { ...authorization, method: 'unknown' }, { method: 'auto', url: '', instructions: '' }]) assert.equal(oauthAuthorizationSchema.safeParse(value).success, false);
  assert.equal(oauthAuthorizationSchema.safeParse({ method: 'auto', url: '', instructions: 'Continue on the connected server.' }).success, true);
});

test('apply refreshes the authoritative catalog and chat models without claiming ready after a failed refresh', async () => {
  const { store, calls, transport } = setup(); await store.load(); await store.saveApiKey('api', 'key');
  transport.catalog = async () => ({ ...catalog, connected: ['api'] });
  let fail = true;
  transport.refreshModels = async () => { calls.refresh++; if (fail) throw new Error('Offline'); };
  assert.equal(await store.apply(), 'refreshFailed');
  assert.equal(store.getSnapshot().applyState, 'refresh');
  assert.deepEqual(store.getSnapshot().catalog.value?.connected, ['api']);
  fail = false;
  assert.equal(await store.apply(), 'ready');
  assert.equal(calls.apply, 1); assert.equal(calls.refresh, 2);
  assert.equal(store.getSnapshot().applyState, 'idle');
});

test('failed apply retains pending changes and retries the explicit reload', async () => {
  const { store, transport } = setup(); await store.load(); await store.saveApiKey('api', 'key');
  let calls = 0;
  transport.apply = async () => { if (++calls === 1) throw new Error('Restart failed'); return { success: true, requiresReload: true }; };
  await assert.rejects(store.apply());
  assert.equal(store.getSnapshot().applyState, 'pending'); assert.deepEqual(store.getSnapshot().pendingRestart, ['api']);
  assert.equal(await store.apply(), 'ready'); assert.equal(calls, 2);
});

test('manual restart guidance remains truthful across catalog refreshes', async () => {
  let applies = 0;
  const { store, calls } = setup({ apply: async () => { applies++; return { success: true, requiresManualRestart: true }; } });
  await store.load(); await store.saveApiKey('api', 'key');
  assert.equal(await store.apply(), 'manual');
  assert.equal(store.getSnapshot().applyState, 'manual'); assert.deepEqual(store.getSnapshot().pendingRestart, ['api']);
  assert.equal(calls.refresh, 0);
  assert.equal(await store.apply(), 'manual');
  assert.equal(applies, 1); assert.equal(calls.refresh, 1);
});

test('managed apply honors the server reload delay before refreshing catalogs', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, calls } = setup({ apply: async () => ({ success: true, requiresReload: true, reloadDelayMs: 800 }) });
  await store.load(); await store.saveApiKey('api', 'key');
  const applied = store.apply();
  await Promise.resolve();
  assert.equal(store.getSnapshot().applyState, 'refresh');
  assert.equal(calls.catalog, 1);
  context.mock.timers.tick(799); await Promise.resolve();
  assert.equal(calls.catalog, 1); assert.equal(calls.refresh, 0);
  context.mock.timers.tick(1);
  assert.equal(await applied, 'ready');
  assert.equal(calls.catalog, 2); assert.equal(calls.refresh, 1);
});

test('manual restart confirmation requires manual guidance and clears it after fresh catalog and models', async () => {
  let applies = 0;
  const { store, calls } = setup({ apply: async () => { applies++; return { success: true, requiresManualRestart: true }; } });
  await assert.rejects(store.confirmManualRestart(), ProviderOperationError);
  await store.load(); await store.saveApiKey('api', 'key');
  await assert.rejects(store.confirmManualRestart(), ProviderOperationError);
  await store.apply();
  assert.equal(await store.confirmManualRestart(), 'ready');
  assert.equal(store.getSnapshot().applyState, 'idle');
  assert.deepEqual(store.getSnapshot().pendingRestart, []);
  assert.equal(applies, 1); assert.equal(calls.catalog, 2); assert.equal(calls.refresh, 1);
});

for (const failedRead of ['catalog', 'models']) test(`failed ${failedRead} refresh retains manual confirmation for retry without another reload`, async () => {
  let applies = 0;
  const { store, transport } = setup({ apply: async () => { applies++; return { success: true, requiresManualRestart: true }; } });
  await store.load(); await store.saveApiKey('api', 'key'); await store.apply();
  const previousCatalog = transport.catalog;
  const previousModels = transport.refreshModels;
  if (failedRead === 'catalog') transport.catalog = async () => { throw new Error('Offline'); };
  else transport.refreshModels = async () => { throw new Error('Offline'); };
  assert.equal(await store.confirmManualRestart(), 'refreshFailed');
  assert.equal(store.getSnapshot().applyState, 'manual');
  assert.deepEqual(store.getSnapshot().pendingRestart, ['api']);
  transport.catalog = previousCatalog; transport.refreshModels = previousModels;
  assert.equal(await store.confirmManualRestart(), 'ready');
  assert.equal(store.getSnapshot().applyState, 'idle');
  assert.equal(applies, 1);
});

test('manual confirmation retains credentials accepted after the user acknowledged the restart', async () => {
  const callback = Promise.withResolvers<boolean>();
  const refresh = Promise.withResolvers<void>();
  const refreshing = Promise.withResolvers<void>();
  let applies = 0;
  const { store } = setup({
    callback: async () => callback.promise,
    apply: async () => { applies++; return { success: true, requiresManualRestart: true }; },
    refreshModels: async () => { refreshing.resolve(); await refresh.promise; },
  });
  await store.load(); await store.authorize('oauth', 1, {});
  const cancelled = store.completeOAuth('oauth', 1); store.cancelOAuth();
  await store.saveApiKey('api', 'key'); await store.apply();
  const confirming = store.confirmManualRestart(); await refreshing.promise;
  callback.resolve(true); assert.equal(await cancelled, false);
  refresh.resolve(); assert.equal(await confirming, 'pending');
  assert.equal(store.getSnapshot().applyState, 'pending');
  assert.ok(store.getSnapshot().pendingRestart.includes('oauth'));
  assert.equal(applies, 1);
  await assert.rejects(store.confirmManualRestart(), ProviderOperationError);
});

test('manual confirmation rejects a stale directory refresh and retry reads the current scope', async () => {
  const pending = Promise.withResolvers<ProviderCatalog>();
  const reading = Promise.withResolvers<void>();
  let applies = 0;
  const { store, transport, directory } = setup({ apply: async () => { applies++; return { success: true, requiresManualRestart: true }; } });
  await store.load(); await store.saveApiKey('api', 'key'); await store.apply();
  transport.catalog = async () => { reading.resolve(); return pending.promise; };
  const confirming = store.confirmManualRestart(); await reading.promise;
  directory('/project-two'); pending.resolve(catalog);
  assert.equal(await confirming, 'refreshFailed');
  assert.equal(store.getSnapshot().catalog.value, null);
  assert.equal(store.getSnapshot().applyState, 'manual');
  assert.deepEqual(store.getSnapshot().pendingRestart, ['api']);
  transport.catalog = async requested => { assert.equal(requested, '/project-two'); return catalog; };
  assert.equal(await store.confirmManualRestart(), 'ready');
  assert.equal(applies, 1);
});

test('disposing during the reload delay prevents subsequent catalog or model refresh', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, calls } = setup({ apply: async () => ({ success: true, requiresReload: true, reloadDelayMs: 800 }) });
  await store.load();
  const applied = store.apply(); await Promise.resolve();
  store.dispose();
  await assert.rejects(applied);
  context.mock.timers.tick(800);
  assert.equal(calls.catalog, 1); assert.equal(calls.refresh, 0);
});

test('an excessive reload hint stays bounded after the backend has reported readiness', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, calls } = setup({ apply: async () => ({ success: true, requiresReload: true, reloadDelayMs: 2 ** 32 }) });
  const applied = store.apply(); await Promise.resolve();
  context.mock.timers.tick(29_999); await Promise.resolve();
  assert.equal(calls.refresh, 0);
  context.mock.timers.tick(1);
  assert.equal(await applied, 'ready');
  assert.equal(calls.refresh, 1);
});

test('a directory change during Apply refresh cannot report the old catalog as ready', async () => {
  const pending = Promise.withResolvers<ProviderCatalog>();
  const reading = Promise.withResolvers<void>();
  const { store, transport, directory, calls } = setup();
  await store.load(); await store.saveApiKey('api', 'key');
  transport.catalog = async () => { reading.resolve(); return pending.promise; };
  const applied = store.apply(); await reading.promise;
  directory('/project-two'); pending.resolve(catalog);
  assert.equal(await applied, 'refreshFailed');
  assert.equal(store.getSnapshot().applyState, 'refresh');
  assert.equal(store.getSnapshot().catalog.value, null);
  transport.catalog = async () => catalog;
  assert.equal(await store.apply(), 'ready');
  assert.equal(calls.apply, 1);
});

for (const completion of ['reload', 'refresh']) test(`late accepted OAuth during Apply ${completion} keeps new credentials pending`, async () => {
  const callback = Promise.withResolvers<boolean>();
  const reload = Promise.withResolvers<void>();
  const refresh = Promise.withResolvers<void>();
  const refreshing = Promise.withResolvers<void>();
  let applied = 0;
  const { store } = setup({
    callback: async () => callback.promise,
    apply: async () => { applied++; await reload.promise; return { success: true, requiresReload: true }; },
    refreshModels: async () => { refreshing.resolve(); await refresh.promise; },
  });
  await store.load(); await store.authorize('oauth', 1, {});
  const cancelled = store.completeOAuth('oauth', 1); store.cancelOAuth();
  await store.saveApiKey('api', 'key');
  const applying = store.apply();
  if (completion === 'refresh') { reload.resolve(); await refreshing.promise; }
  callback.resolve(true); assert.equal(await cancelled, false);
  reload.resolve(); refresh.resolve();
  assert.equal(await applying, 'pending');
  assert.equal(store.getSnapshot().applyState, 'pending');
  assert.ok(store.getSnapshot().pendingRestart.includes('oauth'));
  assert.equal(await store.apply(), 'ready');
  assert.equal(applied, 2);
});

test('directory replacement discards stale catalog and sources without moving pending server changes', async () => {
  const pending = Promise.withResolvers<ProviderCatalog>();
  const { store, transport, directory } = setup(); await store.load(); await store.saveApiKey('api', 'key');
  transport.catalog = async requested => requested === '/project-one' ? pending.promise : { all: [], connected: [], default: {} };
  const old = store.loadCatalog();
  directory('/project-two'); await store.load();
  pending.resolve(catalog); await old;
  assert.deepEqual(store.getSnapshot().catalog.value?.all, []);
  assert.deepEqual(store.getSnapshot().sources, {});
  assert.deepEqual(store.getSnapshot().pendingRestart, ['api']);
});

test('runtime disposal aborts requests and prevents late credential or catalog state from publishing', async () => {
  const pending = Promise.withResolvers<boolean>(); let aborted = false;
  const { store } = setup({ saveKey: async (_id, _key, signal) => { signal.addEventListener('abort', () => { aborted = true; }); return pending.promise; } });
  await store.load(); const request = store.saveApiKey('api', 'key');
  store.dispose(); const saved = store.getSnapshot(); pending.resolve(true); await request;
  assert.equal(aborted, true); assert.strictEqual(store.getSnapshot(), saved);
  await assert.rejects(store.saveApiKey('api', 'key'));
});

test('a credential mutation invalidates stale source reads without leaving a loading spinner stranded', async () => {
  const pending = Promise.withResolvers<ReturnType<typeof sources>>();
  let reads = 0;
  const { store } = setup({ source: async () => ++reads === 1 ? pending.promise : sources(true) });
  await store.load();
  const previous = store.loadSource('api');
  await store.saveApiKey('api', 'key');
  pending.resolve(sources(false)); await previous;
  assert.equal(store.getSnapshot().sources.api.value?.auth.exists, true);
  assert.equal(store.getSnapshot().sources.api.loading, false);
});

test('disposed stores reject fresh reads without issuing transport work', async () => {
  const { store, calls } = setup(); store.dispose();
  await assert.rejects(store.load()); await assert.rejects(store.loadSource('api'));
  assert.equal(calls.catalog + calls.methods + calls.source, 0);
});

test('SDK adapter preserves scoped endpoints and stores credentials only through auth.set', async () => {
  const requests: Request[] = [];
  let stored = false;
  let directory = '/first project';
  let refreshed = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request.clone());
    const url = new URL(request.url);
    if (url.pathname === '/api/provider') return Response.json({ ...catalog, connected: stored ? ['api'] : [] });
    if (url.pathname === '/api/provider/auth') return Response.json(methods);
    if (url.pathname === '/api/provider/api/source') return Response.json({ providerId: 'api', sources: sources(stored) });
    if (url.pathname === '/api/auth/api') { stored = true; return Response.json(true); }
    if (url.pathname === '/api/provider/api/auth' && request.method === 'DELETE') { stored = false; return Response.json({ success: true, removed: true, restartDeferred: true }); }
    if (url.pathname === '/api/config/reload') return Response.json({ success: true, requiresReload: true });
    return Response.json({}, { status: 404 });
  };
  const sdk = createOpencodeClient({ baseUrl: 'https://native-fixture.example/api', fetch });
  const json: NativeRuntime['json'] = async (path, schema, init) => {
    const response = await fetch(`https://native-fixture.example${path}`, init);
    if (!response.ok) throw new Error('Fixture request failed');
    return schema.parse(await response.json());
  };
  const store = createProvidersStore({ sdk, json }, { directory: () => directory, refreshModels: async () => { refreshed++; } });
  await store.load(); await store.saveApiKey('api', 'synthetic-key');
  const savedKey = requests.find(request => new URL(request.url).pathname === '/api/auth/api');
  assert.ok(savedKey); assert.equal(savedKey.method, 'PUT');
  assert.deepEqual(await savedKey.json(), { type: 'api', key: 'synthetic-key' });
  await store.removeStoredAuth('api');
  const removed = requests.find(request => request.method === 'DELETE');
  assert.ok(removed);
  assert.equal(new URL(removed.url).searchParams.get('scope'), 'auth');
  assert.equal(new URL(removed.url).searchParams.get('directory'), '/first project');
  directory = '/second project'; await store.load();
  assert.ok(requests.some(request => new URL(request.url).pathname === '/api/provider/auth' && new URL(request.url).searchParams.get('directory') === '/second project'));
  assert.equal(await store.apply(), 'ready'); assert.equal(refreshed, 1);
  assert.equal(requests.some(request => request.url.includes('synthetic-key')), false);
});

test('SDK adapter rejects source metadata attributed to another provider', async () => {
  const sdk = createOpencodeClient({ baseUrl: 'https://native-fixture.example/api', fetch: async () => Response.json(catalog) });
  const json: NativeRuntime['json'] = async (_path, schema) => schema.parse({ providerId: 'other-provider', sources: sources(true) });
  const store = createProvidersStore({ sdk, json }, { refreshModels: async () => undefined });
  await assert.rejects(store.loadSource('api'));
  assert.equal(store.getSnapshot().sources.api.value, null);
  assert.equal(store.getSnapshot().sources.api.error, true);
});
