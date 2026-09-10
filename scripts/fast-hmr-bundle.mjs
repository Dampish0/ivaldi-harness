import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, watch as watchFs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

export const FAST_HMR_PUBLIC_PREFIX = '/__openchamber-fast-hmr/';

const HTML_ENTRYPOINTS = new Map([
  ['index.html', { source: '/src/main.tsx', output: 'main.js' }],
  ['mobile.html', { source: '/src/mobile-main.tsx', output: 'mobile.js' }],
  ['mini-chat.html', { source: '/src/mini-chat-main.tsx', output: 'mini-chat.js' }],
]);

const MIME_TYPES = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
]);

export function resolveViteOwnedEsbuildModule(repoRoot) {
  const viteDirectory = realpathSync(path.join(repoRoot, 'node_modules/vite'));
  const esbuildModule = path.join(path.dirname(viteDirectory), 'esbuild/lib/main.js');
  if (!existsSync(esbuildModule)) {
    throw new Error(
      `[fast-hmr] Vite's esbuild dependency was not found at ${esbuildModule}. Run the normal dependency install before starting HMR.`,
    );
  }
  return esbuildModule;
}

export function rewriteFastHmrHtml(html, filename) {
  const entrypoint = HTML_ENTRYPOINTS.get(path.basename(filename));
  if (!entrypoint) return html;

  const escapedSource = entrypoint.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scriptPattern = new RegExp(
    `<script\\s+type=["']module["']\\s+src=["']${escapedSource}["']\\s*><\\/script>`,
  );
  if (!scriptPattern.test(html)) {
    throw new Error(
      `[fast-hmr] Expected ${path.basename(filename)} to load ${entrypoint.source}. Update the fast-HMR entry mapping if the page entrypoint changed.`,
    );
  }

  const publicUrl = `${FAST_HMR_PUBLIC_PREFIX}${entrypoint.output}`;
  return html.replace(
    scriptPattern,
    `<script type="module">const fastHmrEntry = ${JSON.stringify(publicUrl)}; await import(/* @vite-ignore */ fastHmrEntry);</script>`,
  );
}

const resolveUiImportFactory = (uiSource) => (relativePath) => {
  const base = path.join(uiSource, relativePath);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.json`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  const file = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!file) throw new Error(`[fast-hmr] Unable to resolve shared UI import @/${relativePath}`);
  return file;
};

const resolveLocalImport = (specifier, resolveDir) => {
  if (!specifier.startsWith('.')) return null;

  const base = path.resolve(resolveDir, specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.json`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
};

const viteFsUrl = (file, suffix = '') => `/@fs/${file.replace(/\\/g, '/')}${suffix}`;

const createBridgePlugin = ({ repoRoot, uiSource }) => {
  const resolveUiImport = resolveUiImportFactory(uiSource);
  const providerLogoDirectory = path.join(uiSource, 'assets/provider-logos');
  const opencodeBrowserClient = path.join(repoRoot, 'node_modules/@opencode-ai/sdk/dist/v2/client.js');
  const pierreDiffsWorker = path.join(
    realpathSync(path.join(repoRoot, 'packages/ui/node_modules/@pierre/diffs')),
    'dist/worker/worker.js',
  );
  const pwaStubNamespace = 'openchamber-fast-hmr-pwa-stub';

  const buildProviderLogoModules = () => Object.fromEntries(
    readdirSync(providerLogoDirectory)
      .filter((file) => file.endsWith('.svg'))
      .map((file) => [
        `../assets/provider-logos/${file}`,
        viteFsUrl(path.join(providerLogoDirectory, file)),
      ]),
  );

  return {
    name: 'openchamber-fast-hmr-bridge',
    setup(build) {
      build.onLoad({ filter: /useProviderLogo\.ts$/ }, (args) => {
        const source = readFileSync(args.path, 'utf8');
        const globExpression = /import\.meta\.glob<string>\('\.\.\/assets\/provider-logos\/\*\.svg',\s*\{\s*eager:\s*true,\s*import:\s*'default',\s*\}\)/;
        if (!globExpression.test(source)) {
          throw new Error(`[fast-hmr] Provider logo glob shape changed in ${args.path}`);
        }
        return {
          contents: source.replace(globExpression, JSON.stringify(buildProviderLogoModules())),
          loader: 'ts',
          watchDirs: [providerLogoDirectory],
        };
      });

      build.onResolve({ filter: /^@ivaldi\/ui\// }, (args) => {
        const relativePath = args.path.slice('@ivaldi/ui/'.length);
        const file = resolveUiImport(relativePath);
        if (relativePath.endsWith('.css')) {
          return { path: viteFsUrl(file), external: true };
        }
        return { path: file };
      });

      build.onResolve({ filter: /^@opencode-ai\/sdk\/v2$/ }, () => ({
        path: opencodeBrowserClient,
      }));

      build.onResolve({ filter: /^@\// }, (args) => {
        const relativePath = args.path.slice(2);
        const file = resolveUiImport(relativePath);
        if (relativePath.endsWith('.css')) {
          return { path: viteFsUrl(file), external: true };
        }
        return { path: file };
      });

      build.onResolve({ filter: /\.css$/ }, (args) => {
        const file = resolveLocalImport(args.path, args.resolveDir);
        return file ? { path: viteFsUrl(file), external: true } : undefined;
      });

      build.onResolve({ filter: /^virtual:pwa-register$/ }, () => ({
        path: 'pwa-register',
        namespace: pwaStubNamespace,
      }));
      build.onLoad({ filter: /.*/, namespace: pwaStubNamespace }, () => ({
        contents: 'export const registerSW = () => undefined;',
        loader: 'js',
      }));

      build.onResolve({ filter: /\?worker&url$/ }, (args) => {
        const specifier = args.path.slice(0, -'?worker&url'.length);
        const file = specifier === '@pierre/diffs/worker/worker.js'
          ? pierreDiffsWorker
          : path.resolve(args.resolveDir, specifier);
        return { path: viteFsUrl(file, '?worker&url'), external: true };
      });
    },
  };
};

