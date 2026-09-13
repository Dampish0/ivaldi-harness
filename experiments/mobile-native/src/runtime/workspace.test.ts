import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowsWorkspaceNavigation, prepareWorkspacePage, workspaceUrl } from './workspace.ts';

test('workspace routing carries the session without putting credentials in its URL', () => {
  const url = workspaceUrl('https://host.example', 'session & one');
  assert.equal(url.pathname, '/mobile'); assert.equal(url.searchParams.get('session'), 'session & one');
  const page = prepareWorkspacePage('<html><head><script src="/app.js"></script></head><div id="root"></div></html>', url, 'fixture-token', 'developer');
  assert.equal(page.baseUrl, url.href); assert.ok(!page.baseUrl.includes('fixture-token'));
  assert.ok(page.html.indexOf('__OPENCHAMBER_API_BASE_URL__') < page.html.indexOf('src="/app.js"'));
});
test('bootstrap strings cannot break out into another script', () => {
  const page = prepareWorkspacePage('<head></head><div id="root"></div>', new URL('https://host.example/mobile'), '</script><script>unexpected()</script>', 'work');
  assert.equal((page.html.match(/<script>/g) ?? []).length, 1);
  assert.ok(page.html.includes('\\u003c/script>'));
  assert.throws(() => prepareWorkspacePage('<head></head><article>Raw user file</article>', new URL('https://host.example/mobile'), null, 'work'));
});
test('the credential-bearing application cannot navigate to raw files or another origin', () => {
  const base = 'https://host.example/mobile';
  assert.equal(allowsWorkspaceNavigation(base + '?session=another', base), true);
  for (const url of ['https://other.example/mobile', 'https://host.example/api/fs/raw?path=a.html', 'javascript:alert(1)', 'file:///secret', 'https://host.example/mobile/../api/raw', 'https://user:password@host.example/mobile']) assert.equal(allowsWorkspaceNavigation(url, base), false);
});
