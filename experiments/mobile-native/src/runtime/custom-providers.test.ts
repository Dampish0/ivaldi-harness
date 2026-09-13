import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import { ProvidersStore, type ProvidersTransport } from './providers.ts';
import { CustomProvidersStore, CustomProviderError, createCustomProvidersStore, createEmptyCustomProviderForm, validateCustomProviderForm, type CustomProviderFormState, type CustomProvidersTransport } from './custom-providers.ts';

const config = { npm: '@ai-sdk/openai-compatible' as const, name: 'QA custom', env: ['FIRST_KEY', 'SECOND_KEY'], options: { baseURL: 'https://native-qa.invalid/v1', headers: { Authorization: 'synthetic-header' } }, models: { first: { name: 'QA model' } } };
const form = (changes: Partial<CustomProviderFormState> = {}): CustomProviderFormState => ({ ...createEmptyCustomProviderForm(), providerID: 'qa-custom', name: 'QA custom', baseURL: 'https://native-qa.invalid/v1', apiKey: 'synthetic-key', models: [{ row: 'm', id: 'first', name: 'QA first' }], ...changes });
function setup(initialExists = false) {
  let exists = initialExists; let stored = false; let revision = 'revision-one'; let directory: string | undefined = '/project';
  const calls = { reads: 0, keys: 0, writes: 0, removes: 0, reloads: 0 };
  const providersTransport: ProvidersTransport = {
    directory: () => directory, catalog: async () => ({ all: [], connected: [], default: {} }), methods: async () => ({}), source: async () => ({ auth: { exists: stored }, user: { exists }, project: { exists: false }, custom: { exists: false } }),
    saveKey: async () => true, removeAuth: async () => ({ success: true, removed: false }), authorize: async () => ({ url: '', instructions: 'QA', method: 'auto' }), callback: async () => true, apply: async () => { calls.reloads++; return { success: true, requiresReload: true }; }, refreshModels: async () => {},
  };
  const providers = new ProvidersStore(providersTransport);
  const transport: CustomProvidersTransport = {
    directory: () => directory,
    editor: async providerId => { calls.reads++; return { providerId, scope: 'user', revision, config: exists ? config : null, credentials: { storedAuth: stored, inline: false } }; },
    saveKey: async () => { calls.keys++; stored = true; return true; },
    save: async providerId => { calls.writes++; exists = true; revision = 'revision-two'; return { success: true, providerId, requiresRestart: true, restartDeferred: true }; },
    remove: async providerId => { calls.removes++; const removed = exists; exists = false; return { success: true, providerId, removed, requiresRestart: removed, restartDeferred: removed }; },
  };
  return { store: new CustomProvidersStore(transport, providers), providers, transport, providersTransport, calls, directory(value: string | undefined) { directory = value; }, revision(value: string) { revision = value; } };
}

test('invalid IDs, empty models, duplicate rows and malformed headers fail before any request or credential write', async () => {
  const { store, calls } = setup();
  for (const invalid of [form({ providerID: '' }), form({ providerID: 'Bad ID' }), form({ models: [] }), form({ baseURL: 'https://' }), form({ models: [{ row: 'a', id: 'a', name: 'A' }, { row: 'b', id: 'a', name: 'B' }] }), form({ headers: [{ row: 'a', key: 'Authorization', value: 'one' }, { row: 'b', key: 'authorization', value: 'two' }] }), form({ headers: [{ row: 'a', key: 'Bad Header', value: 'x' }] })]) {
    await assert.rejects(store.save(invalid), error => error instanceof CustomProviderError && error.reason === 'invalidInput' && Boolean(error.validation));
  }
  assert.deepEqual(calls, { reads: 0, keys: 0, writes: 0, removes: 0, reloads: 0 });
  assert.equal(validateCustomProviderForm(form({ models: [] })).fields.models, 'required');
});

