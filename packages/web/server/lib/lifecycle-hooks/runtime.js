import { z } from 'zod';
import { lifecycleHookEventPayloadSchema, sanitizeLifecycleHooks } from './config.js';

const MAX_CAPTURE_BYTES = 64 * 1024;
const MAX_RECENT_EXECUTIONS = 50;
const FORCE_KILL_GRACE_MS = 1000;
const ENV_KEYS = [
  'PATH',
  'Path',
  'PATHEXT',
  'SYSTEMROOT',
  'COMSPEC',
  'HOME',
  'USERPROFILE',
  'TMP',
  'TEMP',
  'SHELL',
  'LANG',
  'LC_ALL',
];

const hookTestPayloadSchema = z.object({
  sessionId: z.string().optional(),
  directory: z.string().nullable().optional(),
  message: z.unknown().optional(),
}).catch({});

const normalizeEnvironment = (env) => {
  const entries = [];
  for (const [key, value] of Object.entries(env ?? {})) {
    const parsed = z.string().safeParse(value);
    if (parsed.success) entries.push([key, parsed.data]);
  }
  return Object.fromEntries(entries);
};

const appendBounded = (current, chunk) => {
  if (current.length >= MAX_CAPTURE_BYTES) return { value: current, truncated: true };
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
  const remaining = MAX_CAPTURE_BYTES - current.length;
  return {
    value: Buffer.concat([current, buffer.subarray(0, remaining)]),
    truncated: buffer.length > remaining,
  };
};

const safeErrorMessage = (error) => error instanceof Error ? error.message : String(error);

const buildHookEnvironment = (baseEnv, hook, payload) => {
  const hookEnv = {};
  for (const key of ENV_KEYS) {
    if (baseEnv[key]) hookEnv[key] = baseEnv[key];
  }
  hookEnv.IVALDI_HOOK_EVENT = payload.event;
  hookEnv.IVALDI_HOOK_ID = hook.id;
  const sessionId = payload.sessionId ?? '';
  if (sessionId) hookEnv.IVALDI_SESSION_ID = sessionId;
  return hookEnv;
};

const safeKill = (child, signal) => {
  try {
    return child.kill(signal);
  } catch {
    return false;
  }
};

