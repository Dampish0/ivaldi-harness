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
  const metadata = JSON.parse(await readFile(path.join(path.dirname(esbuildModule), '../package.json'), 'utf8'));
  assert.equal((imported.default ?? imported).version, metadata.version);
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

test('fast HMR builds all web entrypoints with loadable local font URL modules', async (t) => {
  const outdir = path.join(webRoot, 'node_modules/.openchamber-fast-hmr-test');
  const result = await buildFastHmrBundleOnce({
    repoRoot,
    webRoot,
    appVersion: packageJson.version,
    outdir,
  });

  for (const entry of ['main.js', 'mobile.js', 'mini-chat.js']) {
    assert.equal(result.outputs.includes(path.join(outdir, entry)), true, `missing ${entry}`);
    const source = await readFile(path.join(outdir, entry), 'utf8');
    for (const font of ['selawk', 'selawksb', 'selawkb']) {
      const fontUrl = `/@fs/${path.join(repoRoot, 'packages/ui/src/assets/fonts/selawik', `${font}.woff2`).replace(/\\/g, '/')}?url&import`;
      assert.equal(source.includes(JSON.stringify(fontUrl)), true, `${entry} must retain Vite's ${font} URL import`);
    }
  }

  const source = await readFile(path.join(outdir, 'main.js'), 'utf8');
  assert.match(source, /packages\/ui\/src\/main\.tsx/);
  assert.match(source, /\/\@fs\/.*packages\/ui\/src\/index\.css/);
  assert.equal(source.includes('virtual:pwa-register'), false);

  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: false,
    root: repoRoot,
    server: { host: '127.0.0.1', port: 0, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  t.after(() => server.close());
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  const fontImports = [...source.matchAll(/from "([^"]+\/selaw(?:k|ksb|kb)\.woff2[^"]*)"/g)];
  assert.equal(fontImports.length, 3);
  for (const [, moduleUrl] of fontImports) {
    const response = await fetch(new URL(moduleUrl, origin), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    const exported = (await response.text()).match(/export default ("[^"]+")/);
    assert.ok(exported, 'font import must export its asset URL');
    const assetUrl = JSON.parse(exported[1]);
    const asset = await fetch(new URL(assetUrl, origin), { signal: AbortSignal.timeout(5000) });
    assert.equal(asset.status, 200);
    const font = path.basename(assetUrl);
    assert.deepEqual(
      Buffer.from(await asset.arrayBuffer()),
      await readFile(path.join(repoRoot, 'packages/ui/src/assets/fonts/selawik', font)),
    );
  }
});
