import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMessageEvent, reconcileHistory, isManagedChat, upsertSession } from './conversations.ts';
import type { Message, RuntimeEvent, Session } from './schema.ts';

const message = (text: string): Message => ({ info: { id: 'msg-1', sessionID: 'session-1', role: 'assistant', time: { created: 1 } }, parts: [{ id: 'part-1', messageID: 'msg-1', sessionID: 'session-1', type: 'text', text }] });
const delta: RuntimeEvent = { type: 'message.part.delta', properties: { sessionID: 'session-1', messageID: 'msg-1', partID: 'part-1', field: 'text', delta: ' world' } };

test('a streamed delta only changes its owning message and part', () => {
  const other: Message = { ...message('Other'), info: { ...message('').info, id: 'other' } };
  const result = applyMessageEvent([message('Hello'), other], delta);
  assert.equal(result[1], other);
  assert.equal(result[0].parts[0].type === 'text' && result[0].parts[0].text, 'Hello world');
});
test('history racing a delta does not append the same text twice', () => {
  const live = applyMessageEvent([message('Hello')], delta);
  const merged = reconcileHistory([message('Hello world')], live, [delta])[0].parts[0];
  assert.equal(merged.type === 'text' && merged.text, 'Hello world');
  assert.deepEqual(reconcileHistory([message('Hello')], live, [delta]), live);
});
test('a history snapshot cannot resurrect a message removed while loading', () => {
  const removed: RuntimeEvent = { type: 'message.removed', properties: { sessionID: 'session-1', messageID: 'msg-1' } };
  assert.deepEqual(reconcileHistory([message('Old')], [], [removed]), []);
});
test('a history snapshot cannot resurrect a removed part', () => {
  const removed: RuntimeEvent = { type: 'message.part.removed', properties: { sessionID: 'session-1', messageID: 'msg-1', partID: 'part-1' } };
  assert.deepEqual(reconcileHistory([message('Old')], [{ ...message(''), parts: [] }], [removed])[0].parts, []);
});
test('unrelated deltas do not invent messages or cross conversation boundaries', () => {
  assert.deepEqual(applyMessageEvent([], delta), []);
  const other: Message = { ...message('Other'), info: { ...message('').info, id: 'other' } };
  assert.equal(applyMessageEvent([other], delta)[0], other);
});
test('both existing managed chat directory names work on Windows and Unix', () => {
  assert.equal(isManagedChat('C:\\Users\\test\\.config\\ivaldi\\chats\\2026-09-12\\session-a'), true);
  assert.equal(isManagedChat('/home/test/.config/openchamber/chats/session-b'), true);
  assert.equal(isManagedChat('/project/chats/session-a'), false);
});
test('renaming preserves one session identity and authoritative ordering', () => {
  const original: Session = { id: 'a', title: 'Original', directory: '/project', time: { created: 1, updated: 1 } };
  const other: Session = { ...original, id: 'b', time: { created: 2, updated: 2 } };
  const updated: Session = { ...original, title: 'Renamed', time: { created: 1, updated: 3 } };
  assert.deepEqual(upsertSession([other, original], updated), [updated, other]);
});
