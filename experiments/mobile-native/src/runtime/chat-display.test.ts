import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatDisplayPreferencesStore, defaultChatDisplay } from './chat-display.ts';

const key = 'ivaldi.native.chat-display.v1';

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

test('missing chat display preferences preserve native defaults without writing', async () => {
  const storage = memoryStorage();
  const owner = new ChatDisplayPreferencesStore(storage);
  assert.equal(owner.getSnapshot().ready, false);
  await owner.hydrate();
  assert.deepEqual(owner.getSnapshot(), { preferences: defaultChatDisplay, ready: true, storageError: false });
  assert.deepEqual(defaultChatDisplay, {
    showReasoningTraces: true,
    collapsibleThinkingBlocks: true,
    showExpandedBashTools: false,
    showExpandedEditTools: false,
    codeBlockLineWrap: false,
    userMessageRenderingMode: 'plain',
  });
  assert.deepEqual(storage.reads, [key]);
  assert.equal(storage.writes.length, 0);
});

test('all chat display choices survive restart without touching other device settings', async () => {
  const appearanceKey = 'ivaldi.native.appearance.v1';
  const storage = memoryStorage([[appearanceKey, 'unrelated appearance']]);
  const owner = new ChatDisplayPreferencesStore(storage);
  await owner.setPreferences({
    showReasoningTraces: false,
    collapsibleThinkingBlocks: false,
    showExpandedBashTools: true,
    showExpandedEditTools: true,
    codeBlockLineWrap: true,
    userMessageRenderingMode: 'markdown',
  });
  const restarted = new ChatDisplayPreferencesStore(storage);
  await restarted.hydrate();
  assert.deepEqual(restarted.getSnapshot().preferences, owner.getSnapshot().preferences);
  assert.equal(storage.values.get(appearanceKey), 'unrelated appearance');
  assert.deepEqual(storage.writes, [key]);
});

test('unchanged preferences do not write or publish another snapshot', async () => {
  const storage = memoryStorage();
  const owner = new ChatDisplayPreferencesStore(storage);
  await owner.hydrate();
  const snapshot = owner.getSnapshot();
  let notifications = 0;
  const unsubscribe = owner.subscribe(() => { notifications++; });
  await owner.setPreferences({});
  await owner.setPreferences(defaultChatDisplay);
  await owner.hydrate();
  assert.strictEqual(owner.getSnapshot(), snapshot);
  assert.equal(notifications, 0);
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(storage.reads, [key]);
  unsubscribe();
  await owner.setPreferences({ codeBlockLineWrap: true });
  assert.equal(notifications, 0);
});

test('malformed storage is a failure and cannot be overwritten by an edit', async () => {
  for (const invalid of ['', '{', 'null', '{}', JSON.stringify({ ...defaultChatDisplay, codeBlockLineWrap: 'true' }), JSON.stringify({ ...defaultChatDisplay, userMessageRenderingMode: 'html' })]) {
    const storage = memoryStorage([[key, invalid]]);
    const owner = new ChatDisplayPreferencesStore(storage);
    await assert.rejects(owner.hydrate());
    assert.deepEqual(owner.getSnapshot(), { preferences: defaultChatDisplay, ready: false, storageError: true });
    await assert.rejects(owner.setPreferences({ showExpandedBashTools: true }));
    assert.equal(storage.values.get(key), invalid);
    assert.equal(storage.writes.length, 0);
    storage.values.set(key, JSON.stringify({ ...defaultChatDisplay, codeBlockLineWrap: true }));
    await owner.hydrate();
    assert.equal(owner.getSnapshot().ready, true);
    assert.equal(owner.getSnapshot().storageError, false);
    assert.equal(owner.getSnapshot().preferences.codeBlockLineWrap, true);
    assert.equal(storage.writes.length, 0);
  }
});

test('a failed read leaves controls unavailable and a retry loads the saved choices', async () => {
  const storage = memoryStorage([[key, JSON.stringify({ ...defaultChatDisplay, showExpandedEditTools: true })]]);
  let failRead = true;
  const owner = new ChatDisplayPreferencesStore({
    getItem: async name => { if (failRead) throw new Error('Storage unavailable'); return storage.getItem(name); },
    setItem: storage.setItem,
  });
  await assert.rejects(owner.hydrate(), /Storage unavailable/);
  await assert.rejects(owner.setPreferences({ codeBlockLineWrap: true }), /Storage unavailable/);
  assert.equal(owner.getSnapshot().ready, false);
  assert.equal(owner.getSnapshot().storageError, true);
  assert.equal(storage.writes.length, 0);
  failRead = false;
  await owner.hydrate();
  assert.deepEqual(owner.getSnapshot(), { preferences: { ...defaultChatDisplay, showExpandedEditTools: true }, ready: true, storageError: false });
  assert.equal(storage.writes.length, 0);
});

