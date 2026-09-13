import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import { createProviderFixture } from './native-providers.mjs';

async function setup(t) {
  const token = randomUUID();
  const catalog = { all: [{ id: 'qa', name: 'Native QA', models: { native: { id: 'native', name: 'Native fixture' }, second: { id: 'second', name: 'Second fixture' } } }], connected: ['qa'], default: { qa: 'native' } };
  const controls = new Map();
  const answer = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
  const body = async (request, limit) => {
    let value = '';
    for await (const chunk of request) { value += chunk; if (value.length > limit) throw new Error('Body too large'); }
    return value ? JSON.parse(value) : {};
  };
  const applyNextControl = async (operation, response) => {
    const control = controls.get(operation); controls.delete(operation);
    control?.started?.();
    if (control?.wait) await control.wait;
    if (control?.fail) { answer(response, { error: 'Requested fixture failure' }, 503); return true; }
    return false;
  };
  const fixture = createProviderFixture({ origin: 'http://127.0.0.1', catalog, answer, body, applyNextControl });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (await fixture.handlePublic(request, response, url)) return;
      if (request.headers.authorization !== `Bearer ${token}`) return answer(response, { error: 'Unauthorized' }, 401);
      if (url.pathname === '/api/config/settings' && request.method === 'GET') {
        if (!await applyNextControl('settings-read', response)) answer(response, { defaultModel: 'qa/native', defaultVariant: 'high', defaultAgent: 'build', showReasoning: true, projects: fixture.projects() });
        return;
      }
      if (!await fixture.handle(request, response, url)) answer(response, { error: 'Missing fixture route' }, 404);
    } catch { answer(response, { error: 'Fixture request failed' }, 500); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, init = {}) => fetch(origin + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers } });
  const sdk = createOpencodeClient({ baseUrl: origin + '/api', headers: { Authorization: `Bearer ${token}` }, throwOnError: true });
  return { sdk, request, controls, snapshot: fixture.snapshot, origin };
}

test('SDK catalog and methods preserve original QA choices and mixed OAuth method indexes', async t => {
  const { sdk, request, origin } = await setup(t);
  const catalog = (await sdk.provider.list()).data;
  assert.deepEqual(catalog.connected, ['qa']);
  assert.deepEqual(Object.keys(catalog.all[0].models), ['native', 'second']);
  const methods = (await sdk.provider.auth()).data['qa-oauth'];
  assert.deepEqual(methods.map(method => method.type), ['api', 'oauth', 'oauth']);
  assert.deepEqual(methods[1].prompts[1].when, { key: 'account', op: 'eq', value: 'team' });
  const source = await (await request('/api/provider/qa/source?directory=C%3A%2FIvaldiNativeQA')).json();
  assert.equal(source.sources.user.exists, true);
  assert.equal(source.sources.auth.exists, false);
  assert.equal((await fetch(origin + '/api/provider')).status, 401);
  assert.equal((await fetch(origin + '/__qa/provider-login')).status, 200);
});

test('API credentials change source immediately and models only after managed Apply', async t => {
  const { sdk, request, snapshot } = await setup(t);
  assert.equal((await sdk.auth.set({ providerID: 'qa-api', auth: { type: 'api', key: 'native-qa-key' } })).data, true);
  assert.equal((await (await request('/api/provider/qa-api/source')).json()).sources.auth.exists, true);
  assert.deepEqual((await sdk.provider.list()).data.connected, ['qa']);
  assert.equal((await (await request('/api/config/reload', { method: 'POST' })).json()).requiresReload, true);
  assert.deepEqual((await sdk.provider.list()).data.connected, ['qa', 'qa-api']);
  const removed = await (await request('/api/provider/qa-api/auth?scope=auth', { method: 'DELETE' })).json();
  assert.equal(removed.removed, true); assert.equal(removed.restartDeferred, true);
  assert.deepEqual((await sdk.provider.list()).data.connected, ['qa', 'qa-api']);
  await request('/api/config/reload', { method: 'POST' });
  assert.deepEqual((await sdk.provider.list()).data.connected, ['qa']);
  assert.equal(JSON.stringify(snapshot()).includes('native-qa-key'), false);
});

