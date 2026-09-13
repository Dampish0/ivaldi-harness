import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NativeRuntime } from './connection.ts';
import { createSettingsProjectsStore } from './settings-projects.ts';

const projects = [{ id: 'first', path: '/projects/first', label: 'First' }, { id: 'second', path: 'C:\\projects\\second' }];

function setup(initial = JSON.stringify({ projects })) {
  let response = initial;
  let failure = false;
  let directory: string | undefined = '/chats/current';
  let wait: Promise<void> = Promise.resolve();
  const calls: { path: string; init: RequestInit | undefined }[] = [];
  const runtime: Pick<NativeRuntime, 'json'> = {
    json: async (path, schema, init) => {
      calls.push({ path, init });
      const body = response;
      const failed = failure;
      await wait;
      if (failed) throw new Error('Fixture read failed');
      return schema.parse(JSON.parse(body));
    },
  };
  const options = { currentDirectory: () => directory };
  return {
    store: createSettingsProjectsStore(runtime, options), runtime, options, calls,
    respond: (body: string) => { response = body; },
    fail: (value: boolean) => { failure = value; },
    directory: (value: string | undefined) => { directory = value; },
    wait: (value: Promise<void>) => { wait = value; },
  };
}

test('loads only the registered project projection without activating or writing', async () => {
  const fixture = setup(JSON.stringify({ projects: [{ ...projects[0], icon: 'folder', defaultModel: 'provider/model' }, projects[1]], activeProjectId: 'first', privateSetting: 'excluded' }));
  assert.deepEqual(fixture.store.getSnapshot(), { projects: [], selectedId: null, ready: false, loading: false, error: null });
  await fixture.store.load();
  assert.deepEqual(fixture.store.getSnapshot(), { projects, selectedId: null, ready: true, loading: false, error: null });
  assert.equal(fixture.store.getDirectory(), '/chats/current');
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].path, '/api/config/settings');
  assert.equal(fixture.calls[0].init?.method, undefined);
  assert.equal(fixture.calls[0].init?.body, undefined);
});

test('missing and explicit empty project lists are authoritative empty responses', async () => {
  for (const response of ['{}', '{"projects":[]}']) {
    const { store } = setup(response);
    await store.load();
    assert.deepEqual(store.getSnapshot(), { projects: [], selectedId: null, ready: true, loading: false, error: null });
    assert.equal(store.getDirectory(), '/chats/current');
  }
});

test('current chat follows call-time directory while explicit selection stays fixed', async () => {
  const fixture = setup();
  const { getDirectory, select } = fixture.store;
  fixture.directory(undefined);
  assert.equal(getDirectory(), undefined);
  await fixture.store.load();
  assert.equal(select('second'), true);
  fixture.directory('/different/chat');
  assert.equal(getDirectory(), projects[1].path);
  assert.equal(select(null), true);
  assert.equal(getDirectory(), '/different/chat');
  fixture.directory('/different/draft');
  assert.equal(getDirectory(), '/different/draft');
  assert.equal(fixture.calls.length, 1);
});

test('unknown identifiers are rejected and repeated selections do not notify', async () => {
  const { store } = setup();
  assert.equal(store.select('first'), false);
  await store.load();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  assert.equal(store.select('second'), true);
  const selected = store.getSnapshot();
  for (const id of ['missing', '', ' second', '__proto__']) assert.equal(store.select(id), false);
  assert.equal(store.select('second'), true);
  assert.strictEqual(store.getSnapshot(), selected);
  assert.equal(notifications, 1);
  unsubscribe();
  store.select(null);
  assert.equal(notifications, 1);
});

test('concurrent loads share one request and settled loads can refresh', async () => {
  const fixture = setup();
  const pending = Promise.withResolvers<void>();
  fixture.wait(pending.promise);
  const first = fixture.store.load();
  assert.equal(fixture.store.getSnapshot().loading, true);
  assert.strictEqual(fixture.store.load(), first);
  await Promise.resolve();
  assert.equal(fixture.calls.length, 1);
  pending.resolve();
  await first;
  assert.equal(fixture.store.getSnapshot().loading, false);
  await fixture.store.load();
  assert.equal(fixture.calls.length, 2);
});

test('initial read failure remains unavailable and an explicit retry succeeds', async () => {
  const fixture = setup();
  fixture.fail(true);
  await assert.rejects(fixture.store.load(), /Fixture read failed/);
  assert.deepEqual(fixture.store.getSnapshot(), { projects: [], selectedId: null, ready: false, loading: false, error: 'load' });
  fixture.fail(false);
  await fixture.store.load();
  assert.deepEqual(fixture.store.getSnapshot().projects, projects);
  assert.equal(fixture.store.getSnapshot().ready, true);
  assert.equal(fixture.store.getSnapshot().error, null);
});

