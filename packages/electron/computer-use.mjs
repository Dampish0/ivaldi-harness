import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const REQUEST_TIMEOUT_MS = 30_000;

const asNonEmptyString = (value) => {
  const candidate = String(value ?? '').trim();
  return candidate || null;
};

const resolveComputerUseExecutable = ({ packaged, resourcesPath, moduleDirectory }) => (
  packaged
    ? path.join(resourcesPath, 'computer-use', 'Ivaldi.ComputerUse.exe')
    : path.join(moduleDirectory, 'native', 'computer-use', 'publish', 'Ivaldi.ComputerUse.exe')
);

export const createWindowsComputerUse = ({
  packaged,
  resourcesPath,
  moduleDirectory,
  protectedProcessId,
  onStatus = () => {},
  spawnProcess = spawn,
}) => {
  const executable = resolveComputerUseExecutable({ packaged, resourcesPath, moduleDirectory });
  let child = null;
  let sequence = 0;
  let leaseOwner = null;
  let target = null;
  let queue = Promise.resolve();
  const pending = new Map();

  const status = () => ({
    supported: process.platform === 'win32',
    available: process.platform === 'win32' && fs.existsSync(executable),
    active: Boolean(leaseOwner && target),
    target,
  });

  const publishStatus = () => onStatus(status());

  const rejectPending = (message) => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error(message));
    }
    pending.clear();
  };

  const ensureHelper = () => {
    if (child && !child.killed) return child;
    if (process.platform !== 'win32') throw new Error('Computer Use is only supported on Windows');
    if (!fs.existsSync(executable)) {
      throw new Error('Computer Use helper is missing. Run bun run build:computer-use from packages/electron.');
    }

    child = spawnProcess(executable, ['--protected-pid', String(protectedProcessId)], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let response = null;
      try {
        response = JSON.parse(line);
      } catch {
        return;
      }
      const request = pending.get(response?.id);
      if (!request) return;
      pending.delete(response.id);
      clearTimeout(request.timeout);
      if (response.ok === true) {
        request.resolve(response.data ?? {});
        return;
      }
      request.reject(new Error(asNonEmptyString(response?.error) || 'Computer Use helper failed'));
    });
    child.stderr.on('data', (chunk) => {
      const message = String(chunk || '').trim();
      if (message) console.warn('[computer-use]', message);
    });
    child.once('exit', () => {
      child = null;
      leaseOwner = null;
      target = null;
      rejectPending('Computer Use helper exited');
      publishStatus();
    });
    child.once('error', (error) => rejectPending(error.message));
    return child;
  };

  const request = (action, parameters = {}, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Computer Use action was cancelled'));
      return;
    }
    const helper = ensureHelper();
    const id = String(++sequence);
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Computer Use action timed out: ${action}`));
    }, REQUEST_TIMEOUT_MS);
    const abort = () => {
      pending.delete(id);
      clearTimeout(timeout);
      reject(new Error('Computer Use action was cancelled'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, {
      timeout,
      resolve: (value) => {
        signal?.removeEventListener('abort', abort);
        resolve(value);
      },
      reject: (error) => {
        signal?.removeEventListener('abort', abort);
        reject(error);
      },
    });
    helper.stdin.write(`${JSON.stringify({ id, action, parameters })}\n`);
  });

  const perform = async (action, parameters, options) => {
    const ownerId = asNonEmptyString(options.ownerId) || 'managed-session';
    if (action !== 'window.list' && action !== 'window.select' && action !== 'computer.stop') {
      if (!leaseOwner) throw new Error('Select a window before using Computer Use');
      if (leaseOwner !== ownerId) throw new Error('Another Ivaldi session currently controls the selected window');
    }
    if (action === 'window.select' && leaseOwner && leaseOwner !== ownerId) {
      throw new Error('Another Ivaldi session currently controls the selected window');
    }
    if (action === 'computer.stop') {
      if (leaseOwner && leaseOwner !== ownerId) throw new Error('Another Ivaldi session owns the Computer Use lease');
      await request(action, parameters, options.signal);
      leaseOwner = null;
      target = null;
      publishStatus();
      return { data: { stopped: true }, attachments: [] };
    }

    const result = await request(action, parameters, options.signal);
    if (action === 'window.select') leaseOwner = ownerId;
    if (result.window?.title) target = result.window.title;
    if (leaseOwner) publishStatus();

    const screenshot = result.screenshot;
    if (!screenshot?.base64 || !screenshot?.mime) return { data: result, attachments: [] };
    const data = { ...result, screenshot: { ...screenshot } };
    delete data.screenshot.base64;
    return {
      data,
      attachments: [{
        type: 'file',
        mime: screenshot.mime,
        url: `data:${screenshot.mime};base64,${screenshot.base64}`,
        filename: `ivaldi-computer-${result.snapshotId || 'snapshot'}.png`,
      }],
    };
  };

  const execute = (action, parameters = {}, options = {}) => {
    const next = queue.then(() => perform(action, parameters, options));
    queue = next.catch(() => {});
    return next;
  };

  const stop = () => {
    leaseOwner = null;
    target = null;
    publishStatus();
    if (!child || child.killed) return;
    rejectPending('Computer Use was stopped');
    child.kill();
    child = null;
  };

  const shutdown = () => {
    leaseOwner = null;
    target = null;
    rejectPending('Ivaldi is shutting down');
    if (child && !child.killed) child.kill();
    child = null;
  };

  publishStatus();
  return { execute, status, stop, shutdown };
};
