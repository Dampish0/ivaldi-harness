import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewableImageUri } from './images.ts';

test('only picker-owned image files can access phone-local URLs', () => {
  for (const uri of ['file:///data/user/0/app/cache/photo.png', 'content://picker/photo/123']) {
    assert.equal(previewableImageUri(uri, 'image/png', 'picker'), uri);
    assert.equal(previewableImageUri(uri, 'image/png', 'message'), null);
  }
});

test('embedded raster images work in drafts and server history without fetching URLs', () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    const uri = `data:${mime};base64,aW1hZ2U=`;
    assert.equal(previewableImageUri(uri, mime, 'message'), uri);
    assert.equal(previewableImageUri(uri, mime, 'picker'), uri);
  }
});

test('unsupported, mismatched and remote sources stay file attachments', () => {
  for (const uri of ['https://server.example/photo.png', '/api/fs/raw?path=photo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,aW1hZ2U=', 'data:image/png;base64,']) {
    assert.equal(previewableImageUri(uri, 'image/png', 'message'), null);
  }
  assert.equal(previewableImageUri('file:///cache/photo.png', 'text/plain', 'picker'), null);
});
