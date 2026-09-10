import { describe, expect, it, vi } from 'vitest';
import { createPermissionAutoAcceptRuntime } from './runtime.js';

const createRuntime = ({ stored, fetchImpl, retryDelaysMs = [0] } = {}) => {
  let settings = stored ?? { permissionAutoAccept: { sessions: {} } };
  let eventHandler;
  let statusHandler;
  const runtime = createPermissionAutoAcceptRuntime({
    globalEventHub: {
      subscribeEvent(handler) { eventHandler = handler; return () => {}; },
      subscribeStatus(handler) { statusHandler = handler; return () => {}; },
    },
    buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    readSettingsFromDiskMigrated: async () => settings,
    persistSettings: async (changes) => { settings = { ...settings, ...changes }; },
    fetchImpl: fetchImpl ?? vi.fn(async () => new Response('[]')),
    retryDelaysMs,
  });
  runtime.start();
  return {
    runtime,
    getSettings: () => settings,
    emit: (payload, directory = '/project') => eventHandler({ payload, directory }),
    connect: () => statusHandler({ type: 'connect' }),
  };
};

const createRuntimeWithCapabilities = ({ capabilities, ...options } = {}) => {
  let settings = options.stored ?? { permissionAutoAccept: { sessions: {} } };
  const runtime = createPermissionAutoAcceptRuntime({
    globalEventHub: {
      subscribeEvent() { return () => {}; },
      subscribeStatus() { return () => {}; },
    },
    buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    readSettingsFromDiskMigrated: async () => settings,
    persistSettings: async (changes) => { settings = { ...settings, ...changes }; },
    fetchImpl: options.fetchImpl ?? vi.fn(async () => new Response('[]')),
    retryDelaysMs: options.retryDelaysMs ?? [0],
    getModeCapabilities: async () => capabilities,
    broadcastGlobalUiEvent: options.broadcastGlobalUiEvent,
  });
  return { runtime, getSettings: () => settings };
};

const flush = async () => {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
};