test('manual restart keeps the old catalog until the QA restart control runs', async t => {
  const { sdk, request } = await setup(t);
  await request('/__qa/providers', { method: 'POST', body: JSON.stringify({ reloadMode: 'manual' }) });
  await sdk.auth.set({ providerID: 'qa-api', auth: { type: 'api', key: 'native-qa-key' } });
  const response = await (await request('/api/config/reload', { method: 'POST' })).json();
  assert.equal(response.requiresManualRestart, true); assert.equal(response.requiresReload, false);
  assert.deepEqual((await sdk.provider.list()).data.connected, ['qa']);
  await request('/__qa/providers', { method: 'POST', body: JSON.stringify({ reloadMode: 'manual', simulateRestart: true }) });
  assert.deepEqual((await sdk.provider.list()).data.connected, ['qa', 'qa-api']);
});

test('OAuth supports conditional prompts, auto and code completion without retaining input', async t => {
  const { sdk, request, snapshot } = await setup(t);
  await assert.rejects(sdk.provider.oauth.authorize({ providerID: 'qa-oauth', method: 1, inputs: { account: 'team' } }));
  const auto = (await sdk.provider.oauth.authorize({ providerID: 'qa-oauth', method: 1, inputs: { account: 'team', workspace: 'native-qa-team' } })).data;
  assert.equal(auto.method, 'auto'); assert.equal(new URL(auto.url).pathname, '/__qa/provider-login');
  assert.equal((await sdk.provider.oauth.callback({ providerID: 'qa-oauth', method: 1 })).data, true);
  await request('/api/provider/qa-oauth/auth?scope=auth', { method: 'DELETE' });
  assert.equal((await sdk.provider.oauth.authorize({ providerID: 'qa-oauth', method: 2, inputs: { account: 'personal' } })).data.method, 'code');
  await assert.rejects(sdk.provider.oauth.callback({ providerID: 'qa-oauth', method: 2, code: 'wrong-synthetic-value' }));
  assert.equal((await sdk.provider.oauth.callback({ providerID: 'qa-oauth', method: 2, code: 'native-qa-code' })).data, true);
  await assert.rejects(sdk.provider.oauth.callback({ providerID: 'qa-oauth', method: 2, code: 'native-qa-code' }));
  assert.deepEqual(snapshot().stored, ['qa-oauth']);
  assert.equal(JSON.stringify(snapshot()).includes('native-qa-code'), false);
  assert.equal(JSON.stringify(snapshot()).includes('native-qa-team'), false);
});

test('failed save, delete and reload preserve the preceding committed state', async t => {
  const { sdk, request, controls, snapshot } = await setup(t);
  controls.set('provider-save', { fail: true });
  await assert.rejects(sdk.auth.set({ providerID: 'qa-api', auth: { type: 'api', key: 'native-qa-key' } }));
  assert.deepEqual(snapshot().stored, []);
  await sdk.auth.set({ providerID: 'qa-api', auth: { type: 'api', key: 'native-qa-key' } });
  controls.set('provider-delete', { fail: true });
  assert.equal((await request('/api/provider/qa-api/auth?scope=auth', { method: 'DELETE' })).status, 503);
  assert.deepEqual(snapshot().stored, ['qa-api']);
  controls.set('provider-reload', { fail: true });
  assert.equal((await request('/api/config/reload', { method: 'POST' })).status, 503);
  assert.deepEqual(snapshot().connected, ['qa']);
  assert.equal((await request('/api/provider/qa-api/auth?scope=all', { method: 'DELETE' })).status, 400);
  assert.deepEqual(snapshot().stored, ['qa-api']);
});

test('a delayed OAuth callback cannot overwrite a replacement authorization', async t => {
  const { sdk, controls, snapshot } = await setup(t);
  await sdk.provider.oauth.authorize({ providerID: 'qa-oauth', method: 1, inputs: { account: 'personal' } });
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  controls.set('provider-callback', { wait });
  const callback = sdk.provider.oauth.callback({ providerID: 'qa-oauth', method: 1 });
  while (snapshot().callbacks === 0) await new Promise(resolve => setTimeout(resolve, 5));
  await sdk.provider.oauth.authorize({ providerID: 'qa-oauth', method: 2, inputs: { account: 'personal' } });
  release();
  await assert.rejects(callback);
  assert.deepEqual(snapshot().stored, []); assert.equal(snapshot().pendingAuthorization, 2);
});

