import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelVisibilityStore } from './model-visibility.ts';

const storageKey = 'ivaldi.native.model-visibility.v1';

function memoryStorage(initial: string | null = null) {
  let saved = initial;
  const reads: string[] = [];
  const writes: { key: string; value: string }[] = [];
  return {
    reads, writes, saved: () => saved,
    getItem: async (key: string) => { reads.push(key); return saved; },
    setItem: async (key: string, value: string) => { writes.push({ key, value }); saved = value; },
  };
}

test('missing and explicit empty preferences show every model without writing', async () => {
  for (const initial of [null, '[]']) {
    const storage = memoryStorage(initial);
    const store = new ModelVisibilityStore(storage);
    assert.equal(store.getSnapshot().ready, false);
    await store.load();
    assert.deepEqual(store.getSnapshot(), { hidden: [], ready: true, loading: false, saving: false, error: null });
    assert.deepEqual(storage.reads, [storageKey]);
    assert.equal(storage.writes.length, 0);
  }
});

test('hidden model keys round-trip unchanged, including slashes in either identifier', async () => {
  const keys = ['org/provider/model', 'provider/org/model', 'other/model'];
  const storage = memoryStorage(JSON.stringify([keys[0], keys[0]]));
  const store = new ModelVisibilityStore(storage);
  await store.load();
  assert.deepEqual(store.getSnapshot().hidden, [keys[0]]);
  await store.setProviderHidden(keys, true);
  assert.deepEqual(store.getSnapshot().hidden, keys);
  assert.deepEqual(storage.writes, [{ key: storageKey, value: JSON.stringify(keys) }]);
  const restarted = new ModelVisibilityStore(storage);
  await restarted.load();
  assert.deepEqual(restarted.getSnapshot().hidden, keys);
  await restarted.setHidden(keys[0], false);
  assert.deepEqual(restarted.getSnapshot().hidden, keys.slice(1));
});

test('invalid persisted data remains unavailable and is never overwritten by a change', async () => {
  for (const invalid of ['', '{', 'null', '{}', '"provider/model"', '[null]', '[1]', '[""]']) {
    const storage = memoryStorage(invalid);
    const store = new ModelVisibilityStore(storage);
    await assert.rejects(store.load());
    assert.deepEqual(store.getSnapshot(), { hidden: [], ready: false, loading: false, saving: false, error: 'load' });
    await assert.rejects(store.setHidden('provider/model', true), /not loaded/);
    assert.equal(storage.saved(), invalid);
    assert.equal(storage.writes.length, 0);
  }
});

test('writes before a successful load cannot erase stored visibility', async () => {
  const storage = memoryStorage('["saved/model"]');
  const store = new ModelVisibilityStore(storage);
  await assert.rejects(store.setHidden('new/model', true), /not loaded/);
  assert.equal(storage.writes.length, 0);
  await store.load();
  await store.setHidden('new/model', true);
  assert.deepEqual(store.getSnapshot().hidden, ['saved/model', 'new/model']);
});

test('read failures preserve the preceding list and Retry restores availability', async () => {
  const storage = memoryStorage('["saved/model"]');
  let fail = false;
  const store = new ModelVisibilityStore({ getItem: async key => { if (fail) throw new Error('Read failed'); return storage.getItem(key); }, setItem: storage.setItem });
  await store.load();
  const committed = store.getSnapshot().hidden;
  fail = true;
  await assert.rejects(store.load(), /Read failed/);
  assert.strictEqual(store.getSnapshot().hidden, committed);
  assert.equal(store.getSnapshot().ready, false);
  assert.equal(store.getSnapshot().error, 'load');
  await assert.rejects(store.setHidden('new/model', true), /not loaded/);
  fail = false;
  await store.load();
  assert.deepEqual(store.getSnapshot().hidden, committed);
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().error, null);
  assert.equal(storage.writes.length, 0);
});

test('failed writes preserve the last committed list and a retried change can succeed', async () => {
  const storage = memoryStorage('["saved/model"]');
  let fail = true;
  const store = new ModelVisibilityStore({ getItem: storage.getItem, setItem: async (key, value) => { if (fail) throw new Error('Storage full'); await storage.setItem(key, value); } });
  await store.load();
  const committed = store.getSnapshot().hidden;
  await assert.rejects(store.setHidden('new/model', true), /Storage full/);
  assert.strictEqual(store.getSnapshot().hidden, committed);
  assert.deepEqual(store.getSnapshot(), { hidden: committed, ready: true, loading: false, saving: false, error: 'save' });
  fail = false;
  await store.setHidden('new/model', true);
  assert.deepEqual(store.getSnapshot().hidden, ['saved/model', 'new/model']);
  assert.equal(store.getSnapshot().error, null);
  assert.equal(storage.writes.length, 1);
});