describe('permission auto-accept runtime', () => {
  it('migrates legacy boolean policies to permission modes without changing behavior', async () => {
    const { runtime } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { allow: true, ask: false }, revision: 7 } },
    });

    await expect(runtime.load()).resolves.toEqual({
      sessions: { allow: true, ask: false },
      revision: 7,
    });
    await expect(runtime.modeSnapshot()).resolves.toMatchObject({
      modes: { allow: 'full-access', ask: 'manual' },
      revision: 7,
    });
  });

  it('loads a removed legacy mode as Manual from its mirrored boolean', async () => {
    const { runtime } = createRuntime({
      stored: {
        permissionAutoAccept: {
          modes: { root: 'sandbox' },
          sessions: { root: false },
          revision: 8,
        },
      },
    });

    await runtime.load();
    await expect(runtime.modeSnapshot()).resolves.toMatchObject({
      modes: { root: 'manual' },
      sessions: { root: false },
      revision: 8,
    });
  });

  it('persists explicit permission modes and mirrors legacy booleans', async () => {
    const { runtime, getSettings } = createRuntimeWithCapabilities({
      capabilities: {
        supportedModes: ['manual', 'full-access'],
      },
    });

    await runtime.setSessionMode('root', 'full-access', '/project');

    expect(getSettings().permissionAutoAccept).toEqual({
      modes: { root: 'full-access' },
      sessions: { root: true },
      revision: 1,
    });
    await expect(runtime.getSessionMode('root', '/project')).resolves.toBe('full-access');
    await expect(runtime.isSessionAutoAccepting('root', '/project')).resolves.toBe(true);
  });

  it('Auto approves routine actions, asks for protected actions, and audits both decisions', async () => {
    const audits = [];
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/permission') return Response.json([]);
      if (path.endsWith('/reply') && init.method === 'POST') return Response.json({});
      return Response.json({ id: 'root' });
    });
    const { runtime } = createRuntimeWithCapabilities({
      capabilities: {
        supportedModes: ['manual', 'auto', 'full-access'],
      },
      fetchImpl,
      broadcastGlobalUiEvent: (event) => audits.push(event),
    });

    await runtime.setSessionMode('root', 'auto', '/project');
    await expect(runtime.processPermission({
      id: 'routine',
      sessionID: 'root',
      permission: 'bash',
      patterns: ['git status --short'],
    }, '/project')).resolves.toBe(true);
    await expect(runtime.processPermission({
      id: 'protected',
      sessionID: 'root',
      permission: 'bash',
      patterns: ['git push origin main'],
    }, '/project')).resolves.toBe(false);

    expect(fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/permission/routine/reply')).toBe(true);
    expect(fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/permission/protected/reply')).toBe(false);
    expect(audits.filter((event) => event.type === 'openchamber:permission-auto-decision')).toEqual([
      expect.objectContaining({
        type: 'openchamber:permission-auto-decision',
        properties: expect.objectContaining({
          permissionID: 'routine',
          effect: 'allow',
          reasonCode: 'auto.allow.git-read',
        }),
      }),
      expect.objectContaining({
        type: 'openchamber:permission-auto-decision',
        properties: expect.objectContaining({
          permissionID: 'protected',
          effect: 'ask',
          reasonCode: 'auto.ask.protected-git',
        }),
      }),
    ]);
    await expect(runtime.getSessionMode('root', '/project')).resolves.toBe('auto');
  });

  it('fails closed when Auto cannot classify the permission', async () => {
    const { runtime } = createRuntimeWithCapabilities({
      capabilities: { supportedModes: ['manual', 'auto', 'full-access'] },
    });
    await runtime.setSessionMode('root', 'auto', '/project');
    await expect(runtime.shouldAutoAcceptPermission({
      id: 'unknown',
      sessionID: 'root',
      permission: 'custom_tool',
      patterns: ['do something'],
    }, '/project')).resolves.toBe(false);
  });

  it('inherits the nearest explicit permission mode for subagents', async () => {
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { modes: { root: 'full-access', child: 'manual' } } },
    });
    emit({ type: 'session.created', properties: { info: { id: 'child', parentID: 'root' } } });
    emit({ type: 'session.created', properties: { info: { id: 'grandchild', parentID: 'child' } } });

    await expect(runtime.getSessionMode('grandchild', '/project')).resolves.toBe('manual');
    await runtime.setSessionMode('child', 'full-access', '/project');
    await expect(runtime.getSessionMode('grandchild', '/project')).resolves.toBe('full-access');
  });

  it('persists explicit session policies across runtime restarts', async () => {
    const first = createRuntime();
    await first.runtime.setSessionPolicy('root', true);

    const second = createRuntime({ stored: first.getSettings() });
    await expect(second.runtime.load()).resolves.toEqual({
      sessions: { root: true },
      revision: 1,
    });
  });

  it('increments the authoritative policy revision', async () => {
    const { runtime, getSettings } = createRuntime();

    await expect(runtime.setSessionPolicy('root', true)).resolves.toMatchObject({ revision: 1 });
    await expect(runtime.setSessionPolicy('child', false)).resolves.toMatchObject({ revision: 2 });
    expect(getSettings().permissionAutoAccept.revision).toBe(2);
  });

  it('returns the authoritative mode map after a mode mutation', async () => {
    const { runtime } = createRuntime();

    await expect(runtime.setSessionMode('root', 'full-access')).resolves.toMatchObject({
      modes: { root: 'full-access' },
      sessions: { root: true },
      revision: 1,
    });
    await expect(runtime.setSessionMode('child', 'manual')).resolves.toMatchObject({
      modes: { root: 'full-access', child: 'manual' },
      sessions: { root: true, child: false },
      revision: 2,
    });
  });

  it('uses nearest explicit ancestor policy for subagents', async () => {
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true, child: false } } },
    });
    emit({ type: 'session.created', properties: { info: { id: 'child', parentID: 'root' } } });
    emit({ type: 'session.created', properties: { info: { id: 'grandchild', parentID: 'child' } } });
    await expect(runtime.isSessionAutoAccepting('grandchild', '/project')).resolves.toBe(false);
    await runtime.setSessionPolicy('child', true);
    await expect(runtime.isSessionAutoAccepting('grandchild', '/project')).resolves.toBe(true);
  });

  it('fetches missing subagent lineage before replying', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/permission') return new Response('[]');
      if (path === '/session/child') return Response.json({ id: 'child', parentID: 'root', directory: '/project' });
      if (init.method === 'POST') return Response.json({});
      return new Response('', { status: 404 });
    });
    const { runtime } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true } } },
      fetchImpl,
    });
    await expect(runtime.processPermission({ id: 'perm', sessionID: 'child' }, '/project')).resolves.toBe(true);
    expect(fetchImpl.mock.calls.some(([url, init]) => new URL(url).pathname === '/permission/perm/reply' && init.method === 'POST')).toBe(true);
  });

  it('retries a transient reply failure and deduplicates concurrent events', async () => {
    let replyAttempts = 0;
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/permission') return new Response('[]');
      if (path === '/permission/perm/reply' && init.method === 'POST') {
        replyAttempts += 1;
        return replyAttempts === 1 ? new Response('', { status: 503 }) : Response.json({});
      }
      return Response.json({ id: 'root' });
    });
    const { runtime } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true } } },
      fetchImpl,
      retryDelaysMs: [0, 0],
    });
    const permission = { id: 'perm', sessionID: 'root' };
    const first = runtime.processPermission(permission, '/project');
    const second = runtime.processPermission(permission, '/project');
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(replyAttempts).toBe(2);
  });

  it('reconciles pending permissions after reconnect', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/permission') return Response.json([{ id: 'pending', sessionID: 'root' }]);
      if (path === '/permission/pending/reply' && init.method === 'POST') return Response.json({});
      return Response.json({ id: 'root' });
    });
    const { connect } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true } } },
      fetchImpl,
    });
    connect();
    await flush();
    expect(fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/permission/pending/reply')).toBe(true);
  });

  it('accepts existing pending permissions when a session policy is enabled', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const parsed = new URL(url);
      const path = parsed.pathname;
      if (path === '/permission') {
        return parsed.searchParams.get('directory') === '/project'
          ? Response.json([
            { id: 'root-pending', sessionID: 'root' },
            { id: 'other-pending', sessionID: 'other' },
          ])
          : Response.json([]);
      }
      if (path === '/permission/root-pending/reply' && init.method === 'POST') return Response.json({});
      if (path === '/session/other') return Response.json({ id: 'other' });
      return new Response('', { status: 404 });
    });
    const { runtime } = createRuntime({ fetchImpl });

    await runtime.setSessionPolicy('root', true, '/project');

    const replyPaths = fetchImpl.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([url]) => new URL(url).pathname);
    expect(replyPaths).toEqual(['/permission/root-pending/reply']);
    expect(fetchImpl.mock.calls.some(([url]) => new URL(url).searchParams.get('directory') === '/project')).toBe(true);
    expect(await runtime.load()).toEqual({ sessions: { root: true }, revision: 1 });
  });
});