test('read and authorization controls fail once and retain prior authorization', async t => {
  const { sdk, request, controls, snapshot } = await setup(t);
  for (const [operation, read] of [
    ['provider-list', () => sdk.provider.list()],
    ['provider-auth', () => sdk.provider.auth()],
  ]) {
    controls.set(operation, { fail: true });
    await assert.rejects(read()); await read();
  }
  controls.set('provider-source', { fail: true });
  assert.equal((await request('/api/provider/qa-api/source')).status, 503);
  assert.equal((await request('/api/provider/qa-api/source')).status, 200);
  await sdk.provider.oauth.authorize({ providerID: 'qa-oauth', method: 1, inputs: { account: 'personal' } });
  controls.set('provider-authorize', { fail: true });
  await assert.rejects(sdk.provider.oauth.authorize({ providerID: 'qa-oauth', method: 2, inputs: { account: 'personal' } }));
  assert.equal(snapshot().pendingAuthorization, 1);
  controls.set('provider-callback', { fail: true });
  await assert.rejects(sdk.provider.oauth.callback({ providerID: 'qa-oauth', method: 1 }));
  assert.equal(snapshot().pendingAuthorization, 1); assert.deepEqual(snapshot().stored, []);
  await sdk.provider.oauth.callback({ providerID: 'qa-oauth', method: 1 });
  assert.deepEqual(snapshot().stored, ['qa-oauth']);
});

const customConfig = { name: 'QA Custom provider', npm: '@ai-sdk/openai-compatible', env: ['NATIVE_QA_API_KEY'], options: { baseURL: 'https://native-qa.invalid/v1', headers: { 'X-Native-QA': 'fixture' } }, models: { 'sample/chat': { name: 'QA sample model' } } };

test('custom provider create and update use server normalization and defer catalog changes', async t => {
  const { sdk, request, snapshot } = await setup(t);
  const providerID = 'qa-custom-create';
  const created = await (await request('/api/provider', { method: 'PUT', body: JSON.stringify({ providerID, config: customConfig }) })).json();
  assert.equal(created.providerId, providerID); assert.equal(created.restartDeferred, true);
  assert.deepEqual(created.config, customConfig);
  assert.equal((await sdk.provider.list()).data.all.some(provider => provider.id === providerID), false);
  assert.equal((await (await request(`/api/provider/${providerID}/source`)).json()).sources.user.exists, true);
  await request('/api/config/reload', { method: 'POST' });
  const active = (await sdk.provider.list()).data.all.find(provider => provider.id === providerID);
  assert.equal(active.models['sample/chat'].id, 'sample/chat');
  assert.equal(active.models['sample/chat'].api.npm, customConfig.npm);
  assert.deepEqual(active.options, customConfig.options);
  const updated = { ...customConfig, name: 'QA Updated provider', npm: '@ai-sdk/anthropic', options: { baseURL: 'https://native-qa.invalid/v2' } };
  await request('/api/provider', { method: 'PUT', body: JSON.stringify({ providerID, config: updated }) });
  assert.equal((await sdk.provider.list()).data.all.find(provider => provider.id === providerID).name, customConfig.name);
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list()).data.all.find(provider => provider.id === providerID).name, updated.name);
  assert.equal(JSON.stringify(snapshot()).includes('native-qa.invalid'), false);
  assert.equal(JSON.stringify(snapshot()).includes('X-Native-QA'), false);
});

test('custom configuration failure preserves a separately saved key and retry needs no second key save', async t => {
  const { sdk, request, controls, snapshot } = await setup(t);
  const initialConfigurations = snapshot().configurations;
  const providerID = 'qa-custom-partial';
  const config = { ...customConfig }; delete config.env;
  const write = () => request('/api/provider', { method: 'PUT', body: JSON.stringify({ providerID, config, scope: 'user' }) });
  assert.equal((await write()).status, 400);
  await sdk.auth.set({ providerID, auth: { type: 'api', key: 'native-qa-key' } });
  controls.set('provider-config-write', { fail: true });
  assert.equal((await write()).status, 503);
  assert.equal(snapshot().saves, 1); assert.deepEqual(snapshot().stored, [providerID]);
  assert.deepEqual(snapshot().configurations, initialConfigurations);
  assert.equal((await write()).status, 200);
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list()).data.connected.includes(providerID), true);
  await request(`/api/provider/${providerID}/auth?scope=auth`, { method: 'DELETE' });
  assert.equal((await sdk.provider.list()).data.connected.includes(providerID), true);
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list()).data.connected.includes(providerID), false);
  assert.equal((await sdk.provider.list()).data.all.some(provider => provider.id === providerID), true);
});

