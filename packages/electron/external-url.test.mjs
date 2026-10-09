import assert from 'node:assert/strict';
import test from 'node:test';

import { isOpenableExternalUrl, isSafeExternalUrl } from './external-url.mjs';

const DANGEROUS = [
  'file:///C:/Windows/System32/calc.exe',
  'ms-msdt:/id PCWDiagnostic',
  'search-ms:query=x&crumb=location:\\\\attacker.example\\share',
  'shell:startup',
  'javascript:alert(1)',
  'openchamber-ui://app/',
  'not a url',
  '',
];

test('lets web and mail links leave the app without asking', () => {
  for (const url of [
    'https://github.com/openchamber/openchamber',
    'http://localhost:5173/',
    'mailto:someone@example.com',
  ]) {
    assert.equal(isSafeExternalUrl(url), true, url);
    assert.equal(isOpenableExternalUrl(url), true, url);
  }
});

test('keeps app deep links behind the renderer confirmation', () => {
  for (const url of ['obsidian://open?vault=notes', 'vscode://file/C:/repo/a.ts']) {
    assert.equal(isSafeExternalUrl(url), false, url);
    assert.equal(isOpenableExternalUrl(url), true, url);
  }
});

test('never opens schemes that launch local code', () => {
  for (const url of DANGEROUS) {
    assert.equal(isSafeExternalUrl(url), false, url);
    assert.equal(isOpenableExternalUrl(url), false, url);
  }
  assert.equal(isSafeExternalUrl(undefined), false);
  assert.equal(isOpenableExternalUrl(undefined), false);
});
