import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBrowserPopupWindowOpen } from './browser-popup.mjs';

test('allows HTTP(S) browser popups in a visible, isolated window', () => {
  const response = resolveBrowserPopupWindowOpen('https://example.com/account');

  assert.equal(response.action, 'allow');
  assert.deepEqual(response.overrideBrowserWindowOptions, {
    width: 1100,
    height: 760,
    minWidth: 480,
    minHeight: 360,
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:openchamber-browser',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  });
});

test('denies non-web and credential-bearing popup URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///C:/Users/test/secret.txt',
    'https://user:password@example.com/',
    'not a URL',
  ]) {
    assert.deepEqual(resolveBrowserPopupWindowOpen(url), { action: 'deny' }, url);
  }
});
