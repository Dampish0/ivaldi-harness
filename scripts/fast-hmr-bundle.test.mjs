import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FAST_HMR_PUBLIC_PREFIX,
  buildFastHmrBundleOnce,
  resolveViteOwnedEsbuildModule,
  rewriteFastHmrHtml,
} from './fast-hmr-bundle.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repoRoot, 'packages/web');
const packageJson = JSON.parse(await readFile(path.join(webRoot, 'package.json'), 'utf8'));

test('fast HMR resolves esbuild from Vite without a direct dependency', async () => {
  const esbuildModule = resolveViteOwnedEsbuildModule(repoRoot);
  const imported = await import(new URL(`file:///${esbuildModule.replace(/\\/g, '/')}`));
  assert.equal(typeof (imported.default ?? imported).build, 'function');
});

test('fast HMR rewrites only the matching web entrypoint', () => {
  const fixtures = [
    ['index.html', '/src/main.tsx', 'main.js'],
    ['mobile.html', '/src/mobile-main.tsx', 'mobile.js'],
    ['mini-chat.html', '/src/mini-chat-main.tsx', 'mini-chat.js'],
  ];

  for (const [filename, source, output] of fixtures) {
    const html = `<script type="module" src="${source}"></script>`;
    const rewritten = rewriteFastHmrHtml(html, path.join(webRoot, filename));
    assert.match(rewritten, /await import\(\/\* @vite-ignore \*\/ fastHmrEntry\)/);
    assert.equal(rewritten.includes(`${FAST_HMR_PUBLIC_PREFIX}${output}`), true);
    assert.equal(rewritten.includes(source), false);
  }

  const unrelated = '<script type="module" src="/src/other.tsx"></script>';
  assert.equal(rewriteFastHmrHtml(unrelated, path.join(webRoot, 'other.html')), unrelated);
});

test('fast HMR bundle builds all web development entrypoints into the dev cache', async () => {
  const outdir = path.join(webRoot, 'node_modules/.openchamber-fast-hmr-test');
  const result = await buildFastHmrBundleOnce({
    repoRoot,
    webRoot,
    appVersion: packageJson.version,
    outdir,
  });

  for (const entry of ['main.js', 'mobile.js', 'mini-chat.js']) {
    assert.equal(result.outputs.includes(path.join(outdir, entry)), true, `missing ${entry}`);
  }

  const source = await readFile(path.join(outdir, 'main.js'), 'utf8');
  assert.match(source, /packages\/ui\/src\/main\.tsx/);
  assert.match(source, /\/\@fs\/.*packages\/ui\/src\/index\.css/);
  assert.equal(source.includes('virtual:pwa-register'), false);
});