const runCommandHook = ({ launchProcess, env, hook, payload, now = Date.now }) => new Promise((resolve) => {
  const [executable, ...args] = hook.command;
  const startedAt = now();
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let settled = false;
  let timedOut = false;
  let timeout = null;
  let forceKillTimeout = null;
  let execution = null;

  const finish = (result) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (forceKillTimeout) clearTimeout(forceKillTimeout);
    const completed = {
      hookId: hook.id,
      event: hook.event,
      startedAt,
      durationMs: Math.max(0, now() - startedAt),
      stdout: stdout.toString('utf8'),
      stderr: stderr.toString('utf8'),
      stdoutTruncated,
      stderrTruncated,
      ...result,
    };
    if (execution) completed.execution = execution;
    resolve(completed);
  };

  let child;
  try {
    const launched = launchProcess({
      executable,
      args,
      directory: payload.directory ?? null,
      subject: 'hook',
      mode: 'full-access',
      sessionId: payload.sessionId ?? null,
      options: {
        env: buildHookEnvironment(env, hook, payload),
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    });
    child = launched?.child;
    if (!child) {
      throw new Error('Execution boundary returned an invalid child process');
    }
    execution = {
      correlationId: launched.execution?.correlationId ?? null,
      subject: launched.execution?.subject ?? 'hook',
      mode: launched.execution?.mode ?? 'full-access',
      policyHash: launched.execution?.policyHash ?? launched.policy?.hash ?? null,
      backend: launched.backend ?? 'unknown',
    };
  } catch (error) {
    resolve({
      hookId: hook.id,
      event: hook.event,
      ok: false,
      kind: 'spawn',
      error: safeErrorMessage(error),
      startedAt,
      durationMs: Math.max(0, now() - startedAt),
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
    });
    return;
  }

  timeout = setTimeout(() => {
    timedOut = true;
    safeKill(child, 'SIGTERM');
    forceKillTimeout = setTimeout(() => {
      safeKill(child, 'SIGKILL');
      finish({
        ok: false,
        kind: 'timeout',
        error: `Hook exceeded ${hook.timeoutMs} ms`,
        code: null,
        signal: 'SIGKILL',
      });
    }, FORCE_KILL_GRACE_MS);
    forceKillTimeout.unref?.();
  }, hook.timeoutMs);
  timeout.unref?.();

  child.stdout?.on('data', (chunk) => {
    const appended = appendBounded(stdout, chunk);
    stdout = appended.value;
    stdoutTruncated ||= appended.truncated;
  });
  child.stderr?.on('data', (chunk) => {
    const appended = appendBounded(stderr, chunk);
    stderr = appended.value;
    stderrTruncated ||= appended.truncated;
  });
  child.once('error', (error) => finish({ ok: false, kind: 'spawn', error: safeErrorMessage(error) }));
  child.once('close', (code, signal) => {
    if (timedOut) {
      finish({ ok: false, kind: 'timeout', error: `Hook exceeded ${hook.timeoutMs} ms`, code, signal });
      return;
    }
    if (code === 0) {
      finish({ ok: true, code, signal });
      return;
    }
    finish({ ok: false, kind: 'exit', error: `Hook exited with code ${code ?? 'unknown'}`, code, signal });
  });

  child.stdin?.once('error', (error) => {
    safeKill(child, 'SIGKILL');
    finish({ ok: false, kind: 'stdin', error: safeErrorMessage(error) });
  });
  try {
    child.stdin?.end(JSON.stringify(payload));
  } catch (error) {
    safeKill(child, 'SIGKILL');
    finish({ ok: false, kind: 'stdin', error: safeErrorMessage(error) });
  }
});