const createBuildOptions = ({ repoRoot, webRoot, appVersion, outdir, plugins = [] }) => {
  const uiSource = path.join(repoRoot, 'packages/ui/src');
  const webSource = path.join(webRoot, 'src');
  const viteOpencodeUrl = process.env.VITE_OPENCODE_URL ?? '';

  return {
    absWorkingDir: repoRoot,
    entryPoints: {
      main: path.join(webSource, 'main.tsx'),
      mobile: path.join(webSource, 'mobile-main.tsx'),
      'mini-chat': path.join(webSource, 'mini-chat-main.tsx'),
    },
    outdir,
    entryNames: '[name]',
    assetNames: 'assets/[name]-[hash]',
    bundle: true,
    splitting: false,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    sourcemap: false,
    minify: false,
    write: true,
    metafile: true,
    logLevel: 'warning',
    nodePaths: [path.join(repoRoot, 'node_modules'), path.join(repoRoot, 'packages/ui/node_modules')],
    define: {
      'import.meta.env.DEV': 'true',
      'import.meta.env.PROD': 'false',
      'import.meta.env.SSR': 'false',
      'import.meta.env.MODE': '"development"',
      'import.meta.env.BASE_URL': '"/"',
      'import.meta.env.VITE_OPENCODE_URL': JSON.stringify(viteOpencodeUrl),
      'process.env': '{}',
      global: 'globalThis',
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    loader: {
      '.svg': 'file',
      '.png': 'file',
      '.jpg': 'file',
      '.jpeg': 'file',
      '.gif': 'file',
      '.webp': 'file',
      '.woff': 'file',
      '.woff2': 'file',
      '.ttf': 'file',
    },
    plugins: [createBridgePlugin({ repoRoot, uiSource }), ...plugins],
  };
};

const loadEsbuild = async (repoRoot) => {
  const imported = await import(pathToFileURL(resolveViteOwnedEsbuildModule(repoRoot)).href);
  return imported.default ?? imported;
};

export async function buildFastHmrBundleOnce({ repoRoot, webRoot, appVersion, outdir }) {
  const esbuild = await loadEsbuild(repoRoot);
  rmSync(outdir, { recursive: true, force: true });
  const startedAt = performance.now();
  const result = await esbuild.build(createBuildOptions({ repoRoot, webRoot, appVersion, outdir }));
  return {
    durationMs: Math.round(performance.now() - startedAt),
    outputs: Object.keys(result.metafile?.outputs ?? {}).map((file) => path.resolve(repoRoot, file)),
  };
}

const decodeFastHmrPath = (requestUrl) => {
  const pathname = requestUrl?.split('?', 1)[0] ?? '';
  if (!pathname.startsWith(FAST_HMR_PUBLIC_PREFIX)) return null;

  try {
    const decoded = decodeURIComponent(pathname.slice(FAST_HMR_PUBLIC_PREFIX.length));
    const normalized = path.posix.normalize(`/${decoded}`).slice(1);
    if (!decoded || decoded.includes('\0') || normalized !== decoded || decoded.startsWith('/')) {
      return { invalid: true };
    }
    return { relativePath: decoded };
  } catch {
    return { invalid: true };
  }
};

export async function createFastHmrBundlePlugin({ repoRoot, webRoot, appVersion }) {
  const esbuild = await loadEsbuild(repoRoot);
  const outdir = path.join(webRoot, 'node_modules/.openchamber-fast-hmr');
  const uiSource = path.join(repoRoot, 'packages/ui/src');
  const webSource = path.join(webRoot, 'src');
  const startupStylesheetUrl = viteFsUrl(path.join(uiSource, 'index.css'));
  rmSync(outdir, { recursive: true, force: true });
  let server = null;
  let initialBuild = true;
  let buildStartedAt = performance.now();
  let disposed = false;
  let rebuildTimer = null;
  let rebuildInFlight = false;
  let rebuildQueued = false;

  const lifecyclePlugin = {
    name: 'openchamber-fast-hmr-lifecycle',
    setup(build) {
      build.onStart(() => {
        buildStartedAt = performance.now();
      });
      build.onEnd((result) => {
        if (result.errors.length > 0) {
          if (!initialBuild) {
            console.error('[fast-hmr] rebuild failed; keeping the last successful bundle loaded.');
          }
          return;
        }

        const durationMs = Math.round(performance.now() - buildStartedAt);
        if (initialBuild) {
          initialBuild = false;
          console.log(`[fast-hmr] desktop/mobile dev bundle ready in ${durationMs}ms`);
          return;
        }

        console.log(`[fast-hmr] rebuilt dev bundle in ${durationMs}ms`);
        server?.ws.send({ type: 'full-reload' });
      });
    },
  };

  const context = await esbuild.context(createBuildOptions({
    repoRoot,
    webRoot,
    appVersion,
    outdir,
    plugins: [lifecyclePlugin],
  }));

  try {
    const initialRebuildStartedAt = performance.now();
    await context.rebuild();
    console.log(`[fast-hmr] initial context ready in ${Math.round(performance.now() - initialRebuildStartedAt)}ms`);
  } catch (error) {
    await context.dispose();
    throw error;
  }

  const shouldRebuildForSourceChange = (file, event) => {
    const resolved = path.resolve(file);
    const inSourceTree = resolved.startsWith(`${uiSource}${path.sep}`)
      || resolved.startsWith(`${webSource}${path.sep}`);
    if (!inSourceTree) return false;

    const extension = path.extname(resolved).toLowerCase();
    if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) return true;

    // Existing asset contents are served by Vite via /@fs and do not need a
    // JavaScript rebuild. Adding/removing an asset can change a generated
    // registry such as provider logos, so refresh the bundle in that case.
    return event === 'rename'
      && ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension);
  };

  const scheduleRebuild = () => {
    if (disposed) return;
    if (rebuildInFlight) {
      rebuildQueued = true;
      return;
    }
    if (rebuildTimer) return;
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      rebuildInFlight = true;
      void context.rebuild()
        .catch((error) => {
          console.error('[fast-hmr] rebuild failed:', error);
        })
        .finally(() => {
          rebuildInFlight = false;
          if (rebuildQueued) {
            rebuildQueued = false;
            scheduleRebuild();
          }
        });
    }, 40);
  };

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await context.dispose();
  };

  return {
    name: 'openchamber-fast-hmr-bundle',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return rewriteFastHmrHtml(html, context.filename);
      },
    },
    configureServer(viteServer) {
      server = viteServer;
      // Tailwind is the last expensive cold transform after the JavaScript
      // graph is prebundled. Start that single transform as soon as Vite's
      // server exists so the browser can share the in-flight/cached result
      // instead of discovering it only after the 40 MB app module arrives.
      void viteServer.transformRequest(startupStylesheetUrl).catch((error) => {
        console.warn('[fast-hmr] startup stylesheet warmup failed; Vite will retry on browser request:', error);
      });
      const sourceWatchers = [uiSource, webSource].map((root) => {
        const watcher = watchFs(root, { recursive: true }, (event, filename) => {
          if (!filename) {
            scheduleRebuild();
            return;
          }
          const file = path.join(root, String(filename));
          if (shouldRebuildForSourceChange(file, event)) scheduleRebuild();
        });
        watcher.on('error', (error) => {
          console.error(`[fast-hmr] source watcher failed for ${root}:`, error);
        });
        return watcher;
      });
      viteServer.httpServer?.once('close', () => {
        for (const watcher of sourceWatchers) watcher.close();
        if (rebuildTimer) {
          clearTimeout(rebuildTimer);
          rebuildTimer = null;
        }
        void dispose();
      });

      viteServer.middlewares.use((req, res, next) => {
        const requested = decodeFastHmrPath(req.url);
        if (!requested) {
          next();
          return;
        }
        if (requested.invalid) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        const requestedPath = path.resolve(outdir, requested.relativePath);
        const allowedRoot = `${path.resolve(outdir)}${path.sep}`;
        if (!requestedPath.startsWith(allowedRoot) || !existsSync(requestedPath) || !statSync(requestedPath).isFile()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const contentType = MIME_TYPES.get(path.extname(requested.relativePath).toLowerCase())
          ?? 'application/octet-stream';
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        const contents = readFileSync(requestedPath);
        res.setHeader('Content-Length', String(contents.byteLength));
        res.setHeader('Cache-Control', 'no-store');
        res.end(contents);
      });
    },
  };
}
