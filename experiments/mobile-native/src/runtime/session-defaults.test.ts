import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionDefaultsStore, resolveSessionDefaults, sessionDefaultsSchema, type SessionDefaults } from './session-defaults.ts';
import type { ModelChoice } from './schema.ts';

const defaults: SessionDefaults = { defaultModel: 'provider/model', defaultVariant: 'high', defaultAgent: 'build' };
const models: ModelChoice[] = [
  { providerID: 'provider', id: 'model', provider: 'Provider', name: 'Model', variants: ['high', 'low'] },
  { providerID: 'other', id: 'org/model/extended', provider: 'Other', name: 'Extended', variants: ['medium'] },
];

test('server defaults normalize omitted and trimmed strings but reject malformed fields', () => {
  assert.deepEqual(sessionDefaultsSchema.parse({}), { defaultModel: '', defaultVariant: '', defaultAgent: '' });
  assert.deepEqual(sessionDefaultsSchema.parse({ defaultModel: ' provider/model ', defaultVariant: ' ', unrelated: true }), { defaultModel: 'provider/model', defaultVariant: '', defaultAgent: '' });
  for (const malformed of [null, [], 'text', { defaultModel: 2 }, { defaultVariant: null }, { defaultAgent: false }]) assert.equal(sessionDefaultsSchema.safeParse(malformed).success, false);
});

test('overlapping loads share a request; failures never replace committed defaults', async () => {
  const release = Promise.withResolvers<void>();
  let calls = 0;
  let fail = false;
  const store = new SessionDefaultsStore({ read: async () => { calls++; await release.promise; if (fail) throw new Error('Offline'); return defaults; }, write: async () => defaults });
  const first = store.load();
  assert.strictEqual(first, store.load());
  release.resolve();
  assert.deepEqual(await first, defaults);
  assert.equal(calls, 1);
  const committed = store.getSnapshot().defaults;
  fail = true;
  await assert.rejects(store.load(), /Offline/);
  assert.strictEqual(store.getSnapshot().defaults, committed);
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().error, 'load');
});

test('initial read failure leaves defaults unavailable and prevents writes', async () => {
  let writes = 0;
  const store = new SessionDefaultsStore({ read: async () => { throw new Error('Offline'); }, write: async () => { writes++; return defaults; } });
  await assert.rejects(store.load());
  await assert.rejects(store.save({ defaultAgent: 'plan' }), /not loaded/);
  assert.equal(store.getSnapshot().ready, false);
  assert.equal(store.getSnapshot().loading, false);
  assert.equal(writes, 0);
});

test('successful writes commit the validated server response and send only owned changes', async () => {
  const requests: Partial<SessionDefaults>[] = [];
  const authoritative = { ...defaults, defaultAgent: 'server-agent' };
  const store = new SessionDefaultsStore({ read: async () => defaults, write: async patch => { requests.push(patch); return authoritative; } });
  await store.load();
  await store.save({ defaultAgent: 'requested-agent' });
  assert.deepEqual(requests, [{ defaultAgent: 'requested-agent' }]);
  assert.deepEqual(store.getSnapshot().defaults, authoritative);
});

test('failed or malformed write responses preserve saved state and later writes recover', async () => {
  let fail = true;
  let malformed = false;
  const store = new SessionDefaultsStore({ read: async () => defaults, write: async () => { if (fail) throw new Error('Rejected'); if (malformed) return JSON.parse('{"defaultAgent":42}'); return { ...defaults, defaultAgent: 'plan' }; } });
  await store.load();
  const committed = store.getSnapshot().defaults;
  await assert.rejects(store.save({ defaultAgent: 'plan' }), /Rejected/);
  assert.strictEqual(store.getSnapshot().defaults, committed);
  assert.equal(store.getSnapshot().error, 'save');
  fail = false; malformed = true;
  await assert.rejects(store.save({ defaultAgent: 'plan' }));
  assert.strictEqual(store.getSnapshot().defaults, committed);
  malformed = false;
  await store.save({ defaultAgent: 'plan' });
  assert.equal(store.getSnapshot().defaults.defaultAgent, 'plan');
  assert.equal(store.getSnapshot().error, null);
});

