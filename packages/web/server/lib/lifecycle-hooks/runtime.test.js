import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLifecycleHookRuntime } from './runtime.js';

const temporaryDirectories = [];

const createDirectLaunchProcess = (spawnImpl = spawn) => (request) => ({
  child: spawnImpl(request.executable, request.args, request.options),
  backend: 'direct',
  policy: { hash: 'test-policy-hash' },
  execution: {
    correlationId: 'test-execution',
    subject: request.subject,
    mode: request.mode,
    policyHash: 'test-policy-hash',
  },
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const createFixture = async ({ hooks, env = process.env, logger = console } = {}) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ivaldi-lifecycle-hooks-'));
  temporaryDirectories.push(dataDir);
  const runtime = createLifecycleHookRuntime({
    launchProcess: createDirectLaunchProcess(),
    env,
    logger,
  });
  runtime.replaceHooks(hooks ?? []);
  return {
    dataDir,
    runtime,
    setHooks: (next) => runtime.replaceHooks(next),
  };
};

const writeScript = async (directory, source) => {
  const scriptPath = path.join(directory, `hook-${Math.random().toString(16).slice(2)}.mjs`);
  await fs.writeFile(scriptPath, source, 'utf8');
  return scriptPath;
};

describe('lifecycle hook runtime', () => {
  it('fails closed until lifecycle hook configuration is loaded', async () => {
    const runtime = createLifecycleHookRuntime({ launchProcess: createDirectLaunchProcess() });

    expect(runtime.getConfigurationStatus()).toEqual({
      ready: false,
      error: 'Lifecycle hook configuration has not been loaded',
    });
    expect(await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} })).toEqual({
      ok: false,
      status: 500,
      code: 'LIFECYCLE_HOOK_CONFIG_UNAVAILABLE',
      error: 'Lifecycle hook configuration is unavailable',
      results: [],
    });

    runtime.replaceHooks([]);
    expect(runtime.getConfigurationStatus()).toEqual({ ready: true, error: null });
    expect(await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} })).toEqual({
      ok: true,
      status: 200,
      results: [],
    });
  });

  it('returns to fail-closed state after a configuration load failure and recovers on replacement', async () => {
    const { runtime } = await createFixture();
    runtime.markConfigurationUnavailable(new Error('settings read failed'));

    expect(runtime.getConfigurationStatus()).toEqual({ ready: false, error: 'settings read failed' });
    expect(await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} })).toMatchObject({
      ok: false,
      status: 500,
      code: 'LIFECYCLE_HOOK_CONFIG_UNAVAILABLE',
    });

    runtime.replaceHooks([]);
    expect(runtime.getConfigurationStatus()).toEqual({ ready: true, error: null });
  });

  it('rejects unsupported lifecycle events', async () => {
    const { runtime } = await createFixture();
    expect(await runtime.execute({ event: 'ExternalEventReceived' })).toEqual({
      ok: false,
      status: 400,
      code: 'LIFECYCLE_HOOK_EVENT_UNSUPPORTED',
      error: 'Unsupported lifecycle hook event',
      results: [],
    });
  });

  it('uses cached hook state and updates it explicitly without settings reads on the prompt path', async () => {
    const { runtime, setHooks } = await createFixture();
    expect(runtime.hasHooksFor('UserPromptSubmit')).toBe(false);

    setHooks([{ id: 'enabled', event: 'UserPromptSubmit', command: [process.execPath, '-e', 'process.exit(0)'] }]);
    expect(runtime.hasHooksFor('UserPromptSubmit')).toBe(true);

    const result = await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} });
    expect(result).toMatchObject({ ok: true, status: 200 });

    setHooks([]);
    expect(runtime.hasHooksFor('UserPromptSubmit')).toBe(false);
    expect(await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} })).toEqual({
      ok: true,
      status: 200,
      results: [],
    });
  });

  it('runs a successful hook with JSON stdin and a minimal environment', async () => {
    const env = {
      PATH: process.env.PATH ?? '',
      USERPROFILE: process.env.USERPROFILE ?? '',
      SECRET_PROVIDER_TOKEN: 'must-not-leak',
    };
    const { dataDir, runtime, setHooks } = await createFixture({ env });
    const outputPath = path.join(dataDir, 'hook-output.json');
    const script = await writeScript(dataDir, `
      import fs from 'node:fs';
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => {
        fs.writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({
          payload: JSON.parse(input),
          event: process.env.IVALDI_HOOK_EVENT,
          hookId: process.env.IVALDI_HOOK_ID,
          sessionId: process.env.IVALDI_SESSION_ID,
          leakedSecret: process.env.SECRET_PROVIDER_TOKEN ?? null,
        }));
      });
    `);
    setHooks([{ id: 'capture', event: 'UserPromptSubmit', command: [process.execPath, script] }]);

    const result = await runtime.execute({
      event: 'UserPromptSubmit',
      sessionId: 'session-1',
      directory: 'C:/work/project',
      message: { parts: [{ type: 'text', text: 'hello' }] },
    });

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      ok: true,
      execution: {
        correlationId: 'test-execution',
        subject: 'hook',
        mode: 'full-access',
        policyHash: 'test-policy-hash',
        backend: 'direct',
      },
    });
    const captured = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(captured.payload.message.parts[0].text).toBe('hello');
    expect(captured.event).toBe('UserPromptSubmit');
    expect(captured.hookId).toBe('capture');
    expect(captured.sessionId).toBe('session-1');
    expect(captured.leakedSecret).toBe(null);
  });

  it('runs passive lifecycle events with their authoritative event payload', async () => {
    const { dataDir, runtime, setHooks } = await createFixture();
    const outputPath = path.join(dataDir, 'permission-request.json');
    const script = await writeScript(dataDir, `
      import fs from 'node:fs';
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => fs.writeFileSync(${JSON.stringify(outputPath)}, input));
    `);
    setHooks([{ id: 'permission-log', event: 'PermissionRequest', command: [process.execPath, script] }]);

    const result = await runtime.execute({
      event: 'PermissionRequest',
      sessionId: 'session-1',
      directory: 'C:/work/project',
      request: { id: 'perm_1', permission: 'bash' },
    });

    expect(result).toMatchObject({ ok: true, status: 200 });
    const captured = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    expect(captured).toEqual({
      event: 'PermissionRequest',
      sessionId: 'session-1',
      directory: 'C:/work/project',
      request: { id: 'perm_1', permission: 'bash' },
    });
    expect(runtime.getRecentExecutions()[0]).toMatchObject({
      hookId: 'permission-log',
      event: 'PermissionRequest',
      source: 'event',
      ok: true,
    });
  });

  it('dispatches configured passive events without awaiting them', async () => {
    const { dataDir, runtime, setHooks } = await createFixture();
    const outputPath = path.join(dataDir, 'notification.json');
    const script = await writeScript(dataDir, `
      import fs from 'node:fs';
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { input += chunk; });
      process.stdin.on('end', () => fs.writeFileSync(${JSON.stringify(outputPath)}, input));
    `);
    setHooks([{ id: 'notify', event: 'Notification', command: [process.execPath, script] }]);

    expect(runtime.dispatch({
      event: 'Notification',
      sessionId: 'session-1',
      directory: 'C:/work/project',
      notification: { title: 'Ready' },
    })).toBe(true);

    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      try {
        const captured = JSON.parse(await fs.readFile(outputPath, 'utf8'));
        expect(captured.notification).toEqual({ title: 'Ready' });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    throw new Error('dispatched lifecycle hook did not complete');
  });

  it('skips dispatch when no matching hook is enabled', async () => {
    const { runtime } = await createFixture();
    expect(runtime.dispatch({ event: 'Notification', notification: { title: 'Ready' } })).toBe(false);
  });

  it('tracks whether any passive event hook is enabled without parsing event payloads', async () => {
    const { runtime, setHooks } = await createFixture({
      hooks: [{ id: 'prompt', event: 'UserPromptSubmit', command: ['node'] }],
    });
    expect(runtime.hasPassiveHooks()).toBe(false);

    setHooks([
      { id: 'prompt', event: 'UserPromptSubmit', command: ['node'] },
      { id: 'tool', event: 'AfterToolCall', command: ['node'] },
    ]);
    expect(runtime.hasPassiveHooks()).toBe(true);

    runtime.markConfigurationUnavailable(new Error('settings unavailable'));
    expect(runtime.hasPassiveHooks()).toBe(false);

    setHooks([{ id: 'tool', event: 'AfterToolCall', command: ['node'], enabled: false }]);
    expect(runtime.hasPassiveHooks()).toBe(false);
  });

  it('logs warn failures and allows the prompt to continue', async () => {
    const logger = { warn: vi.fn() };
    const { dataDir, runtime, setHooks } = await createFixture({ logger });
    const script = await writeScript(dataDir, 'process.exit(7);');
    setHooks([{ id: 'warn-hook', event: 'UserPromptSubmit', command: [process.execPath, script], failureMode: 'warn' }]);

    const result = await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} });

    expect(result.ok).toBe(true);
    expect(result.results[0]).toMatchObject({ ok: false, kind: 'exit', code: 7 });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('blocks the prompt when a block hook fails', async () => {
    const { dataDir, runtime, setHooks } = await createFixture();
    const script = await writeScript(dataDir, 'process.stderr.write("nope"); process.exit(3);');
    setHooks([{ id: 'policy', event: 'UserPromptSubmit', command: [process.execPath, script], failureMode: 'block' }]);

    const result = await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(result).toMatchObject({ code: 'LIFECYCLE_HOOK_BLOCKED', hookId: 'policy' });
    expect(result.error).toContain('policy');
    expect(result.results[0]).toMatchObject({ ok: false, kind: 'exit', code: 3 });
  });

  it('times out a slow blocking hook', async () => {
    const { dataDir, runtime, setHooks } = await createFixture();
    const script = await writeScript(dataDir, 'setTimeout(() => process.exit(0), 5000);');
    setHooks([{
      id: 'slow',
      event: 'UserPromptSubmit',
      command: [process.execPath, script],
      timeoutMs: 100,
      failureMode: 'block',
    }]);

    const result = await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} });

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(result.results[0]).toMatchObject({ ok: false, kind: 'timeout' });
  });

  it('does not execute disabled hooks', async () => {
    const { runtime, setHooks } = await createFixture();
    setHooks([{ id: 'disabled', event: 'UserPromptSubmit', command: [process.execPath, '-e', 'process.exit(2)'], enabled: false, failureMode: 'block' }]);

    const result = await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} });

    expect(result).toEqual({ ok: true, status: 200, results: [] });
  });

  it('bounds captured output and marks truncation', async () => {
    const { runtime, setHooks } = await createFixture();
    setHooks([{
      id: 'noisy',
      event: 'UserPromptSubmit',
      command: [process.execPath, '-e', 'process.stdout.write("x".repeat(70000)); process.stderr.write("y".repeat(70000));'],
    }]);

    const result = await runtime.execute({ event: 'UserPromptSubmit', sessionId: 's1', message: {} });
    expect(result.results[0].stdout.length).toBe(64 * 1024);
    expect(result.results[0].stderr.length).toBe(64 * 1024);
    expect(result.results[0].stdoutTruncated).toBe(true);
    expect(result.results[0].stderrTruncated).toBe(true);
  });

  it('keeps a bounded recent execution history for event and test runs', async () => {
    const { runtime, setHooks } = await createFixture();
    setHooks([{ id: 'history', event: 'UserPromptSubmit', command: [process.execPath, '-e', 'process.stdout.write("ok")'] }]);

    await runtime.execute({ event: 'UserPromptSubmit', sessionId: 'event-session', directory: 'C:/repo', message: {} });
    const hook = runtime.snapshotHooks()[0];
    await runtime.testHook(hook, { sessionId: 'test-session' });

    expect(runtime.getRecentExecutions()).toMatchObject([
      { hookId: 'history', source: 'test', sessionId: 'test-session', ok: true },
      { hookId: 'history', source: 'event', sessionId: 'event-session', directory: 'C:/repo', ok: true },
    ]);
  });
});