test('custom provider scopes preserve unrelated project definitions and reveal lower layers after Apply', async t => {
  const { sdk, request, controls } = await setup(t);
  const providerID = 'qa-custom-scopes';
  const directory = 'C:/IvaldiNativeQA/project'; const otherDirectory = 'C:/IvaldiNativeQA/another-project';
  for (const [scope, name] of [['user', 'QA User'], ['project', 'QA Project'], ['custom', 'QA Custom']]) {
    assert.equal((await request('/api/provider?directory=' + encodeURIComponent(directory), { method: 'PUT', body: JSON.stringify({ providerID, scope, config: { ...customConfig, name } }) })).status, 200);
  }
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list({ directory })).data.all.find(provider => provider.id === providerID).name, 'QA Custom');
  controls.set('provider-config-delete', { fail: true });
  assert.equal((await request(`/api/provider/${providerID}/auth?scope=custom`, { method: 'DELETE' })).status, 503);
  const removed = await (await request(`/api/provider/${providerID}/auth?scope=custom`, { method: 'DELETE' })).json();
  assert.equal(removed.removed, true); assert.equal(removed.restartDeferred, true);
  assert.equal((await sdk.provider.list({ directory })).data.all.find(provider => provider.id === providerID).name, 'QA Custom');
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list({ directory })).data.all.find(provider => provider.id === providerID).name, 'QA Project');
  assert.equal((await sdk.provider.list({ directory: otherDirectory })).data.all.find(provider => provider.id === providerID).name, 'QA User');
  await request(`/api/provider/${providerID}/auth?scope=all&directory=${encodeURIComponent(otherDirectory)}`, { method: 'DELETE' });
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list({ directory })).data.all.find(provider => provider.id === providerID).name, 'QA Project');
  assert.equal((await sdk.provider.list({ directory: otherDirectory })).data.all.some(provider => provider.id === providerID), false);
});

test('custom provider validation rejects unsafe fixture inputs and invalid server configuration', async t => {
  const { request, snapshot } = await setup(t);
  const initialConfigurations = snapshot().configurations;
  for (const config of [
    { ...customConfig, models: {} },
    { ...customConfig, models: { sample: { name: '' } } },
    { ...customConfig, npm: 'untrusted-package' },
    { ...customConfig, options: { baseURL: 'https://example.com/v1' } },
    { ...customConfig, options: { ...customConfig.options, headers: { Authorization: 'not-a-fixture-value' } } },
  ]) {
    assert.equal((await request('/api/provider', { method: 'PUT', body: JSON.stringify({ providerID: 'qa-custom-invalid', config }) })).status, 400);
  }
  assert.deepEqual(snapshot().configurations, initialConfigurations);
});

test('editor create uses an absence revision, permits auth-first persistence, and remains deferred', async t => {
  const { sdk, request, controls } = await setup(t);
  const providerID = 'qa-custom-editor-create'; const route = `/api/provider/${providerID}/editor`;
  const initial = await (await request(route)).json();
  assert.equal(initial.config, null); assert.equal(initial.scope, 'user'); assert.match(initial.revision, /^[a-f0-9]{64}$/);
  const config = { ...customConfig }; delete config.env;
  const save = () => request(route, { method: 'PUT', body: JSON.stringify({ scope: initial.scope, expectedRevision: initial.revision, credentials: 'stored-auth', config }) });
  await sdk.auth.set({ providerID, auth: { type: 'api', key: 'native-qa-key' } });
  controls.set('provider-config-write', { fail: true });
  assert.equal((await save()).status, 503);
  assert.equal((await (await request(route)).json()).credentials.storedAuth, true);
  assert.equal((await (await request(route)).json()).revision, initial.revision);
  const saved = await (await save()).json();
  assert.equal(saved.providerId, providerID); assert.equal(saved.restartDeferred, true);
  assert.equal((await sdk.provider.list()).data.all.some(provider => provider.id === providerID), false);
  assert.equal((await save()).status, 409);
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list()).data.connected.includes(providerID), true);
});

