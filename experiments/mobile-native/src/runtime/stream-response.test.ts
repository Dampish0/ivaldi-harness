import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StreamResponse, trackResponse } from './stream-response.ts';

function response(chunks: string[], status = 200) {
  return new StreamResponse(new ReadableStream({ start(controller) { for (const text of chunks) controller.enqueue(new TextEncoder().encode(text)); controller.close(); } }), { status, headers: { 'content-type': 'application/json' } });
}
test('native relay response preserves metadata and JSON across chunk boundaries', async () => {
  const result = response(['{"name":', '"Ivaldi"}'], 201);
  assert.equal(result.status, 201); assert.equal(result.ok, true);
  assert.equal(result.headers.get('content-type'), 'application/json');
  assert.deepEqual(await result.json(), { name: 'Ivaldi' });
  await assert.rejects(() => result.text(), TypeError);
});
test('an aborted relay response rejects instead of yielding an empty result', async () => {
  const result = new StreamResponse(new ReadableStream({ start(controller) { controller.error(new Error('disconnected')); } }), { status: 200 });
  await assert.rejects(() => result.json(), /disconnected/);
});
test('empty and non-success responses retain their HTTP meaning', async () => {
  const empty = new StreamResponse(null, { status: 204 });
  assert.equal(await empty.text(), ''); assert.equal(empty.ok, true);
  const rejected = response(['{"error":"denied"}'], 403);
  assert.equal(rejected.ok, false); assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { error: 'denied' });
});

test('transport cleanup waits for the body and runs once after completion', async () => {
  let finishes = 0;
  const result = trackResponse(response(['{"ok":true}']), () => finishes++);
  assert.equal(finishes, 0);
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(finishes, 1);
});

test('cancelling an event stream releases its transport lifecycle', async () => {
  let finishes = 0; let cancellations = 0;
  const source = new StreamResponse(new ReadableStream({ cancel() { cancellations++; } }), { status: 200 });
  const result = trackResponse(source, () => finishes++);
  await result.body?.cancel();
  assert.equal(finishes, 1); assert.equal(cancellations, 1);
});

test('body failure releases transport listeners and remains a failure', async () => {
  let finishes = 0;
  const source = new StreamResponse(new ReadableStream({ start(controller) { controller.error(new Error('offline')); } }), { status: 200 });
  await assert.rejects(() => trackResponse(source, () => finishes++).text(), /offline/);
  assert.equal(finishes, 1);
});