test('a failed write preserves committed choices and retry saves the requested choice', async () => {
  const storage = memoryStorage();
  let failWrite = false;
  const owner = new ChatDisplayPreferencesStore({
    getItem: storage.getItem,
    setItem: async (name, value) => { if (failWrite) throw new Error('Storage full'); await storage.setItem(name, value); },
  });
  await owner.setPreferences({ codeBlockLineWrap: true });
  const committed = owner.getSnapshot().preferences;
  failWrite = true;
  await assert.rejects(owner.setPreferences({ userMessageRenderingMode: 'markdown' }), /Storage full/);
  assert.strictEqual(owner.getSnapshot().preferences, committed);
  assert.equal(owner.getSnapshot().storageError, true);
  const beforeRetry = new ChatDisplayPreferencesStore(storage);
  await beforeRetry.hydrate();
  assert.deepEqual(beforeRetry.getSnapshot().preferences, committed);
  failWrite = false;
  await owner.setPreferences({ userMessageRenderingMode: 'markdown' });
  assert.equal(owner.getSnapshot().storageError, false);
  const restarted = new ChatDisplayPreferencesStore(storage);
  await restarted.hydrate();
  assert.deepEqual(restarted.getSnapshot().preferences, { ...committed, userMessageRenderingMode: 'markdown' });
});

test('queued edits serialize durable writes and retain unrelated choices', async () => {
  const storage = memoryStorage();
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let writes = 0;
  const owner = new ChatDisplayPreferencesStore({
    getItem: storage.getItem,
    setItem: async (name, value) => { writes++; if (writes === 1) { started.resolve(); await release.promise; } await storage.setItem(name, value); },
  });
  const first = owner.setPreferences({ codeBlockLineWrap: true, showReasoningTraces: false });
  const second = owner.setPreferences({ showExpandedBashTools: true });
  const third = owner.setPreferences({ codeBlockLineWrap: false });
  const duplicate = owner.setPreferences({ codeBlockLineWrap: false });
  await started.promise;
  assert.equal(writes, 1);
  assert.deepEqual(owner.getSnapshot().preferences, defaultChatDisplay);
  release.resolve();
  await Promise.all([first, second, third, duplicate]);
  assert.equal(writes, 3);
  assert.deepEqual(owner.getSnapshot().preferences, { ...defaultChatDisplay, showReasoningTraces: false, showExpandedBashTools: true });
  const restarted = new ChatDisplayPreferencesStore(storage);
  await restarted.hydrate();
  assert.deepEqual(restarted.getSnapshot().preferences, owner.getSnapshot().preferences);
});

test('a failed queued edit does not leak into the next edit or block its commit', async () => {
  const storage = memoryStorage();
  let writes = 0;
  const owner = new ChatDisplayPreferencesStore({
    getItem: storage.getItem,
    setItem: async (name, value) => { writes++; if (writes === 1) throw new Error('Storage full'); await storage.setItem(name, value); },
  });
  const failed = assert.rejects(owner.setPreferences({ showReasoningTraces: false }), /Storage full/);
  const next = owner.setPreferences({ codeBlockLineWrap: true });
  await Promise.all([failed, next]);
  assert.deepEqual(owner.getSnapshot(), { preferences: { ...defaultChatDisplay, codeBlockLineWrap: true }, ready: true, storageError: false });
  assert.equal(storage.writes.length, 1);
});

test('an edit during hydration waits for saved values before applying its patch', async () => {
  const initial = { ...defaultChatDisplay, showReasoningTraces: false, codeBlockLineWrap: true };
  const storage = memoryStorage([[key, JSON.stringify(initial)]]);
  const release = Promise.withResolvers<void>();
  let reads = 0;
  const owner = new ChatDisplayPreferencesStore({
    getItem: async name => { reads++; await release.promise; return storage.getItem(name); },
    setItem: storage.setItem,
  });
  const hydration = owner.hydrate();
  const repeated = owner.hydrate();
  const edit = owner.setPreferences({ showReasoningTraces: true });
  assert.strictEqual(repeated, hydration);
  assert.equal(storage.writes.length, 0);
  assert.equal(owner.getSnapshot().ready, false);
  release.resolve();
  await Promise.all([hydration, repeated, edit]);
  assert.equal(reads, 1);
  assert.deepEqual(owner.getSnapshot().preferences, { ...initial, showReasoningTraces: true });
  assert.equal(storage.writes.length, 1);
});
