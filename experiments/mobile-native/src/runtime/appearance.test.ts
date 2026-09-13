import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppearancePreferencesStore, defaultAppearance } from './appearance.ts';

const key = 'ivaldi.native.appearance.v1';
const legacyKey = 'ivaldi.native.theme';

function memoryStorage(entries: [string, string][] = []) {
  const values = new Map(entries);
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    values, reads, writes,
    getItem: async (name: string) => { reads.push(name); return values.get(name) ?? null; },
    setItem: async (name: string, value: string) => { writes.push(name); values.set(name, value); },
  };
}

test('missing appearance uses device defaults without writing them over storage', async () => {
  const storage = memoryStorage();
  const owner = new AppearancePreferencesStore(storage);
  assert.equal(owner.getSnapshot().appearanceReady, false);
  await owner.hydrate();
  assert.deepEqual(owner.getSnapshot(), { appearance: defaultAppearance, appearanceReady: true, storageError: false });
  await owner.setAppearance({});
  await owner.setAppearance({ textScale: 100 });
  assert.equal(storage.writes.length, 0);
});

test('legacy light and dark survive loading, and choosing System survives restart', async () => {
  for (const scheme of ['light', 'dark']) {
    const storage = memoryStorage([[legacyKey, scheme]]);
    const owner = new AppearancePreferencesStore(storage);
    await owner.hydrate();
    assert.equal(owner.getSnapshot().appearance.scheme, scheme);
    assert.equal(storage.writes.length, 0);
    await owner.setAppearance({ scheme: 'system', fontFamily: 'system', textScale: 125, density: 90 });
    const restarted = new AppearancePreferencesStore(storage);
    await restarted.hydrate();
    assert.deepEqual(restarted.getSnapshot().appearance, { scheme: 'system', fontFamily: 'system', textScale: 125, density: 90 });
    assert.equal(storage.values.get(legacyKey), scheme);
  }
});

test('malformed stored preferences reject without falling back to legacy or overwriting', async () => {
  for (const invalid of ['', '{', 'null', '{}', JSON.stringify({ ...defaultAppearance, textScale: 103 }), JSON.stringify({ ...defaultAppearance, density: 125 })]) {
    const storage = memoryStorage([[key, invalid], [legacyKey, 'dark']]);
    const owner = new AppearancePreferencesStore(storage);
    await assert.rejects(owner.hydrate());
    assert.deepEqual(owner.getSnapshot(), { appearance: defaultAppearance, appearanceReady: false, storageError: true });
    await assert.rejects(owner.setAppearance({ scheme: 'light' }));
    assert.equal(storage.reads.includes(legacyKey), false);
    assert.equal(storage.values.get(key), invalid);
    assert.equal(storage.writes.length, 0);
  }
  const owner = new AppearancePreferencesStore(memoryStorage([[legacyKey, 'automatic']]));
  await assert.rejects(owner.hydrate());
  assert.equal(owner.getSnapshot().storageError, true);
});

test('failed reads remain failures and an explicit retry can recover without a write', async () => {
  const storage = memoryStorage([[key, JSON.stringify({ ...defaultAppearance, density: 85 })]]);
  let failRead = true;
  const owner = new AppearancePreferencesStore({
    getItem: async name => { if (failRead) throw new Error('Storage unavailable'); return storage.getItem(name); },
    setItem: storage.setItem,
  });
  await assert.rejects(owner.hydrate(), /Storage unavailable/);
  assert.equal(owner.getSnapshot().appearanceReady, false);
  assert.equal(owner.getSnapshot().storageError, true);
  failRead = false;
  await owner.setAppearance({});
  assert.equal(owner.getSnapshot().appearanceReady, true);
  assert.equal(owner.getSnapshot().storageError, false);
  assert.equal(owner.getSnapshot().appearance.density, 85);
  assert.equal(storage.writes.length, 0);
});

test('a failed write preserves the last saved preferences and does not leak into later edits', async () => {
  const storage = memoryStorage();
  let failWrite = false;
  const owner = new AppearancePreferencesStore({
    getItem: storage.getItem,
    setItem: async (name, value) => { if (failWrite) throw new Error('Storage full'); await storage.setItem(name, value); },
  });
  await owner.setAppearance({ textScale: 110 });
  const saved = owner.getSnapshot().appearance;
  failWrite = true;
  await assert.rejects(owner.setAppearance({ scheme: 'light', density: 90 }), /Storage full/);
  assert.strictEqual(owner.getSnapshot().appearance, saved);
  assert.equal(owner.getSnapshot().storageError, true);
  failWrite = false;
  await owner.setAppearance({ fontFamily: 'system' });
  assert.deepEqual(owner.getSnapshot().appearance, { ...defaultAppearance, textScale: 110, fontFamily: 'system' });
  const restarted = new AppearancePreferencesStore(storage);
  await restarted.hydrate();
  assert.deepEqual(restarted.getSnapshot().appearance, owner.getSnapshot().appearance);
});

test('rapid edits write in order and retain unrelated changes while storage is slow', async () => {
  const storage = memoryStorage();
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let writes = 0;
  const owner = new AppearancePreferencesStore({
    getItem: storage.getItem,
    setItem: async (name, value) => { writes++; if (writes === 1) { started.resolve(); await release.promise; } await storage.setItem(name, value); },
  });
  const first = owner.setAppearance({ scheme: 'light', textScale: 120 });
  const second = owner.setAppearance({ scheme: 'dark' });
  await started.promise;
  assert.equal(writes, 1);
  assert.deepEqual(owner.getSnapshot().appearance, defaultAppearance);
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(writes, 2);
  assert.deepEqual(owner.getSnapshot().appearance, { ...defaultAppearance, scheme: 'dark', textScale: 120 });
  const restarted = new AppearancePreferencesStore(storage);
  await restarted.hydrate();
  assert.deepEqual(restarted.getSnapshot().appearance, owner.getSnapshot().appearance);
});

test('edits during hydration win and retain saved fields the user has not changed', async () => {
  const initial = { ...defaultAppearance, scheme: 'dark', density: 90, textScale: 120 };
  const storage = memoryStorage([[key, JSON.stringify(initial)]]);
  const release = Promise.withResolvers<void>();
  let reads = 0;
  const owner = new AppearancePreferencesStore({
    getItem: async name => { reads++; await release.promise; return storage.getItem(name); },
    setItem: storage.setItem,
  });
  const hydration = owner.hydrate();
  const sameHydration = owner.hydrate();
  const edit = owner.setAppearance({ scheme: 'light' });
  release.resolve();
  await Promise.all([hydration, sameHydration, edit]);
  assert.equal(reads, 1);
  assert.deepEqual(owner.getSnapshot().appearance, { ...initial, scheme: 'light' });
  assert.equal(storage.writes.length, 1);
});

test('invalid scale changes reject before writing or changing saved state', async () => {
  const storage = memoryStorage();
  const owner = new AppearancePreferencesStore(storage);
  await owner.hydrate();
  for (const textScale of [0, 79, 103, 151, Number.NaN, Number.POSITIVE_INFINITY]) await assert.rejects(owner.setAppearance({ textScale }));
  for (const density of [75, 121, 97]) await assert.rejects(owner.setAppearance({ density }));
  assert.deepEqual(owner.getSnapshot().appearance, defaultAppearance);
  assert.equal(storage.writes.length, 0);
});