test('create saves auth before guarded config and leaves an explicit pending Apply', async () => {
  const { store, transport, calls, providers } = setup();
  const order: string[] = []; const originalKey = transport.saveKey; const originalSave = transport.save;
  transport.saveKey = async (...args) => { order.push('auth'); return originalKey(...args); };
  transport.save = async (...args) => { order.push('config'); assert.equal(args[1].credentials, 'stored-auth'); assert.equal(args[1].expectedRevision, 'revision-one'); assert.equal(JSON.stringify(args[1]).includes('synthetic-key'), false); return originalSave(...args); };
  await store.save(form());
  assert.deepEqual(order, ['auth', 'config']); assert.equal(calls.keys, 1); assert.equal(calls.writes, 1); assert.equal(calls.reloads, 0);
  assert.deepEqual(providers.getSnapshot().pendingRestart, ['qa-custom']);
  assert.equal(JSON.stringify(store.getSnapshot()).includes('synthetic'), false);
});

test('environment credentials use config only and choose the declared protocol', async () => {
  const { store, transport, calls } = setup();
  const original = transport.save;
  transport.save = async (...args) => { assert.equal(args[1].credentials, 'environment'); assert.deepEqual(args[1].config.env, ['CUSTOM_KEY']); assert.equal(args[1].config.npm, '@ai-sdk/anthropic'); return original(...args); };
  await store.save(form({ apiKey: '{env: CUSTOM_KEY}', protocol: 'anthropic-messages' }));
  assert.equal(calls.keys, 0); assert.equal(calls.writes, 1);
});

test('raw projection seeds the protocol and keeps full environment metadata outside snapshots', async () => {
  const { store, transport } = setup(true); const read = transport.editor;
  transport.editor = async (...args) => ({ ...await read(...args), config: { ...config, npm: '@ai-sdk/openai' }, credentials: { storedAuth: false, inline: true } });
  const editor = await store.readEditor('qa-custom');
  assert.equal(editor.form.protocol, 'openai-responses'); assert.equal(editor.form.apiKey, ''); assert.equal(editor.credentials.inline, true);
  assert.deepEqual(editor.environment, ['FIRST_KEY', 'SECOND_KEY']); assert.equal(editor.form.headers[0].value, 'synthetic-header');
  assert.equal(JSON.stringify(store.getSnapshot()).includes('synthetic-header'), false);
});

test('blank edit credentials request preservation instead of collapsing the environment list', async () => {
  const { store, transport, calls } = setup(true); const original = transport.save;
  const editor = await store.readEditor('qa-custom');
  transport.save = async (...args) => { assert.equal(args[1].credentials, 'preserve'); assert.equal(args[1].config.env, undefined); return original(...args); };
  await store.save({ ...editor.form, name: 'QA changed' }, editor);
  assert.equal(calls.keys, 0);
});

test('preflight revision and scope conflicts stop credential mutation', async () => {
  const { store, revision, calls } = setup(true); const editor = await store.readEditor('qa-custom');
  revision('new-revision');
  await assert.rejects(store.save({ ...editor.form, apiKey: 'synthetic-new' }, editor), error => error instanceof CustomProviderError && error.reason === 'conflict');
  assert.equal(calls.keys, 0); assert.equal(calls.writes, 0);
});

test('create refuses a config already present or an existing catalog identity', async () => {
  const existing = setup(true);
  await assert.rejects(existing.store.save(form()), error => error instanceof CustomProviderError && error.reason === 'conflict');
  const builtIn = setup(); builtIn.providersTransport.catalog = async () => ({ all: [{ id: 'qa-custom', name: 'Built in', models: {} }], connected: [], default: {} });
  await assert.rejects(builtIn.store.save(form()), error => error instanceof CustomProviderError && error.reason === 'conflict');
  assert.equal(existing.calls.keys + builtIn.calls.keys, 0);
});

test('auth failure cannot create orphan config or pending Apply', async () => {
  const { store, transport, providers, calls } = setup(); transport.saveKey = async () => { throw new Error('synthetic-private-error'); };
  await assert.rejects(store.save(form()), error => error instanceof CustomProviderError && error.reason === 'request');
  assert.equal(calls.writes, 0); assert.deepEqual(providers.getSnapshot().pendingRestart, []);
  assert.equal(JSON.stringify(store.getSnapshot()).includes('synthetic-private'), false);
});

test('config failure after auth records partial success and retry never repeats accepted auth', async () => {
  const { store, transport, providers, calls } = setup(); const save = transport.save;
  transport.save = async () => { throw new Error('Failed config'); };
  await assert.rejects(store.save(form()), error => error instanceof CustomProviderError && error.reason === 'credentialSavedConfigFailed');
  assert.equal(store.getSnapshot().error?.credentialSaved, true); assert.deepEqual(providers.getSnapshot().pendingRestart, ['qa-custom']);
  transport.save = async (...args) => { assert.equal(args[1].credentials, 'stored-auth'); return save(...args); };
  await store.save(form({ apiKey: '' }));
  assert.equal(calls.keys, 1); assert.equal(calls.writes, 1); assert.equal(store.getSnapshot().error, null);
});

