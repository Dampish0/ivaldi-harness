#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const useDetachedChildren = process.platform === 'darwin';
const webRoot = path.join(repoRoot, 'packages/web');

const quoteWindowsCommandArg = (value) => `"${String(value).replace(/"/g, '""')}"`;

function resolveWindowsCommand(command) {
  if (process.platform !== 'win32' || path.isAbsolute(command)) {
    return command;
  }

  const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    return command;
  }

  const candidates = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return candidates.find((entry) => /\.(exe|cmd|bat)$/i.test(entry)) || candidates[0] || command;
}

function run(label, command, args, env = {}, options = {}) {
  const resolvedCommand = resolveWindowsCommand(command);
  const isWindowsCommandScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand);
  const spawnCommand = isWindowsCommandScript ? (process.env.ComSpec || 'cmd.exe') : resolvedCommand;
  const spawnArgs = isWindowsCommandScript
    ? ['/d', '/s', '/c', ['call', quoteWindowsCommandArg(resolvedCommand), ...args.map(quoteWindowsCommandArg)].join(' ')]
    : args;

  return spawn(spawnCommand, spawnArgs, {
    cwd: options.cwd || repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    detached: useDetachedChildren,
    windowsVerbatimArguments: isWindowsCommandScript,
  }).on('error', (error) => {
    console.error(`[dev:web:hmr] Failed to start ${label}:`, error);
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const onExit = () => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve();
    }, timeoutMs);

    child.once('exit', onExit);
  });
}

function signalChild(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    if (useDetachedChildren && process.platform !== 'win32') {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
  }

  try {
    child.kill(signal);
  } catch {
  }
}

async function stopChildTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  signalChild(child, 'SIGINT');
  await waitForExit(child, 2500);

  if (child.exitCode === null && child.signalCode === null) {
    signalChild(child, 'SIGTERM');
    await waitForExit(child, 2500);
  }

  if (child.exitCode === null && child.signalCode === null) {
    signalChild(child, 'SIGKILL');
    await waitForExit(child, 1000);
  }
}

const uiPort = process.env.OPENCHAMBER_HMR_UI_PORT || '5180';
const backendPort = process.env.OPENCHAMBER_HMR_API_PORT || '3902';
const backendPortNumber = Number.parseInt(backendPort, 10);
const hmrHost = process.env.OPENCHAMBER_HMR_HOST || '127.0.0.1';
const cleanViteCache = process.env.OPENCHAMBER_HMR_CLEAN_CACHE === '1';
const fastHmr = process.env.OPENCHAMBER_FAST_HMR ?? '1';
const apiLivenessPollIntervalMs = 1_000;
const apiLivenessStartupTimeoutMs = 30_000;
const apiLivenessRecoveryTimeoutMs = 30_000;
const apiLivenessConnectTimeoutMs = 1_000;

function getLanAddresses() {
  const addresses = [];

  for (const networkAddresses of Object.values(os.networkInterfaces())) {
    for (const address of networkAddresses || []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      addresses.push(address.address);
    }
  }

  return addresses;
}