test('failed and malformed refreshes retain the authoritative list and explicit scope', async () => {
  const fixture = setup();
  await fixture.store.load();
  fixture.store.select('second');
  const list = fixture.store.getSnapshot().projects;
  fixture.fail(true);
  await assert.rejects(fixture.store.load());
  fixture.fail(false);
  const invalid = ['null', '[]', '{', '{"projects":null}', '{"projects":{}}', '{"projects":[null]}', '{"projects":[{"id":"missing-path"}]}', '{"projects":[{"id":" ","path":"/valid"}]}', '{"projects":[{"id":"valid","path":" "}]}', '{"projects":[{"id":"valid","path":"/valid","label":3}]}', JSON.stringify({ projects: [projects[0], projects[0]] })];
  for (const response of invalid) {
    fixture.respond(response);
    await assert.rejects(fixture.store.load());
    assert.deepEqual(fixture.store.getSnapshot(), { projects: list, selectedId: 'second', ready: true, loading: false, error: 'load' });
    assert.strictEqual(fixture.store.getSnapshot().projects, list);
    assert.equal(fixture.store.getDirectory(), projects[1].path);
  }
  fixture.respond(JSON.stringify({ projects }));
  await fixture.store.load();
  assert.equal(fixture.store.getSnapshot().error, null);
  assert.equal(fixture.store.getSnapshot().selectedId, 'second');
});

test('only a complete successful refresh removes an unavailable selection', async () => {
  const fixture = setup();
  await fixture.store.load();
  fixture.store.select('second');
  fixture.respond(JSON.stringify({ projects: [projects[0]] }));
  await fixture.store.load();
  assert.equal(fixture.store.getSnapshot().selectedId, null);
  assert.equal(fixture.store.getDirectory(), '/chats/current');
  fixture.store.select('first');
  fixture.respond('{"projects":[]}');
  await fixture.store.load();
  assert.equal(fixture.store.getSnapshot().selectedId, null);
  assert.deepEqual(fixture.store.getSnapshot().projects, []);
});

test('a late refresh preserves the selection made while it was loading', async () => {
  const fixture = setup();
  await fixture.store.load();
  fixture.store.select('first');
  const pending = Promise.withResolvers<void>();
  fixture.wait(pending.promise);
  const loading = fixture.store.load();
  await Promise.resolve();
  fixture.store.select('second');
  pending.resolve();
  await loading;
  assert.equal(fixture.store.getSnapshot().selectedId, 'second');
  assert.equal(fixture.store.getDirectory(), projects[1].path);
});

test('a selected project retains identity while an authoritative load updates its path', async () => {
  const fixture = setup();
  await fixture.store.load();
  fixture.store.select('first');
  fixture.respond(JSON.stringify({ projects: [{ ...projects[0], path: '/renamed', label: 'Renamed' }] }));
  await fixture.store.load();
  assert.equal(fixture.store.getSnapshot().selectedId, 'first');
  assert.equal(fixture.store.getDirectory(), '/renamed');
});

test('dispose aborts a read and ignored late success cannot change or notify the store', async () => {
  const fixture = setup();
  const pending = Promise.withResolvers<void>();
  fixture.wait(pending.promise);
  let notifications = 0;
  fixture.store.subscribe(() => { notifications++; });
  const loading = fixture.store.load();
  await Promise.resolve();
  const snapshot = fixture.store.getSnapshot();
  fixture.store.dispose();
  assert.equal(fixture.calls[0].init?.signal?.aborted, true);
  pending.resolve();
  await assert.rejects(loading, /unavailable/);
  assert.strictEqual(fixture.store.getSnapshot(), snapshot);
  assert.equal(notifications, 1);
  assert.equal(fixture.store.select(null), false);
  assert.equal(fixture.store.getDirectory(), undefined);
  await assert.rejects(fixture.store.load(), /unavailable/);
  assert.equal(fixture.calls.length, 1);
});

test('disposed late failure cannot affect a replacement runtime or retain its selection', async () => {
  const fixture = setup();
  await fixture.store.load();
  fixture.store.select('second');
  const pending = Promise.withResolvers<void>();
  fixture.wait(pending.promise);
  fixture.fail(true);
  const loading = fixture.store.load();
  await Promise.resolve();
  fixture.store.dispose();
  const disposed = fixture.store.getSnapshot();
  const replacement = createSettingsProjectsStore(fixture.runtime, fixture.options);
  fixture.wait(Promise.resolve());
  fixture.fail(false);
  fixture.respond(JSON.stringify({ projects: [projects[0]] }));
  await replacement.load();
  const current = replacement.getSnapshot();
  pending.resolve();
  await assert.rejects(loading);
  assert.strictEqual(fixture.store.getSnapshot(), disposed);
  assert.strictEqual(replacement.getSnapshot(), current);
  assert.equal(current.selectedId, null);
  assert.equal(replacement.getDirectory(), '/chats/current');
});
