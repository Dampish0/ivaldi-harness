import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionAttempts } from './connection-attempt.ts';

function runtime(id: string) {
  let closures = 0;
  return { connection: { id }, close() { closures++; }, get closures() { return closures; } };
}
type TestRuntime = ReturnType<typeof runtime>;

test('same-frame connection presses share a synchronous guard before preparation starts', async () => {
  const pending = Promise.withResolvers<TestRuntime>();
  const activated: string[] = [];
  const attempts = new ConnectionAttempts<TestRuntime>(async id => { activated.push(id); });
  let preparations = 0;
  const first = attempts.run(() => { preparations++; return pending.promise; });
  assert.equal(attempts.getSnapshot(), 'preparing');
  assert.equal(await attempts.run(async () => { preparations++; return runtime('second'); }), null);
  const candidate = runtime('first');
  pending.resolve(candidate);
  assert.strictEqual(await first, candidate);
  assert.equal(preparations, 1);
  assert.deepEqual(activated, ['first']);
  assert.equal(candidate.closures, 0);
  assert.equal(attempts.getSnapshot(), 'idle');
});

for (const outcome of ['success', 'failure']) {
  test(`closing during preparation rejects a late ${outcome} without changing the active connection`, async () => {
    const pending = Promise.withResolvers<TestRuntime>();
    let active = 'previous';
    const attempts = new ConnectionAttempts<TestRuntime>(async id => { active = id; });
    const request = attempts.run(() => pending.promise);
    assert.equal(attempts.cancel(), true);
    const candidate = runtime('abandoned');
    if (outcome === 'success') pending.resolve(candidate); else pending.reject(new Error('Offline'));
    assert.equal(await request, null);
    assert.equal(active, 'previous');
    assert.equal(candidate.closures, outcome === 'success' ? 1 : 0);
    assert.equal(attempts.getSnapshot(), 'idle');
  });
}

test('cancelled single-use redemption keeps its issued credentials saved but does not activate', async () => {
  const redemption = Promise.withResolvers<void>();
  const saved: string[] = [];
  let active = 'previous';
  const candidate = runtime('redeemed');
  const attempts = new ConnectionAttempts<TestRuntime>(async id => { active = id; });
  const request = attempts.run(async () => { await redemption.promise; saved.push(candidate.connection.id); return candidate; });
  attempts.cancel();
  redemption.resolve();
  assert.equal(await request, null);
  assert.deepEqual(saved, ['redeemed']);
  assert.equal(active, 'previous');
  assert.equal(candidate.closures, 1);
});

test('a replacement pairing can start while abandoned preparation completes', async () => {
  const previous = Promise.withResolvers<TestRuntime>();
  const next = Promise.withResolvers<TestRuntime>();
  const activated: string[] = [];
  const attempts = new ConnectionAttempts<TestRuntime>(async id => { activated.push(id); });
  const first = attempts.run(() => previous.promise);
  assert.equal(attempts.replaceWithLink('ivaldi://synthetic-new-link'), true);
  const second = attempts.run(() => next.promise);
  const discarded = runtime('old');
  previous.resolve(discarded);
  assert.equal(await first, null);
  assert.equal(discarded.closures, 1);
  assert.equal(attempts.getSnapshot(), 'preparing');
  const accepted = runtime('new');
  next.resolve(accepted);
  assert.strictEqual(await second, accepted);
  assert.deepEqual(activated, ['new']);
});

test('close is locked during the non-cancellable activation write and incoming links remain pending', async () => {
  const activation = Promise.withResolvers<void>();
  const candidate = runtime('accepted');
  const attempts = new ConnectionAttempts<TestRuntime>(() => activation.promise);
  const request = attempts.run(async () => candidate);
  await Promise.resolve();
  assert.equal(attempts.getSnapshot(), 'activating');
  assert.equal(attempts.cancel(), false);
  assert.equal(attempts.replaceWithLink('ivaldi://synthetic-first-link'), false);
  assert.equal(attempts.replaceWithLink('ivaldi://synthetic-latest-link'), false);
  activation.resolve();
  assert.strictEqual(await request, candidate);
  assert.equal(attempts.takePendingLink(), 'ivaldi://synthetic-latest-link');
  assert.equal(attempts.takePendingLink(), null);
  assert.equal(candidate.closures, 0);
});

test('failed activation closes the candidate, retains a pending link and permits a retry', async () => {
  const activation = Promise.withResolvers<void>();
  let writes = 0;
  const attempts = new ConnectionAttempts<TestRuntime>(async () => { if (++writes === 1) await activation.promise; });
  const candidate = runtime('failed');
  const request = attempts.run(async () => candidate);
  await Promise.resolve();
  attempts.replaceWithLink('ivaldi://synthetic-pending-link');
  activation.reject(new Error('Storage unavailable'));
  await assert.rejects(request, /Storage unavailable/);
  assert.equal(candidate.closures, 1);
  assert.equal(attempts.getSnapshot(), 'idle');
  assert.equal(attempts.takePendingLink(), 'ivaldi://synthetic-pending-link');
  const retry = runtime('retry');
  assert.strictEqual(await attempts.run(async () => retry), retry);
  assert.equal(writes, 2);
});

for (const phase of ['preparing', 'activating']) {
  test(`unmounting during ${phase} cannot return a runtime to the abandoned manager`, async () => {
    const preparation = Promise.withResolvers<TestRuntime>();
    const activation = Promise.withResolvers<void>();
    const activated: string[] = [];
    const candidate = runtime('abandoned');
    const attempts = new ConnectionAttempts<TestRuntime>(async id => { activated.push(id); await activation.promise; });
    const request = attempts.run(() => preparation.promise);
    if (phase === 'activating') { preparation.resolve(candidate); await Promise.resolve(); }
    attempts.dispose();
    preparation.resolve(candidate);
    activation.resolve();
    assert.equal(await request, null);
    assert.equal(candidate.closures, 1);
    assert.deepEqual(activated, phase === 'activating' ? ['abandoned'] : []);
    assert.equal(attempts.getSnapshot(), 'idle');
  });
}

test('startup with no saved connection returns idle without activating', async () => {
  let writes = 0;
  const attempts = new ConnectionAttempts<TestRuntime>(async () => { writes++; });
  assert.equal(await attempts.run(async () => null), null);
  assert.equal(writes, 0);
  assert.equal(attempts.getSnapshot(), 'idle');
});
