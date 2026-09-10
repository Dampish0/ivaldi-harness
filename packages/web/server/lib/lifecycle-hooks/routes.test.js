import { describe, expect, it, vi } from 'vitest';

import { registerLifecycleHookRoutes } from './routes.js';

const createHarness = ({ runtimeOverrides = {}, persistSettings = vi.fn(async () => ({})) } = {}) => {
  const handlers = new Map();
  const app = {
    get: (path, handler) => handlers.set(`GET ${path}`, handler),
    put: (path, handler) => handlers.set(`PUT ${path}`, handler),
    post: (path, handler) => handlers.set(`POST ${path}`, handler),
  };
  let hooks = [];
  const runtime = {
    getConfigurationStatus: vi.fn(() => ({ ready: true, error: null })),
    snapshotHooks: vi.fn(() => hooks.map((hook) => ({ ...hook, command: [...hook.command] }))),
    getRecentExecutions: vi.fn(() => []),
    replaceHooks: vi.fn((next) => {
      hooks = next.map((hook) => ({ ...hook, command: [...hook.command] }));
      return hooks;
    }),
    testHook: vi.fn(async (hook) => ({ hookId: hook.id, event: hook.event, ok: true, stdout: 'ok', stderr: '' })),
    ...runtimeOverrides,
  };
  registerLifecycleHookRoutes(app, { lifecycleHookRuntime: runtime, persistSettings });

  const request = async (method, path, body) => {
    const handler = handlers.get(`${method} ${path}`);
    if (!handler) throw new Error(`Missing handler for ${method} ${path}`);
    let statusCode = 200;
    let payload;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(value) {
        payload = value;
        return this;
      },
    };
    await handler({ body }, res);
    return { statusCode, payload };
  };

  return { persistSettings, request, runtime };
};

describe('lifecycle hook routes', () => {
  it('returns 503 instead of presenting an empty hook list when configuration is unavailable', async () => {
    const { request } = createHarness({
      runtimeOverrides: {
        getConfigurationStatus: vi.fn(() => ({ ready: false, error: 'settings read failed' })),
      },
    });

    const response = await request('GET', '/api/lifecycle-hooks');

    expect(response.statusCode).toBe(503);
    expect(response.payload).toEqual({
      success: false,
      code: 'LIFECYCLE_HOOK_CONFIG_UNAVAILABLE',
      error: 'Lifecycle hook configuration is unavailable',
    });
  });

  it('returns hook configuration, supported values, and recent executions', async () => {
    const recent = [{ hookId: 'a', ok: true }];
    const { request, runtime } = createHarness({
      runtimeOverrides: { getRecentExecutions: vi.fn(() => recent) },
    });
    runtime.replaceHooks([{ id: 'a', event: 'UserPromptSubmit', command: ['node'], enabled: true, timeoutMs: 1000, failureMode: 'warn' }]);

    const response = await request('GET', '/api/lifecycle-hooks');

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      hooks: [{ id: 'a', event: 'UserPromptSubmit' }],
      recentExecutions: recent,
      supportedEvents: [
        'UserPromptSubmit',
        'ChatStart',
        'BeforeToolCall',
        'AfterToolCall',
        'ToolCallFailed',
        'PermissionRequest',
        'PermissionDenied',
        'BeforeAgentSpawn',
        'AfterAgentReturn',
        'TaskCreated',
        'TaskCompleted',
        'WorktreeCreate',
        'WorktreeRemove',
        'BeforeCompact',
        'ChatEnd',
        'Notification',
      ],
      blockingEvents: ['UserPromptSubmit'],
      failureModes: ['warn', 'block'],
    });
  });

  it('rejects invalid configuration without persisting or replacing active hooks', async () => {
    const { persistSettings, request, runtime } = createHarness();

    const response = await request('PUT', '/api/lifecycle-hooks', {
      hooks: [{ id: 'bad id', event: 'UserPromptSubmit', command: ['node'] }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.payload).toMatchObject({
      success: false,
      code: 'LIFECYCLE_HOOK_CONFIG_INVALID',
      issues: [{ index: 0, code: 'INVALID_ID' }],
    });
    expect(persistSettings).not.toHaveBeenCalled();
    expect(runtime.replaceHooks).not.toHaveBeenCalled();
  });

  it('persists ordered hooks before replacing the active runtime snapshot', async () => {
    const operationOrder = [];
    const persistSettings = vi.fn(async () => {
      operationOrder.push('persist');
      return {};
    });
    const { request, runtime } = createHarness({ persistSettings });
    const replaceHooks = runtime.replaceHooks;
    runtime.replaceHooks = vi.fn((next) => {
      operationOrder.push('replace');
      return replaceHooks(next);
    });
    const hooks = [
      { id: 'first', event: 'UserPromptSubmit', command: ['node', 'first.mjs'], failureMode: 'block', timeoutMs: 500 },
      { id: 'second', event: 'UserPromptSubmit', command: ['node', 'second.mjs'], enabled: false },
    ];

    const response = await request('PUT', '/api/lifecycle-hooks', { hooks });

    expect(response.statusCode).toBe(200);
    expect(persistSettings).toHaveBeenCalledWith({
      lifecycleHooks: [
        { id: 'first', event: 'UserPromptSubmit', command: ['node', 'first.mjs'], enabled: true, timeoutMs: 500, failureMode: 'block' },
        { id: 'second', event: 'UserPromptSubmit', command: ['node', 'second.mjs'], enabled: false, timeoutMs: 10_000, failureMode: 'warn' },
      ],
    });
    expect(operationOrder).toEqual(['persist', 'replace']);
    expect(response.payload.hooks.map((hook) => hook.id)).toEqual(['first', 'second']);
  });

  it('tests a validated hook without requiring it to be enabled', async () => {
    const { request, runtime } = createHarness();

    const response = await request('POST', '/api/lifecycle-hooks/test', {
      hook: { id: 'test-me', event: 'UserPromptSubmit', command: ['node'], enabled: false },
      payload: { sessionId: 'manual-test' },
    });

    expect(response.statusCode).toBe(200);
    expect(runtime.testHook).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test-me', enabled: false }),
      { sessionId: 'manual-test' },
    );
    expect(response.payload).toMatchObject({ success: true, result: { hookId: 'test-me', ok: true } });
  });
});
