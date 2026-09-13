import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceLoader } from './workspace-load.ts';
import type { WorkspacePage } from './workspace.ts';

const firstPage: WorkspacePage = { html: '<main>First load</main>', baseUrl: 'https://host.example/mobile?session=one' };
const freshPage: WorkspacePage = { html: '<main>Fresh load</main>', baseUrl: firstPage.baseUrl };

test('workspace fetch failure offers a fresh request and remains loading until WebView confirms success', async () => {
  let requests = 0;
  const loader = new WorkspaceLoader(async () => { if (++requests === 1) throw new Error('Offline'); return freshPage; });
  await loader.load();
  assert.equal(loader.getSnapshot().status, 'failed');
  assert.equal(loader.getSnapshot().page, null);
  await loader.load();
  assert.equal(requests, 2);
  assert.equal(loader.getSnapshot().status, 'loading');
  assert.strictEqual(loader.getSnapshot().page, freshPage);
  loader.ready(loader.getSnapshot().attempt);
  assert.equal(loader.getSnapshot().status, 'ready');
});

test('retry drops failed WebView content and obtains fresh application HTML', async () => {
  let requests = 0;
  const loader = new WorkspaceLoader(async () => ++requests === 1 ? firstPage : freshPage);
  await loader.load();
  const firstAttempt = loader.getSnapshot().attempt;
  loader.ready(firstAttempt);
  loader.failed(firstAttempt);
  const retry = loader.load();
  assert.equal(loader.getSnapshot().status, 'loading');
  assert.equal(loader.getSnapshot().page, null);
  loader.failed(firstAttempt);
  loader.ready(firstAttempt);
  await retry;
  assert.strictEqual(loader.getSnapshot().page, freshPage);
  loader.ready(loader.getSnapshot().attempt);
  assert.equal(loader.getSnapshot().status, 'ready');
  assert.equal(requests, 2);
});

for (const outcome of ['success', 'failure']) {
  test(`a superseded ${outcome} cannot replace the newer workspace request`, async () => {
    const pending = Promise.withResolvers<WorkspacePage>();
    let requests = 0;
    const loader = new WorkspaceLoader(() => ++requests === 1 ? pending.promise : Promise.resolve(freshPage));
    const previous = loader.load();
    await loader.load();
    loader.ready(loader.getSnapshot().attempt);
    const current = loader.getSnapshot();
    if (outcome === 'success') pending.resolve(firstPage); else pending.reject(new Error('Old connection failed'));
    await previous;
    assert.strictEqual(loader.getSnapshot(), current);
    assert.strictEqual(loader.getSnapshot().page, freshPage);
  });
}

for (const outcome of ['success', 'failure']) {
  test(`closing during a pending ${outcome} cannot publish the abandoned page`, async () => {
    const pending = Promise.withResolvers<WorkspacePage>();
    const loader = new WorkspaceLoader(() => pending.promise);
    let notifications = 0;
    loader.subscribe(() => { notifications++; });
    const request = loader.load();
    const current = loader.getSnapshot();
    loader.cancel();
    if (outcome === 'success') pending.resolve(firstPage); else pending.reject(new Error('Offline'));
    await request;
    assert.equal(notifications, 1);
    assert.strictEqual(loader.getSnapshot(), current);
  });
}

test('late browser completion cannot erase a render-process or navigation failure', async () => {
  const loader = new WorkspaceLoader(async () => firstPage);
  await loader.load();
  const attempt = loader.getSnapshot().attempt;
  loader.ready(attempt);
  loader.failed(attempt);
  const failed = loader.getSnapshot();
  loader.loading(attempt);
  loader.ready(attempt);
  loader.failed(attempt);
  assert.strictEqual(loader.getSnapshot(), failed);
  assert.equal(failed.page, null);
});

test('closing also rejects callbacks from an already loaded WebView', async () => {
  const loader = new WorkspaceLoader(async () => firstPage);
  await loader.load();
  const attempt = loader.getSnapshot().attempt;
  loader.ready(attempt);
  const current = loader.getSnapshot();
  loader.cancel();
  loader.failed(attempt);
  loader.loading(attempt);
  loader.ready(attempt);
  assert.strictEqual(loader.getSnapshot(), current);
});

test('a recreated effect starts a fresh request after cancelling the preceding lifecycle', async () => {
  const pending = Promise.withResolvers<WorkspacePage>();
  let requests = 0;
  const loader = new WorkspaceLoader(() => ++requests === 1 ? pending.promise : Promise.resolve(freshPage));
  const first = loader.load();
  loader.cancel();
  await loader.load();
  pending.resolve(firstPage);
  await first;
  loader.ready(loader.getSnapshot().attempt);
  assert.equal(loader.getSnapshot().status, 'ready');
  assert.strictEqual(loader.getSnapshot().page, freshPage);
});

test('browser navigation reports loading and keeps its page until success or failure', async () => {
  const loader = new WorkspaceLoader(async () => firstPage);
  await loader.load();
  const attempt = loader.getSnapshot().attempt;
  loader.ready(attempt);
  const ready = loader.getSnapshot();
  loader.ready(attempt);
  assert.strictEqual(loader.getSnapshot(), ready);
  loader.loading(attempt);
  assert.equal(loader.getSnapshot().status, 'loading');
  assert.strictEqual(loader.getSnapshot().page, firstPage);
  loader.ready(attempt);
  assert.equal(loader.getSnapshot().status, 'ready');
});