test('writes serialize and model changes or clears reset the preceding variant', async () => {
  let server = { ...defaults };
  const requests: Partial<SessionDefaults>[] = [];
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const store = new SessionDefaultsStore({
    read: async () => server,
    write: async patch => { requests.push(patch); if (requests.length === 1) { started.resolve(); await release.promise; } server = { ...server, ...patch }; return server; },
  });
  await store.load();
  const first = store.save({ defaultModel: 'other/org/model/extended' });
  const second = store.save({ defaultVariant: 'medium' });
  await started.promise;
  assert.equal(requests.length, 1);
  assert.deepEqual(store.getSnapshot().defaults, defaults);
  release.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(requests, [{ defaultModel: 'other/org/model/extended', defaultVariant: '' }, { defaultVariant: 'medium' }]);
  await store.save({ defaultModel: '', defaultVariant: 'medium' });
  assert.deepEqual(requests[2], { defaultModel: '', defaultVariant: '' });
  assert.equal(store.getSnapshot().defaults.defaultAgent, 'build');
});

test('a load started after a write reads after it commits rather than restoring stale defaults', async () => {
  let server = { ...defaults };
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let reads = 0;
  const store = new SessionDefaultsStore({ read: async () => { reads++; return server; }, write: async patch => { started.resolve(); await release.promise; server = { ...server, ...patch }; return server; } });
  await store.load();
  const write = store.save({ defaultAgent: 'plan' });
  await started.promise;
  const load = store.load();
  assert.equal(reads, 1);
  release.resolve();
  await write;
  assert.equal((await load).defaultAgent, 'plan');
  assert.equal(reads, 2);
});

test('resolver supports model IDs containing slashes and only applies valid variants', () => {
  const resolved = resolveSessionDefaults({ defaultModel: 'other/org/model/extended', defaultVariant: 'medium', defaultAgent: 'plan' }, models, ['build', 'plan'], { providerID: 'provider', modelID: 'model' }, 'build');
  assert.deepEqual(resolved.model, { providerID: 'other', modelID: 'org/model/extended', variant: 'medium' });
  assert.equal(resolved.agent, 'plan');
  assert.deepEqual(resolved.unavailable, { model: false, variant: false, agent: false });
  const invalidVariant = resolveSessionDefaults({ ...defaults, defaultVariant: 'unsupported' }, models, ['build'], null, '');
  assert.equal(invalidVariant.model?.variant, undefined);
  assert.equal(invalidVariant.unavailable.variant, true);
});

test('a fresh load does not join an older read when a write is queued between them', async () => {
  let server = { ...defaults };
  let reads = 0;
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const store = new SessionDefaultsStore({
    read: async () => { reads++; const captured = server; if (reads === 2) { started.resolve(); await release.promise; } return captured; },
    write: async patch => { server = { ...server, ...patch }; return server; },
  });
  await store.load();
  const precedingRead = store.load();
  await started.promise;
  const write = store.save({ defaultAgent: 'plan' });
  const freshRead = store.load();
  assert.notStrictEqual(freshRead, precedingRead);
  release.resolve();
  await Promise.all([precedingRead, write]);
  assert.equal((await freshRead).defaultAgent, 'plan');
  assert.equal(reads, 3);
  assert.equal(store.getSnapshot().defaults.defaultAgent, 'plan');
});

test('unavailable saved choices stay intact while chat uses an available fallback', () => {
  const unavailable = { defaultModel: 'removed/model', defaultVariant: 'old', defaultAgent: 'removed-agent' };
  const result = resolveSessionDefaults(unavailable, models, ['build', 'plan'], { providerID: 'other', modelID: 'org/model/extended', variant: 'medium' }, 'plan');
  assert.deepEqual(result.model, { providerID: 'other', modelID: 'org/model/extended', variant: 'medium' });
  assert.equal(result.agent, 'plan');
  assert.deepEqual(result.unavailable, { model: true, variant: true, agent: true });
  assert.deepEqual(unavailable, { defaultModel: 'removed/model', defaultVariant: 'old', defaultAgent: 'removed-agent' });
  const empty = resolveSessionDefaults(unavailable, [], [], null, '');
  assert.equal(empty.model, null);
  assert.equal(empty.agent, '');
});
