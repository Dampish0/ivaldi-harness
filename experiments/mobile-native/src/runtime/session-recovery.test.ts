import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCompleteSessionList, recoveredDraftState, resolveSelectedSession, sessionSendError } from './session-recovery.ts';
import type { Session } from './schema.ts';
import type { Draft } from './chat.ts';

const session = (id: string, updated = 1): Session => ({ id, title: id, directory: '/project', time: { created: 1, updated } });
const draft: Draft = { text: 'Keep this draft', attachments: [{ uri: 'file:///picker/document.txt', name: 'document.txt', mime: 'text/plain', size: 8 }] };

test('a listed selected session does not make another lookup', async () => {
  const selected = session('selected');
  let calls = 0;
  const result = await resolveSelectedSession(selected.id, [selected], async () => { calls++; return null; });
  assert.strictEqual(result.session, selected);
  assert.equal(result.recovery, null);
  assert.equal(calls, 0);
});

test('a session omitted from root or partial lists is recovered by its own endpoint', async () => {
  const selected = session('selected');
  const result = await resolveSelectedSession(selected.id, [session('different')], async id => { assert.equal(id, selected.id); return selected; });
  assert.strictEqual(result.session, selected);
  assert.equal(result.recovery, null);
});

test('only a confirmed missing lookup marks the selected session missing', async () => {
  const result = await resolveSelectedSession('selected', [], async () => null);
  assert.deepEqual(result, { session: null, recovery: { sessionId: 'selected', reason: 'missing' } });
});

test('lookup failure stays unavailable and an explicit retry can recover', async () => {
  const failed = await resolveSelectedSession('selected', [], async () => { throw new Error('Offline'); });
  assert.deepEqual(failed.recovery, { sessionId: 'selected', reason: 'unavailable' });
  const retried = await resolveSelectedSession('selected', [], async () => session('selected'));
  assert.equal(retried.recovery, null);
  assert.equal(retried.session?.id, 'selected');
});

test('a response for another session is rejected without adopting that conversation', async () => {
  const result = await resolveSelectedSession('selected', [], async () => session('different'));
  assert.deepEqual(result, { session: null, recovery: { sessionId: 'selected', reason: 'unavailable' } });
});

test('complete session pagination preserves every page before accepting absence', async () => {
  const cursors: (number | undefined)[] = [];
  const result = await loadCompleteSessionList(async cursor => {
    cursors.push(cursor);
    return cursor === undefined
      ? { sessions: [session('newer', 30), session('middle', 20)], nextCursor: '20' }
      : { sessions: [session('selected', 10)], nextCursor: null };
  }, 2);
  assert.deepEqual(cursors, [undefined, 20]);
  assert.deepEqual([...result.keys()], ['newer', 'middle', 'selected']);
});

test('an authoritative empty session page is successful empty data', async () => {
  assert.equal((await loadCompleteSessionList(async () => ({ sessions: [], nextCursor: null }), 2)).size, 0);
});

test('a failed later page never becomes a partial authoritative session list', async () => {
  await assert.rejects(loadCompleteSessionList(async cursor => {
    if (cursor !== undefined) throw new Error('Later page failed');
    return { sessions: [session('one', 20), session('two', 10)], nextCursor: '10' };
  }, 2), /Later page failed/);
});

test('invalid, nonprogressing and repeated-page cursors fail without accepting a truncated list', async () => {
  for (const nextCursor of ['invalid', ' ', '20', '25']) {
    let page = 0;
    await assert.rejects(loadCompleteSessionList(async () => {
      page++;
      return { sessions: [session(`${page}-one`, 30), session(`${page}-two`, 20)], nextCursor: page === 1 ? '20' : nextCursor };
    }, 2), /pagination did not complete/);
  }
  await assert.rejects(loadCompleteSessionList(async cursor => ({ sessions: [session('one', 30), session('two', 20)], nextCursor: cursor === undefined ? '20' : '10' }), 2), /pagination did not complete/);
});

test('sending to unresolved or confirmed missing sessions is blocked before attachment processing', () => {
  assert.equal(sessionSendError('missing', [], null), 'load');
  assert.equal(sessionSendError('missing', [], { sessionId: 'missing', reason: 'missing' }), 'sessionMissing');
  assert.equal(sessionSendError('missing', [], { sessionId: 'missing', reason: 'unavailable' }), 'load');
  assert.equal(sessionSendError('selected', [session('selected')], { sessionId: 'other', reason: 'missing' }), null);
  assert.equal(sessionSendError(null, [], { sessionId: 'old', reason: 'missing' }), null);
});

test('recovery copies the current stranded draft and attachments without consuming another new draft', () => {
  const unsentNew: Draft = { text: 'Already writing a different chat', attachments: [] };
  const edited: Draft = { ...draft, text: 'Edited while the new session was being created' };
  const current = { activeId: 'missing', drafts: { missing: edited, new: unsentNew } };
  const result = recoveredDraftState(current, 'missing', 'created');
  assert.equal(result?.activeId, 'created');
  assert.strictEqual(result?.drafts.created, edited);
  assert.strictEqual(result?.drafts.created.attachments, draft.attachments);
  assert.strictEqual(result?.drafts.missing, edited);
  assert.strictEqual(result?.drafts.new, unsentNew);
  assert.deepEqual(Object.keys(current.drafts), ['missing', 'new']);
});

test('recovery does not navigate away from a conversation selected while creation was pending', () => {
  const result = recoveredDraftState({ activeId: 'different', drafts: { missing: draft } }, 'missing', 'created');
  assert.equal(result?.activeId, 'different');
  assert.strictEqual(result?.drafts.created, draft);
});

test('recovery refuses a destination that already contains a draft or reuses the missing identity', () => {
  const current = { activeId: 'missing', drafts: { missing: draft, created: { text: 'User edits', attachments: [] } } };
  assert.equal(recoveredDraftState(current, 'missing', 'created'), null);
  assert.equal(recoveredDraftState(current, 'missing', 'missing'), null);
  assert.equal(current.drafts.created.text, 'User edits');
});