test('provider hide and show change only explicit keys in one durable write', async () => {
  const storage = memoryStorage('["unrelated/model","provider/old-model"]');
  const store = new ModelVisibilityStore(storage);
  await store.load();
  await store.setProviderHidden(['provider/a', 'provider/b', 'provider/a'], true);
  assert.deepEqual(store.getSnapshot().hidden, ['unrelated/model', 'provider/old-model', 'provider/a', 'provider/b']);
  assert.equal(storage.writes.length, 1);
  await store.setProviderHidden(['provider/a', 'provider/b'], false);
  assert.deepEqual(store.getSnapshot().hidden, ['unrelated/model', 'provider/old-model']);
  assert.equal(storage.writes.length, 2);
});

test('no-op changes preserve the list reference and do not write or notify', async () => {
  const storage = memoryStorage('["provider/model"]');
  const store = new ModelVisibilityStore(storage);
  await store.load();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  const snapshot = store.getSnapshot();
  await store.setHidden('provider/model', true);
  await store.setHidden('other/model', false);
  await store.setProviderHidden([], true);
  await store.setProviderHidden([], false);
  assert.strictEqual(store.getSnapshot(), snapshot);
  assert.equal(storage.writes.length, 0);
  assert.equal(notifications, 0);
  unsubscribe();
  await store.setHidden('other/model', true);
  assert.equal(notifications, 0);
});

test('slow overlapping edits remain invisible until saved and merge in request order', async () => {
  const storage = memoryStorage('["saved/model"]');
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let writes = 0;
  const store = new ModelVisibilityStore({ getItem: storage.getItem, setItem: async (key, value) => { if (++writes === 1) { started.resolve(); await release.promise; } await storage.setItem(key, value); } });
  await store.load();
  const before = store.getSnapshot().hidden;
  const first = store.setHidden('first/model', true);
  const keys = ['second/model'];
  const second = store.setProviderHidden(keys, true);
  keys.push('unrequested/model');
  const third = store.setHidden('saved/model', false);
  await started.promise;
  assert.equal(writes, 1);
  assert.equal(store.getSnapshot().saving, true);
  assert.strictEqual(store.getSnapshot().hidden, before);
  release.resolve();
  await Promise.all([first, second, third]);
  assert.equal(writes, 3);
  assert.equal(store.getSnapshot().saving, false);
  assert.deepEqual(store.getSnapshot().hidden, ['first/model', 'second/model']);
  assert.equal(storage.saved(), '["first/model","second/model"]');
});

test('a failed queued edit does not leak its keys into the following successful edit', async () => {
  const storage = memoryStorage('["saved/model"]');
  let writes = 0;
  const store = new ModelVisibilityStore({ getItem: storage.getItem, setItem: async (key, value) => { if (++writes === 1) throw new Error('First write failed'); await storage.setItem(key, value); } });
  await store.load();
  const failed = assert.rejects(store.setHidden('failed/model', true), /First write failed/);
  const success = store.setHidden('successful/model', true);
  await Promise.all([failed, success]);
  assert.deepEqual(store.getSnapshot().hidden, ['saved/model', 'successful/model']);
  assert.equal(store.getSnapshot().error, null);
});

test('a change during hydration retains saved keys and a subsequent load reads the committed change', async () => {
  const storage = memoryStorage('["saved/model"]');
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let reads = 0;
  const store = new ModelVisibilityStore({ getItem: async key => { if (++reads === 1) { started.resolve(); await release.promise; } return storage.getItem(key); }, setItem: storage.setItem });
  const initial = store.load();
  await started.promise;
  assert.equal(store.getSnapshot().loading, true);
  const edit = store.setHidden('new/model', true);
  const reload = store.load();
  assert.equal(reads, 1);
  assert.equal(storage.writes.length, 0);
  release.resolve();
  await Promise.all([initial, edit, reload]);
  assert.equal(reads, 2);
  assert.deepEqual(store.getSnapshot().hidden, ['saved/model', 'new/model']);
  assert.equal(storage.writes.length, 1);
});

test('a reload requested while a write is pending cannot restore the preceding snapshot', async () => {
  const storage = memoryStorage('["saved/model"]');
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const store = new ModelVisibilityStore({ getItem: storage.getItem, setItem: async (key, value) => { started.resolve(); await release.promise; await storage.setItem(key, value); } });
  await store.load();
  const edit = store.setHidden('new/model', true);
  await started.promise;
  const reload = store.load();
  assert.equal(storage.reads.length, 1);
  release.resolve();
  await Promise.all([edit, reload]);
  assert.equal(storage.reads.length, 2);
  assert.deepEqual(store.getSnapshot().hidden, ['saved/model', 'new/model']);
});