test('editor updates preserve undisplayed fields and replace only the submitted model list', async t => {
  const { request, snapshot } = await setup(t);
  const providerID = 'qa-custom-preserved'; const route = `/api/provider/${providerID}/editor`;
  await request('/__qa/provider-config', { method: 'POST', body: JSON.stringify({ providerID, scenario: 'preserved-fields', apply: true }) });
  const initial = await (await request(route)).json();
  assert.equal(initial.config.fixtureMetadata, undefined); assert.equal(initial.config.options.timeout, undefined);
  assert.equal(initial.config.models['qa/kept'].limit, undefined);
  const config = { ...initial.config, name: 'QA Edited provider', options: { ...initial.config.options, baseURL: 'https://native-qa.invalid/v2' }, models: { 'qa/kept': { name: 'QA updated model' } } };
  const saved = await request(route, { method: 'PUT', body: JSON.stringify({ scope: initial.scope, expectedRevision: initial.revision, credentials: 'preserve', config }) });
  assert.equal(saved.status, 200);
  const state = snapshot().configurations.find(item => item.providerID === providerID);
  assert.equal(state.extraProviderPreserved, true); assert.equal(state.extraOptionsPreserved, true); assert.equal(state.extraModelPreserved, true);
  assert.deepEqual(state.modelIDs, ['qa/kept']);
  assert.equal((await (await request(route)).json()).config.name, 'QA Edited provider');
});

test('editor credential modes protect inline auth and expose only presence metadata', async t => {
  const { sdk, request } = await setup(t);
  const providerID = 'qa-custom-inline'; const route = `/api/provider/${providerID}/editor`;
  await request('/__qa/provider-config', { method: 'POST', body: JSON.stringify({ providerID, scenario: 'inline-auth' }) });
  const initial = await (await request(route)).json();
  assert.equal(initial.credentials.inline, true); assert.equal(initial.credentials.storedAuth, false);
  assert.equal(JSON.stringify(initial).includes('native-qa-inline'), false);
  assert.equal((await request(route, { method: 'PUT', body: JSON.stringify({ scope: initial.scope, expectedRevision: initial.revision, credentials: 'preserve', config: { ...initial.config, name: 'QA Preserved inline' } }) })).status, 200);
  const preserved = await (await request(route)).json(); assert.equal(preserved.credentials.inline, true);
  assert.equal((await request(route, { method: 'PUT', body: JSON.stringify({ scope: preserved.scope, expectedRevision: preserved.revision, credentials: 'environment', config: { ...preserved.config, env: ['NATIVE_QA_API_KEY'] } }) })).status, 200);
  const environment = await (await request(route)).json();
  assert.equal(environment.credentials.inline, false); assert.deepEqual(environment.config.env, ['NATIVE_QA_API_KEY']);
  await sdk.auth.set({ providerID, auth: { type: 'api', key: 'native-qa-key' } });
  assert.equal((await request(route, { method: 'PUT', body: JSON.stringify({ scope: environment.scope, expectedRevision: environment.revision, credentials: 'stored-auth', config: environment.config }) })).status, 200);
  const stored = await (await request(route)).json();
  assert.equal(stored.credentials.storedAuth, true); assert.equal(stored.config.env, undefined);
});