test('reopening a partial create exposes only scoped credential presence and permits a blank-key retry', async () => {
  const { store, transport, calls } = setup(); const save = transport.save;
  transport.save = async () => { throw new Error('Failed config'); };
  await assert.rejects(store.save(form()));
  assert.equal(store.hasPendingCredential('qa-custom'), true);
  assert.equal(store.hasPendingCredential('qa-unrelated'), false);
  const reopened = form({ apiKey: '' });
  assert.deepEqual(validateCustomProviderForm(reopened, undefined, store.hasPendingCredential(reopened.providerID)).fields, {});
  transport.save = save; await store.save(reopened);
  assert.equal(calls.keys, 1); assert.equal(store.hasPendingCredential('qa-custom'), false);
});

test('partial credential queries isolate directories and become unavailable on disposal', async () => {
  const { store, transport, directory } = setup();
  transport.save = async () => { throw new Error('Failed config'); }; await assert.rejects(store.save(form()));
  assert.equal(store.hasPendingCredential('qa-custom'), true);
  directory('/other'); assert.equal(store.hasPendingCredential('qa-custom'), false);
  directory('/project'); assert.equal(store.hasPendingCredential(' qa-custom '), true);
  store.dispose(); assert.equal(store.hasPendingCredential('qa-custom'), false);
});

test('a fresh store recovers an accepted auth key from authoritative preflight after local state is lost', async () => {
  const { store, transport, providers, calls } = setup(); const save = transport.save;
  transport.save = async () => { throw new Error('Failed config'); }; await assert.rejects(store.save(form()));
  store.dispose(); transport.save = save;
  const replacement = new CustomProvidersStore(transport, providers);
  assert.equal(replacement.hasPendingCredential('qa-custom'), false);
  await replacement.save(form({ apiKey: '' }));
  assert.equal(calls.keys, 1); assert.equal(calls.writes, 1);
});

test('deferred create credential validation rejects authoritative absence without issuing any write', async () => {
  const { store, calls, providers } = setup();
  await assert.rejects(store.save(form({ apiKey: '' })), error => error instanceof CustomProviderError && error.reason === 'invalidInput' && error.validation?.fields.apiKey === 'required');
  assert.equal(calls.reads, 1); assert.equal(calls.keys, 0); assert.equal(calls.writes, 0);
  assert.deepEqual(providers.getSnapshot().pendingRestart, []);
});

test('failed create preflight never turns blank credentials into accepted auth', async () => {
  const { store, transport, calls } = setup();
  transport.editor = async () => { throw new Error('Offline'); };
  await assert.rejects(store.save(form({ apiKey: '' })), error => error instanceof CustomProviderError && error.reason === 'request');
  assert.equal(calls.keys, 0); assert.equal(calls.writes, 0);
});

test('post-auth conflict is distinct and a retry cannot accept a newer config revision', async () => {
  const { store, transport, revision, calls } = setup(true); const editor = await store.readEditor('qa-custom');
  transport.save = async () => { revision('external-edit'); throw new CustomProviderError('conflict'); };
  await assert.rejects(store.save({ ...editor.form, apiKey: 'synthetic-new' }, editor), error => error instanceof CustomProviderError && error.reason === 'credentialSavedConflict');
  await assert.rejects(store.save(editor.form, editor), error => error instanceof CustomProviderError && error.reason === 'credentialSavedConflict');
  assert.equal(calls.keys, 1);
});

test('a partial create needs explicit reload when its absence revision changes', async () => {
  const { store, transport, revision, calls } = setup(); const save = transport.save;
  transport.save = async () => { revision('new-absence'); throw new CustomProviderError('conflict'); };
  await assert.rejects(store.save(form()), error => error instanceof CustomProviderError && error.reason === 'credentialSavedConflict');
  transport.save = save;
  await assert.rejects(store.save(form({ apiKey: '' })), error => error instanceof CustomProviderError && error.reason === 'credentialSavedConflict');
  const reloaded = await store.readEditor('qa-custom'); assert.equal(reloaded.exists, false);
  await store.save(form({ apiKey: '' }), reloaded);
  assert.equal(calls.keys, 1); assert.equal(calls.writes, 1);
});

