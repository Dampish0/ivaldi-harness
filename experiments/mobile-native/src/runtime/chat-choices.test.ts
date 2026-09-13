import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatSelectionSchema, rememberChatChoice, restoreChatChoices, sessionChatChoice, type ChatChoice } from './chat-choices.ts';
import { messagesSchema, sessionSchema, type Message, type Session } from './schema.ts';

const original: ChatChoice = { model: { providerID: 'provider-a', modelID: 'model/a', variant: 'high' }, agent: 'build' };
const defaults: ChatChoice = { model: { providerID: 'provider-b', modelID: 'model/b', variant: 'low' }, agent: 'plan' };
const session = (id: string): Session => ({ id, title: id, directory: '/project', time: { created: 1, updated: 2 } });
const user = (created: number, choice: ChatChoice): Message => ({ info: { id: `user-${created}`, sessionID: 'a', role: 'user', time: { created }, model: choice.model ?? undefined, agent: choice.agent }, parts: [] });

test('legacy preferences attach the existing model and agent only to their saved active chat', () => {
  const saved = chatSelectionSchema.parse({ activeId: 'a', ...original });
  const choices = restoreChatChoices(saved);
  assert.deepEqual(choices, { a: original });
  assert.deepEqual(sessionChatChoice('a', choices, session('a'), []), original);
  assert.deepEqual(sessionChatChoice('other', choices, session('other'), []), { model: null, agent: '' });
});

test('legacy new-chat preferences seed only the new draft slot', () => {
  const saved = chatSelectionSchema.parse(original);
  assert.equal(saved.activeId, null);
  assert.deepEqual(restoreChatChoices(saved), { new: original });
});

test('applying new-chat defaults and returning to an existing conversation preserves its choice', () => {
  let choices = rememberChatChoice({}, 'a', original);
  choices = rememberChatChoice(choices, null, defaults);
  assert.deepEqual(sessionChatChoice('a', choices, session('a'), []), original);
  assert.deepEqual(choices.new, defaults);
  const nextVisit = rememberChatChoice(choices, 'b', { ...original, agent: 'review' });
  assert.deepEqual(sessionChatChoice('a', nextVisit, session('a'), []), original);
  assert.equal(nextVisit.b.agent, 'review');
});

test('per-session models, variants and agents survive a persisted round trip', () => {
  const sessionChoices = rememberChatChoice(rememberChatChoice({}, 'a', original), 'b', defaults);
  const saved = chatSelectionSchema.parse(JSON.parse(JSON.stringify({ activeId: 'b', ...defaults, sessionChoices })));
  const restored = restoreChatChoices(saved);
  assert.deepEqual(sessionChatChoice('a', restored, session('a'), []), original);
  assert.deepEqual(sessionChatChoice('b', restored, session('b'), []), defaults);
});

test('existing per-session records win over a stale legacy scalar pair', () => {
  const saved = chatSelectionSchema.parse({ activeId: 'a', ...defaults, sessionChoices: { a: original } });
  assert.deepEqual(restoreChatChoices(saved).a, original);
});

test('malformed persisted per-session choices remain validation failures', () => {
  assert.throws(() => chatSelectionSchema.parse({ ...original, sessionChoices: { a: { model: { providerID: 'missing-model-id' }, agent: 'build' } } }));
  assert.throws(() => chatSelectionSchema.parse({ ...original, sessionChoices: null }));
});

test('an external session uses explicit SDK session model and agent metadata', () => {
  const parsed = sessionSchema.parse({ ...session('a'), agent: 'plan', model: { providerID: 'provider-b', id: 'model/b', variant: 'low' } });
  assert.deepEqual(sessionChatChoice('a', {}, parsed, [user(10, original)]), defaults);
});

test('latest user-message choices fill missing session fields without reading assistant choices', () => {
  const messages = messagesSchema.parse([
    user(30, defaults),
    { ...user(40, original), info: { ...user(40, original).info, role: 'assistant' } },
    user(10, original),
  ]);
  assert.deepEqual(sessionChatChoice('a', {}, session('a'), messages), defaults);
  assert.deepEqual(sessionChatChoice('a', {}, { ...session('a'), agent: 'custom-agent' }, messages), { ...defaults, agent: 'custom-agent' });
});

test('unknown external choices never inherit the regular new-chat defaults', () => {
  assert.deepEqual(sessionChatChoice('a', { new: defaults }, session('a'), []), { model: null, agent: '' });
});

test('late history cannot overwrite a manual model or agent choice made while it loaded', () => {
  const choices = rememberChatChoice({}, 'a', original);
  assert.deepEqual(sessionChatChoice('a', choices, { ...session('a'), agent: 'plan', model: { id: 'model/b', providerID: 'provider-b' } }, [user(10, defaults)]), original);
});

test('a manual choice in one field still allows authoritative recovery of the other', () => {
  assert.deepEqual(sessionChatChoice('a', { a: { model: original.model, agent: '' } }, session('a'), [user(10, defaults)]), { model: original.model, agent: defaults.agent });
  assert.deepEqual(sessionChatChoice('a', { a: { model: null, agent: original.agent } }, session('a'), [user(10, defaults)]), { model: defaults.model, agent: original.agent });
});

test('recording a created or recovered session retains its captured choice and other drafts choices', () => {
  const choices = rememberChatChoice(rememberChatChoice({}, 'source', original), null, defaults);
  const result = rememberChatChoice(choices, 'created', original);
  assert.deepEqual(result.created, original);
  assert.strictEqual(result.source, choices.source);
  assert.strictEqual(result.new, choices.new);
});