test('editor deletes the exact scope and preserves stored auth and lower configuration layers', async t => {
  const { sdk, request } = await setup(t);
  const providerID = 'qa-custom-editor-delete'; const route = `/api/provider/${providerID}/editor`;
  for (const scope of ['user', 'project']) await request('/__qa/provider-config', { method: 'POST', body: JSON.stringify({ providerID, scope, scenario: 'ordinary' }) });
  await sdk.auth.set({ providerID, auth: { type: 'api', key: 'native-qa-key' } });
  const initial = await (await request(route)).json(); assert.equal(initial.scope, 'project');
  assert.equal((await request(route, { method: 'DELETE', body: JSON.stringify({ scope: 'user', expectedRevision: initial.revision }) })).status, 409);
  const removed = await (await request(route, { method: 'DELETE', body: JSON.stringify({ scope: initial.scope, expectedRevision: initial.revision }) })).json();
  assert.equal(removed.removed, true); assert.equal(removed.restartDeferred, true);
  const remaining = await (await request(route)).json();
  assert.equal(remaining.scope, 'user'); assert.notEqual(remaining.config, null); assert.equal(remaining.credentials.storedAuth, true);
  await request(route, { method: 'DELETE', body: JSON.stringify({ scope: remaining.scope, expectedRevision: remaining.revision }) });
  const absent = await (await request(route)).json();
  assert.equal(absent.config, null); assert.equal(absent.credentials.storedAuth, true);
});

test('editor exposes failed reads and unsupported config distinctly, and stale delayed writes conflict', async t => {
  const { request, controls } = await setup(t);
  const providerID = 'qa-custom-editor-conflict'; const route = `/api/provider/${providerID}/editor`;
  controls.set('provider-config-read', { fail: true });
  assert.equal((await request(route)).status, 503);
  const initial = await (await request(route)).json();
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  controls.set('provider-config-write', { wait, started });
  const saving = request(route, { method: 'PUT', body: JSON.stringify({ scope: initial.scope, expectedRevision: initial.revision, credentials: 'environment', config: customConfig }) });
  await pending;
  await request('/__qa/provider-config', { method: 'POST', body: JSON.stringify({ providerID, scenario: 'ordinary' }) });
  release();
  const conflict = await saving;
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'PROVIDER_EDITOR_CONFLICT');
  await request('/__qa/provider-config', { method: 'POST', body: JSON.stringify({ providerID, scenario: 'unsupported' }) });
  const unsupported = await request(route);
  assert.equal(unsupported.status, 422); assert.equal((await unsupported.json()).code, 'PROVIDER_EDITOR_UNSUPPORTED');
});

test('registered projects can be removed, emptied and restored without altering project configuration', async t => {
  const { sdk, request, origin, snapshot } = await setup(t);
  const initial = await (await request('/api/config/settings')).json();
  assert.deepEqual(initial.projects, [
    { id: 'native-qa/current', path: 'C:/IvaldiNativeQA/project', label: 'QA Current project' },
    { id: 'native-qa/alternate', path: 'C:/IvaldiNativeQA/alternate', label: 'QA Alternate project' },
  ]);
  assert.equal((await fetch(origin + '/api/config/settings')).status, 401);
  const update = registered => request('/__qa/projects', { method: 'POST', body: JSON.stringify({ registered }) });
  assert.equal((await update(['not-a-fixture-project'])).status, 400);
  assert.equal((await update(['native-qa/current', 'native-qa/current'])).status, 400);
  assert.deepEqual((await (await request('/api/config/settings')).json()).projects, initial.projects);
  await update(['native-qa/current']);
  const removed = await (await request('/api/config/settings')).json();
  assert.deepEqual(removed.projects, [initial.projects[0]]);
  assert.equal(removed.defaultModel, initial.defaultModel); assert.equal(removed.defaultAgent, initial.defaultAgent);
  assert.equal((await sdk.provider.list({ directory: initial.projects[1].path })).data.all.some(provider => provider.id === 'qa-custom-alternate'), true);
  await update([]);
  assert.deepEqual((await (await request('/api/config/settings')).json()).projects, []);
  await update(initial.projects.map(project => project.id));
  assert.deepEqual((await (await request('/api/config/settings')).json()).projects, initial.projects);
  assert.equal(snapshot().registryChanges, 3);
});