function clearViteCache() {
  const cacheDirs = [
    path.join(webRoot, 'node_modules/.vite'),
    path.join(webRoot, 'node_modules/.vite-temp'),
  ];

  for (const cacheDir of cacheDirs) {
    if (!existsSync(cacheDir)) continue;
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

if (cleanViteCache) {
  console.log('[dev:web:hmr] clearing Vite dependency cache and forcing re-optimization');
  clearViteCache();
}

const api = run(
  'api',
  'bun',
  ['x', 'nodemon', '--watch', 'server', '--ext', 'js', '--exec', `bun server/index.js --port ${backendPort}`],
  {
    OPENCHAMBER_PORT: backendPort,
    // Dev backends share the relay identity with the production instance; never
    // let them capture the machine's relay host on their own.
    OPENCHAMBER_RELAY_HOST: process.env.OPENCHAMBER_RELAY_HOST || 'off',
  },
  { cwd: webRoot },
);
const vite = run(
  'vite',
  'bun',
  [
    'x',
    'vite',
    ...(cleanViteCache ? ['--force'] : []),
    '--host',
    hmrHost,
    '--port',
    uiPort,
    '--strictPort',
  ],
  {
    OPENCHAMBER_PORT: backendPort,
    OPENCHAMBER_DISABLE_PWA_DEV: '1',
    OPENCHAMBER_FAST_HMR: fastHmr,
  },
  { cwd: webRoot },
);

console.log(`[dev:web:hmr] UI with HMR: http://127.0.0.1:${uiPort}`);
if (hmrHost === '0.0.0.0' || hmrHost === '::') {
  const lanAddresses = getLanAddresses();
  if (lanAddresses.length > 0) {
    for (const address of lanAddresses) {
      console.log(`[dev:web:hmr] LAN/mobile UI: http://${address}:${uiPort}`);
    }
  } else {
    console.log('[dev:web:hmr] LAN/mobile UI: no LAN IPv4 address found');
  }
}
console.log(`[dev:web:hmr] API: http://127.0.0.1:${backendPort}`);
console.log('[dev:web:hmr] IMPORTANT: open UI URL above for HMR; backend URL has no HMR');

let shuttingDown = false;
let apiLivenessTimer = null;
let apiLivenessCheckInFlight = false;
let apiListenerReadyOnce = false;
let apiListenerMissingSince = Date.now();

function isApiListenerAlive() {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host: '127.0.0.1', port: backendPortNumber });

    const finish = (alive) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(alive);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(apiLivenessConnectTimeoutMs, () => finish(false));
  });
}

async function pollApiLiveness() {
  if (shuttingDown || apiLivenessCheckInFlight) return;
  apiLivenessCheckInFlight = true;

  try {
    if (await isApiListenerAlive()) {
      apiListenerReadyOnce = true;
      apiListenerMissingSince = 0;
      return;
    }

    const now = Date.now();
    if (apiListenerMissingSince === 0) {
      apiListenerMissingSince = now;
      return;
    }

    const missingForMs = now - apiListenerMissingSince;
    const timeoutMs = apiListenerReadyOnce ? apiLivenessRecoveryTimeoutMs : apiLivenessStartupTimeoutMs;
    if (missingForMs < timeoutMs) return;

    const phase = apiListenerReadyOnce ? 'after previously accepting connections' : 'during startup';
    console.error(
      `[dev:web:hmr] API port ${backendPort} had no listener for ${Math.round(missingForMs / 1000)}s ${phase}. Shutting down the HMR stack instead of leaving a stale UI running.`,
    );
    void shutdown(1);
  } finally {
    apiLivenessCheckInFlight = false;
  }
}

function startApiLivenessWatchdog() {
  void pollApiLiveness();
  apiLivenessTimer = setInterval(() => {
    void pollApiLiveness();
  }, apiLivenessPollIntervalMs);
  apiLivenessTimer.unref?.();
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (apiLivenessTimer) {
    clearInterval(apiLivenessTimer);
    apiLivenessTimer = null;
  }
  await Promise.all([stopChildTree(api), stopChildTree(vite)]);
  process.exit(exitCode);
}

function onChildExit(label) {
  return (code, signal) => {
    if (shuttingDown) return;

    if (code !== 0 || signal) {
      console.error(`[dev:web:hmr] ${label} exited unexpectedly (code=${code ?? 'null'} signal=${signal ?? 'none'})`);
      const exitCode = Number.isInteger(code) ? code : 1;
      shutdown(exitCode).catch(() => process.exit(1));
      return;
    }

    shutdown(0).catch(() => process.exit(1));
  };
}

api.on('exit', onChildExit('api'));
vite.on('exit', onChildExit('vite'));
startApiLivenessWatchdog();

process.on('SIGINT', () => {
  shutdown(130).catch(() => process.exit(130));
});
process.on('SIGTERM', () => {
  shutdown(143).catch(() => process.exit(143));
});
process.on('SIGHUP', () => {
  shutdown(129).catch(() => process.exit(129));
});
