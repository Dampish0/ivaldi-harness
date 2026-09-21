import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionMutations } from './session-mutations.ts';
import type { Session } from './schema';

const session = (id: string, updated = 1): Session => ({ id, title: id, directory: `C:/projects/${id}`, time: { created: 1, updated } });
type UpdateSession = ConstructorParameters<typeof SessionMutations>[0]['update'];

function fixture(update: UpdateSession) {
  const sessions = new Map([['one', session('one')], ['two', session('two')]]);
  const commits: Session[] = [];
  const actions = new SessionMutations({ session: id => sessions.get(id), update, commit: value => { sessions.set(value.id, value); commits.push(value); } });
  return { actions, sessions, commits };
}

test('rename captures the chosen session and its directory, trims the title and preserves another chat', async () => {
  const { actions, sessions } = fixture(async (id, directory, patch) => {
    assert.equal(id, 'two');
    assert.equal(directory, 'C:/projects/two');
    assert.deepEqual(patch, { title: 'New title' });
    return { ...session('two', 2), title: 'New title' };
  });
  const other = sessions.get('one');
  assert.equal(await actions.rename('two', '  New title  '), 'saved');
  assert.equal(sessions.get('two')?.title, 'New title');
  assert.strictEqual(sessions.get('one'), other);
});

test('empty titles and missing sessions cannot send writes', async () => {
  let writes = 0;
  const { actions } = fixture(async () => { writes++; return session('one'); });
  assert.equal(await actions.rename('one', '   '), 'failed');
  assert.equal(await actions.rename('missing', 'Valid title'), 'unavailable');
  assert.equal(await actions.archive('missing', true), 'unavailable');
  assert.equal(writes, 0);
});

test('an already satisfied rename or restore needs no write', async () => {
  let writes = 0;
  const { actions, commits } = fixture(async () => { writes++; return session('one'); });
  assert.equal(await actions.rename('one', 'one'), 'saved');
  assert.equal(await actions.archive('one', false), 'saved');
  assert.equal(writes, 0);
  assert.equal(commits.length, 0);
});

test('a server event can confirm a rename whose HTTP response was lost', async () => {
  const pending = Promise.withResolvers<Session>();
  const { actions, sessions, commits } = fixture(() => pending.promise);
  const write = actions.rename('one', 'Confirmed title');
  const confirmed = { ...session('one', 2), title: 'Confirmed title' };
  sessions.set('one', confirmed);
  pending.reject(new Error('Response lost'));
  assert.equal(await write, 'saved');
  assert.deepEqual(commits, [confirmed]);
});

test('confirmed archive state does not depend on matching a client timestamp', async () => {
  const pending = Promise.withResolvers<Session>();
  const { actions, sessions } = fixture(() => pending.promise);
  const write = actions.archive('one', true);
  const confirmed = session('one', 2);
  confirmed.time.archived = 123;
  sessions.set('one', confirmed);
  pending.reject(new Error('Response lost'));
  assert.equal(await write, 'saved');
  assert.equal(sessions.get('one')?.time.archived, 123);
});

test('a failed write leaves records intact and permits retry', async () => {
  let fail = true;
  const { actions, sessions, commits } = fixture(async () => { if (fail) throw new Error('Offline'); return { ...session('one', 2), title: 'Renamed' }; });
  const original = sessions.get('one');
  assert.equal(await actions.rename('one', 'Renamed'), 'failed');
  assert.strictEqual(sessions.get('one'), original);
  assert.equal(commits.length, 0);
  fail = false;
  assert.equal(await actions.rename('one', 'Renamed'), 'saved');
  assert.equal(sessions.get('one')?.title, 'Renamed');
});