export const createLifecycleHookRuntime = (dependencies) => {
  const {
    launchProcess,
    env = process.env,
    logger = console,
    now = Date.now,
  } = dependencies;
  if (!launchProcess) {
    throw new TypeError('Lifecycle hook runtime requires the execution-boundary launcher');
  }
  const hookEnvironment = normalizeEnvironment(env);
  let hooks = [];
  let recentExecutions = [];
  let configurationReady = false;
  let configurationError = 'Lifecycle hook configuration has not been loaded';
  let passiveHooksEnabled = false;

  const snapshotHooks = () => hooks.map((hook) => ({ ...hook, command: [...hook.command] }));

  const getConfigurationStatus = () => ({
    ready: configurationReady,
    error: configurationError,
  });

  const markConfigurationUnavailable = (error) => {
    configurationReady = false;
    configurationError = safeErrorMessage(error) || 'Lifecycle hook configuration is unavailable';
    passiveHooksEnabled = false;
    return getConfigurationStatus();
  };

  const replaceHooks = (value) => {
    hooks = sanitizeLifecycleHooks(value) ?? [];
    passiveHooksEnabled = hooks.some((hook) => hook.enabled && hook.event !== 'UserPromptSubmit');
    configurationReady = true;
    configurationError = null;
    return snapshotHooks();
  };

  const hasHooksFor = (event) => hooks.some((hook) => hook.enabled && hook.event === event);
  const hasPassiveHooks = () => passiveHooksEnabled;

  const recordExecution = (payload, hook, result, source) => {
    recentExecutions = [{
      ...result,
      hookId: hook.id,
      event: hook.event,
      source,
      sessionId: payload.sessionId ?? null,
      directory: payload.directory ?? null,
    }, ...recentExecutions].slice(0, MAX_RECENT_EXECUTIONS);
  };

  const runHook = async (hook, payload, source = 'event') => {
    const result = await runCommandHook({ launchProcess, env: hookEnvironment, hook, payload, now });
    recordExecution(payload, hook, result, source);
    return result;
  };

  const execute = async (payload) => {
    if (!configurationReady) {
      return {
        ok: false,
        status: 500,
        code: 'LIFECYCLE_HOOK_CONFIG_UNAVAILABLE',
        error: 'Lifecycle hook configuration is unavailable',
        results: [],
      };
    }

    const parsedPayload = lifecycleHookEventPayloadSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return {
        ok: false,
        status: 400,
        code: 'LIFECYCLE_HOOK_EVENT_UNSUPPORTED',
        error: 'Unsupported lifecycle hook event',
        results: [],
      };
    }
    const eventPayload = parsedPayload.data;
    const matching = hooks.filter((hook) => hook.enabled && hook.event === eventPayload.event);
    const results = [];
    for (const hook of matching) {
      const result = await runHook(hook, eventPayload);
      results.push(result);
      if (result.ok) continue;
      if (hook.failureMode === 'block') {
        return {
          ok: false,
          status: 409,
          code: 'LIFECYCLE_HOOK_BLOCKED',
          hookId: hook.id,
          error: `Lifecycle hook "${hook.id}" blocked the prompt: ${result.error}`,
          results,
        };
      }
      logger.warn?.(`[lifecycle-hooks] ${hook.id} failed for ${eventPayload.event}: ${result.error}`);
    }
    return { ok: true, status: 200, results };
  };

  const dispatch = (payload) => {
    if (!hasHooksFor(payload?.event)) return false;
    void execute(payload).then((result) => {
      if (result.ok) return;
      logger.warn?.(`[lifecycle-hooks] Passive event evaluation failed: ${result.code} ${result.error}`);
    }).catch((error) => {
      logger.warn?.(`[lifecycle-hooks] Passive event evaluation threw: ${safeErrorMessage(error)}`);
    });
    return true;
  };

  const testHook = async (hook, payload = {}) => {
    const testPayloadInput = hookTestPayloadSchema.parse(payload);
    const testPayload = {
      event: hook.event,
      sessionId: testPayloadInput.sessionId ?? 'lifecycle-hook-test',
      directory: testPayloadInput.directory ?? null,
    };
    if (hook.event === 'UserPromptSubmit') {
      testPayload.message = testPayloadInput.message ?? { parts: [] };
    } else if (hook.event === 'ChatStart' || hook.event === 'ChatEnd') {
      testPayload.session = { id: testPayload.sessionId, title: 'Lifecycle hook test' };
    } else if (hook.event === 'BeforeToolCall' || hook.event === 'AfterToolCall' || hook.event === 'ToolCallFailed') {
      testPayload.tool = { callID: 'call_test', name: 'test-tool', status: 'test' };
    } else if (hook.event === 'PermissionRequest' || hook.event === 'PermissionDenied') {
      testPayload.request = { id: 'permission_test', action: 'test' };
    } else if (hook.event === 'BeforeAgentSpawn' || hook.event === 'AfterAgentReturn') {
      testPayload.agent = { callID: 'call_test', tool: 'task', status: 'test' };
    } else if (hook.event === 'TaskCreated' || hook.event === 'TaskCompleted') {
      testPayload.task = { id: 'task_test', status: 'test' };
    } else if (hook.event === 'WorktreeCreate' || hook.event === 'WorktreeRemove') {
      testPayload.worktree = { path: 'C:/project/.worktrees/test', status: 'test' };
    } else if (hook.event === 'BeforeCompact') {
      testPayload.compaction = { messageID: 'message_test', reason: 'manual', timestamp: now() };
    } else if (hook.event === 'Notification') {
      testPayload.notification = { title: 'Lifecycle hook test', body: 'Test notification' };
    }
    return runHook(hook, testPayload, 'test');
  };

  const getRecentExecutions = () => recentExecutions.map((entry) => ({ ...entry }));

  return {
    dispatch,
    execute,
    getConfigurationStatus,
    getRecentExecutions,
    hasHooksFor,
    hasPassiveHooks,
    markConfigurationUnavailable,
    replaceHooks,
    snapshotHooks,
    testHook,
  };
};