test('another successful provider save does not erase a failed provider credential retry', async () => {
  const { store, transport, calls } = setup(); const save = transport.save;
  transport.save = async (id, ...args) => { if (id === 'qa-custom') throw new Error('Failed config'); return save(id, ...args); };
  await assert.rejects(store.save(form()));
  await store.save(form({ providerID: 'qa-other', apiKey: '{env:OTHER_KEY}' }));
  const read = transport.editor;
  transport.editor = async (id, ...args) => ({ ...await read(id, ...args), revision: 'revision-one', config: null });
  transport.save = save;
  await store.save(form({ apiKey: '' }));
  assert.equal(calls.keys, 1);
});

test('scoped deletion requires the same revision and never deletes stored auth', async () => {
  const { store, transport, providers, calls } = setup(true); const read = transport.editor; const remove = transport.remove;
  transport.editor = async (...args) => ({ ...await read(...args), scope: 'custom' });
  transport.remove = async (...args) => { assert.deepEqual(args[1], { scope: 'custom', expectedRevision: 'revision-one' }); return remove(...args); };
  const editor = await store.readEditor('qa-custom'); assert.equal(await store.remove(editor), true);
  assert.equal(calls.keys, 0); assert.equal(calls.removes, 1); assert.deepEqual(providers.getSnapshot().pendingRestart, ['qa-custom']);
});

test('stale deletion and failed removal retain config and create no pending restart', async () => {
  const { store, transport, providers, revision, calls } = setup(true); const editor = await store.readEditor('qa-custom');
  revision('external'); await assert.rejects(store.remove(editor)); assert.equal(calls.removes, 0);
  revision('revision-one'); transport.remove = async () => { throw new Error('Failed'); };
  await assert.rejects(store.remove(editor)); assert.deepEqual(providers.getSnapshot().pendingRestart, []);
});

test('the shared provider mutation guard blocks double saves and Apply while a config operation runs', async () => {
  const pending = Promise.withResolvers<boolean>(); const { store, transport, providers, calls } = setup();
  const started = Promise.withResolvers<void>(); transport.saveKey = async () => { started.resolve(); return pending.promise; };
  const saving = store.save(form()); await started.promise;
  await assert.rejects(store.save(form()), error => error instanceof CustomProviderError && error.reason === 'busy');
  await assert.rejects(providers.apply()); pending.resolve(true); await saving;
  assert.equal(calls.writes, 1); assert.equal(calls.reloads, 0);
});

test('directory replacement before auth prevents a stale editor from writing elsewhere', async () => {
  const { store, directory, calls } = setup(true); const editor = await store.readEditor('qa-custom'); directory('/other');
  await assert.rejects(store.save(editor.form, editor), error => error instanceof CustomProviderError && error.reason === 'unavailable');
  await assert.rejects(store.remove(editor)); assert.equal(calls.keys + calls.writes + calls.removes, 0);
});

test('cancelled editor reads abort and never return private form values', async () => {
  const pending = Promise.withResolvers<void>(); const { store, transport } = setup(true); const original = transport.editor; let aborted = false;
  transport.editor = async (...args) => { args[2].addEventListener('abort', () => { aborted = true; }); await pending.promise; return original(...args); };
  const cancel = new AbortController(); const reading = store.readEditor('qa-custom', cancel.signal); cancel.abort(); pending.resolve();
  await assert.rejects(reading, error => error instanceof CustomProviderError && error.reason === 'unavailable'); assert.equal(aborted, true);
});

test('disposing after auth prevents the second config request and late UI publication', async () => {
  const pending = Promise.withResolvers<boolean>(); const started = Promise.withResolvers<void>(); const { store, transport, calls } = setup();
  transport.saveKey = async () => { started.resolve(); return pending.promise; };
  const saving = store.save(form()); await started.promise; store.dispose(); const saved = store.getSnapshot(); pending.resolve(true);
  await assert.rejects(saving); assert.equal(calls.writes, 0); assert.strictEqual(store.getSnapshot(), saved);
});