test('duplicate actions on one chat cannot overlap, while an unrelated chat remains writable', async () => {
  const pending = Promise.withResolvers<Session>();
  let writes = 0;
  const { actions } = fixture(async id => { writes++; return id === 'one' ? pending.promise : session(id, 2); });
  const first = actions.rename('one', 'First');
  assert.equal(await actions.archive('one', true), 'busy');
  assert.equal(await actions.rename('two', 'Independent'), 'saved');
  assert.equal(writes, 2);
  pending.resolve({ ...session('one', 2), title: 'First' });
  assert.equal(await first, 'saved');
});

test('archive and restore send only the archive field', async () => {
  const patches: Parameters<UpdateSession>[2][] = [];
  const { actions } = fixture(async (id, _directory, patch) => {
    patches.push(patch);
    assert.ok('time' in patch);
    const updated = session(id, 2);
    return { ...updated, time: { ...updated.time, ...patch.time } };
  });
  assert.equal(await actions.archive('one', true), 'saved');
  assert.equal(await actions.archive('one', false), 'saved');
  assert.equal(patches.length, 2);
  assert.ok('time' in patches[0] && patches[0].time.archived > 0);
  assert.deepEqual(patches[1], { time: { archived: 0 } });
});

test('a session deleted while a write is pending cannot be resurrected by its response', async () => {
  const pending = Promise.withResolvers<Session>();
  const { actions, sessions, commits } = fixture(() => pending.promise);
  const write = actions.rename('one', 'Late title');
  sessions.delete('one');
  pending.resolve({ ...session('one', 2), title: 'Late title' });
  assert.equal(await write, 'unavailable');
  assert.equal(sessions.has('one'), false);
  assert.equal(commits.length, 0);
});

test('moving a session during a write keeps its new directory and rejects the old response', async () => {
  const pending = Promise.withResolvers<Session>();
  const { actions, sessions, commits } = fixture(() => pending.promise);
  const write = actions.rename('one', 'Late title');
  const moved = { ...session('one', 3), directory: 'C:/projects/moved' };
  sessions.set('one', moved);
  pending.resolve({ ...session('one', 2), title: 'Late title' });
  assert.equal(await write, 'unavailable');
  assert.strictEqual(sessions.get('one'), moved);
  assert.equal(commits.length, 0);
});

test('newer server events win over an older response and remain available for list reconciliation', async () => {
  const pending = Promise.withResolvers<Session>();
  const { actions, sessions, commits } = fixture(() => pending.promise);
  const write = actions.rename('one', 'Request title');
  const newer = { ...session('one', 3), title: 'Later server title' };
  sessions.set('one', newer);
  pending.resolve({ ...session('one', 2), title: 'Request title' });
  assert.equal(await write, 'saved');
  assert.strictEqual(sessions.get('one'), newer);
  assert.deepEqual(commits, [newer]);
});

test('an earlier event does not hide a later confirmed response', async () => {
  const pending = Promise.withResolvers<Session>();
  const { actions, sessions } = fixture(() => pending.promise);
  const write = actions.rename('one', 'Confirmed title');
  sessions.set('one', session('one', 2));
  pending.resolve({ ...session('one', 3), title: 'Confirmed title' });
  assert.equal(await write, 'saved');
  assert.equal(sessions.get('one')?.title, 'Confirmed title');
});

test('responses for another session or directory cannot update the list', async () => {
  for (const response of [session('two', 2), { ...session('one', 2), directory: 'C:/other' }]) {
    const { actions, commits } = fixture(async () => response);
    assert.equal(await actions.rename('one', 'Title'), 'failed');
    assert.equal(commits.length, 0);
  }
});

test('disposing the runtime prevents late commits and new writes', async () => {
  const pending = Promise.withResolvers<Session>();
  let writes = 0;
  const { actions, commits } = fixture(() => { writes++; return pending.promise; });
  const write = actions.rename('one', 'Late title');
  actions.dispose();
  pending.resolve({ ...session('one', 2), title: 'Late title' });
  assert.equal(await write, 'unavailable');
  assert.equal(await actions.archive('two', true), 'unavailable');
  assert.equal(writes, 1);
  assert.equal(commits.length, 0);
});