test('alternate provider configuration and catalog stay independent of the current chat directory', async t => {
  const { sdk, request, snapshot } = await setup(t);
  const current = 'C:/IvaldiNativeQA/project'; const alternate = 'C:/IvaldiNativeQA/alternate';
  const providerID = 'qa-custom-alternate';
  const currentCatalog = (await sdk.provider.list({ directory: current })).data;
  const alternateCatalog = (await sdk.provider.list({ directory: alternate })).data;
  assert.equal(currentCatalog.all.some(provider => provider.id === providerID), false);
  assert.deepEqual(Object.keys(currentCatalog.all[0].models), ['native', 'second']);
  assert.equal(alternateCatalog.all.find(provider => provider.id === providerID).models['qa/alternate'].name, 'QA Alternate model');
  assert.equal(alternateCatalog.connected.includes(providerID), true);
  assert.deepEqual((await sdk.app.agents({ directory: current })).data.map(agent => agent.name), ['build', 'plan']);
  assert.deepEqual((await sdk.app.agents({ directory: alternate })).data.map(agent => agent.name), ['build', 'plan', 'qa-alternate']);
  const route = `/api/provider/${providerID}/editor?directory=${encodeURIComponent(alternate)}`;
  const initial = await (await request(route)).json();
  assert.equal(initial.scope, 'project');
  assert.equal((await (await request(`/api/provider/${providerID}/editor?directory=${encodeURIComponent(current)}`)).json()).config, null);
  assert.equal((await (await request(`/api/provider/${providerID}/source?directory=${encodeURIComponent(alternate)}`)).json()).sources.project.exists, true);
  assert.equal((await (await request(`/api/provider/${providerID}/source?directory=${encodeURIComponent(current)}`)).json()).sources.project.exists, false);
  const config = { ...initial.config, name: 'QA Alternate edited', models: { 'qa/alternate-updated': { name: 'QA Alternate updated model' } } };
  assert.equal((await request(route, { method: 'PUT', body: JSON.stringify({ scope: initial.scope, expectedRevision: initial.revision, credentials: 'preserve', config }) })).status, 200);
  assert.equal((await (await request(route)).json()).config.name, 'QA Alternate edited');
  assert.equal((await sdk.provider.list({ directory: alternate })).data.all.find(provider => provider.id === providerID).name, 'QA Alternate provider');
  assert.deepEqual((await sdk.provider.list({ directory: current })).data, currentCatalog);
  await request('/api/config/reload', { method: 'POST' });
  assert.equal((await sdk.provider.list({ directory: alternate })).data.all.find(provider => provider.id === providerID).models['qa/alternate-updated'].name, 'QA Alternate updated model');
  assert.deepEqual((await sdk.provider.list({ directory: current })).data, currentCatalog);
  assert.equal((await (await request('/api/config/settings')).json()).defaultModel, 'qa/native');
  assert.equal(snapshot().catalogDirectories[current] > 0, true); assert.equal(snapshot().catalogDirectories[alternate] > 0, true);
  assert.equal(snapshot().agentDirectories[current], 1); assert.equal(snapshot().agentDirectories[alternate], 1);
});

test('project registry and scoped reads expose failures and retain independent request directories', async t => {
  const { sdk, request, controls } = await setup(t);
  const initial = await (await request('/api/config/settings')).json();
  controls.set('settings-read', { fail: true });
  const failed = await request('/api/config/settings');
  assert.equal(failed.status, 503); assert.equal(Object.hasOwn(await failed.json(), 'projects'), false);
  assert.deepEqual((await (await request('/api/config/settings')).json()).projects, initial.projects);
  controls.set('agent-list', { fail: true });
  await assert.rejects(sdk.app.agents({ directory: initial.projects[1].path }));
  assert.deepEqual((await sdk.app.agents({ directory: initial.projects[0].path })).data.map(agent => agent.name), ['build', 'plan']);
  let release; let started;
  const wait = new Promise(resolve => { release = resolve; });
  const pending = new Promise(resolve => { started = resolve; });
  controls.set('provider-list', { wait, started });
  const delayedAlternate = sdk.provider.list({ directory: initial.projects[1].path });
  await pending;
  assert.equal((await sdk.provider.list({ directory: initial.projects[0].path })).data.all.some(provider => provider.id === 'qa-custom-alternate'), false);
  release();
  assert.equal((await delayedAlternate).data.all.some(provider => provider.id === 'qa-custom-alternate'), true);
  const viaHeader = await (await request('/api/provider?directory=' + encodeURIComponent(initial.projects[0].path), { headers: { 'x-opencode-directory': initial.projects[1].path } })).json();
  assert.equal(viaHeader.all.some(provider => provider.id === 'qa-custom-alternate'), true);
});