test('native editor adapter uses only guarded routes with encoded scope, JSON bodies and SDK auth', async () => {
  const { providers } = setup(); const requests: Request[] = []; let exists = false; let stored = false;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); requests.push(request.clone()); const url = new URL(request.url);
    if (url.pathname === '/api/auth/qa-custom') { stored = true; return Response.json(true); }
    if (request.method === 'GET') return Response.json({ providerId: 'qa-custom', scope: 'user', revision: exists ? 'saved' : 'absent', config: exists ? config : null, credentials: { storedAuth: stored, inline: false } });
    if (request.method === 'PUT') { exists = true; return Response.json({ success: true, providerId: 'qa-custom', requiresRestart: true, restartDeferred: true }); }
    return Response.json({ success: true, providerId: 'qa-custom', removed: true, requiresRestart: true, restartDeferred: true });
  };
  const runtime = { sdk: createOpencodeClient({ baseUrl: 'https://fixture.invalid/api', fetch }), runtimeFetch: (path: string, init?: RequestInit) => fetch(`https://fixture.invalid${path}`, init) };
  const store = createCustomProvidersStore(runtime, providers, { directory: () => '/project with space' });
  await store.save(form()); const editor = await store.readEditor('qa-custom'); await store.remove(editor);
  const keyRequest = requests.find(request => new URL(request.url).pathname === '/api/auth/qa-custom'); assert.ok(keyRequest);
  assert.deepEqual(await keyRequest.json(), { type: 'api', key: 'synthetic-key' });
  const deletion = requests.find(request => request.method === 'DELETE'); assert.ok(deletion);
  assert.deepEqual(await deletion.json(), { scope: 'user', expectedRevision: 'saved' }); assert.equal(new URL(deletion.url).searchParams.get('directory'), '/project with space');
  assert.equal(requests.some(request => new URL(request.url).pathname === '/api/provider'), false);
});

for (const [status, reason] of [[404, 'upgrade'], [405, 'upgrade'], [501, 'upgrade'], [409, 'conflict'], [422, 'unsupported'], [500, 'request']]) test(`editor status ${status} has explicit safe ${reason} behavior`, async () => {
  const { providers } = setup(); const runtime = { sdk: createOpencodeClient({ baseUrl: 'https://fixture.invalid/api' }), runtimeFetch: async () => Response.json({ error: 'synthetic-private-detail' }, { status: Number(status) }) };
  const store = createCustomProvidersStore(runtime, providers, { directory: () => '/project' });
  await assert.rejects(store.readEditor('qa-custom'), error => error instanceof CustomProviderError && error.reason === reason && !error.message.includes('synthetic-private'));
});

test('editor wire round-trip preserves literal __proto__ model and header entries without prototype mutation', async () => {
  const { providers } = setup();
  const wire = '{"providerId":"qa-custom","scope":"project","revision":"one","config":{"npm":"@ai-sdk/openai-compatible","name":"QA","env":["QA_KEY"],"options":{"baseURL":"https://native-qa.invalid/v1","headers":{"__proto__":"synthetic-header"}},"models":{"__proto__":{"name":"QA model"}}},"credentials":{"storedAuth":false,"inline":false}}';
  const writes: string[] = [];
  const runtime = {
    sdk: createOpencodeClient({ baseUrl: 'https://fixture.invalid/api' }),
    runtimeFetch: async (_path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const request = new Request('https://fixture.invalid/api/provider/qa-custom/editor', init); writes.push(await request.text());
        return Response.json({ success: true, providerId: 'qa-custom', requiresRestart: true, restartDeferred: true });
      }
      return new Response(wire, { headers: { 'Content-Type': 'application/json' } });
    },
  };
  const store = createCustomProvidersStore(runtime, providers, { directory: () => '/project' });
  const editor = await store.readEditor('qa-custom');
  assert.deepEqual(editor.form.models.map(model => [model.id, model.name]), [['__proto__', 'QA model']]);
  assert.deepEqual(editor.form.headers.map(header => [header.key, header.value]), [['__proto__', 'synthetic-header']]);
  await store.save(editor.form, editor);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].includes('"models":{"__proto__":{"name":"QA model"}}'));
  assert.ok(writes[0].includes('"headers":{"__proto__":"synthetic-header"}'));
  assert.equal(Object.getPrototypeOf(editor.form.models[0]), Object.prototype);
});
