import { z } from 'zod';

import {
  PERMISSION_MODES,
  legacyAutoAcceptFromPermissionMode,
  normalizePermissionPolicy,
  permissionModeSchema,
  permissionModeFromLegacyAutoAccept,
} from './modes.js';
import { classifyAutoPermission } from './classifier.js';

const SETTINGS_KEY = 'permissionAutoAccept';
const RETRY_DELAYS_MS = [0, 250, 1000];
const REQUEST_TIMEOUT_MS = 5000;
const SESSION_CACHE_LIMIT = 10000;

const modeCapabilitiesInputSchema = z.object({
  supportedModes: z.array(z.json()).optional(),
  reason: z.string().trim().min(1).optional(),
}).passthrough();
const sessionPolicyInputSchema = z.object({
  sessionId: z.string().trim().min(1),
  enabled: z.boolean(),
  directory: z.string().optional(),
}).strict();
const sessionModeInputSchema = z.object({
  sessionId: z.string().trim().min(1),
  mode: permissionModeSchema,
  directory: z.string().optional(),
}).strict();
const sessionInfoSchema = z.object({
  id: z.string().min(1),
  parentID: z.string().min(1).nullable().optional(),
  directory: z.string().min(1).optional(),
}).passthrough();
const permissionRequestSchema = z.object({
  id: z.string().min(1),
  sessionID: z.string().min(1),
  permission: z.string().default('unknown'),
  patterns: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.json()).default({}),
  always: z.array(z.string()).default([]),
  tool: z.object({
    messageID: z.string(),
    callID: z.string(),
  }).optional(),
  directory: z.string().min(1).optional(),
}).passthrough();
const trackedEventPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.created'),
    properties: z.object({ info: sessionInfoSchema }).passthrough(),
  }).passthrough(),
  z.object({
    type: z.literal('session.updated'),
    properties: z.object({ info: sessionInfoSchema }).passthrough(),
  }).passthrough(),
  z.object({
    type: z.literal('permission.asked'),
    properties: permissionRequestSchema,
  }).passthrough(),
]);
const trackedEventEnvelopeSchema = z.object({
  directory: z.string().optional(),
  payload: z.union([
    trackedEventPayloadSchema,
    z.object({ payload: trackedEventPayloadSchema }).passthrough(),
  ]),
}).passthrough();
const pendingPermissionPayloadSchema = z.union([
  z.array(permissionRequestSchema),
  z.object({ data: z.array(permissionRequestSchema) }).passthrough(),
]);
const legacyPolicyRouteBodySchema = z.object({
  enabled: z.boolean(),
  directory: z.string().optional(),
}).strict();
const modePolicyRouteBodySchema = z.object({
  mode: permissionModeSchema,
  directory: z.string().optional(),
}).strict();
const modePolicyQuerySchema = z.object({
  directory: z.string().optional(),
}).passthrough();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const defaultModeCapabilities = () => ({
  supportedModes: ['manual', 'auto', 'full-access'],
});

const normalizeModeCapabilities = (value) => {
  const parsed = modeCapabilitiesInputSchema.safeParse(value);
  const source = parsed.success ? parsed.data : {};
  const supported = (source.supportedModes ?? [])
    .map((mode) => permissionModeSchema.safeParse(mode))
    .filter((mode) => mode.success)
    .map((mode) => mode.data);
  const supportedModes = PERMISSION_MODES.filter((mode) => (
    mode === 'manual' || mode === 'full-access' || supported.includes(mode)
  ));
  return {
    supportedModes,
    reason: source.reason,
  };
};

export function createPermissionAutoAcceptRuntime({
  globalEventHub,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  readSettingsFromDiskMigrated,
  persistSettings,
  broadcastGlobalUiEvent,
  fetchImpl = fetch,
  retryDelaysMs = RETRY_DELAYS_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  getModeCapabilities = defaultModeCapabilities,
}) {
  let policy = normalizePermissionPolicy();
  let loaded = false;
  let loadPromise = null;
  let writePromise = Promise.resolve();
  const sessions = new Map();
  const inFlight = new Map();
  const reconcilePromises = new Map();

  const snapshot = () => ({
    sessions: { ...policy.sessions },
    revision: policy.revision,
  });

  const modeSnapshot = async (directory) => ({
    modes: { ...policy.modes },
    sessions: { ...policy.sessions },
    revision: policy.revision,
    capabilities: normalizeModeCapabilities(await getModeCapabilities({ directory })),
  });

  const load = async () => {
    if (loaded) return snapshot();
    if (!loadPromise) {
      loadPromise = readSettingsFromDiskMigrated()
        .then((settings) => {
          policy = normalizePermissionPolicy(settings?.[SETTINGS_KEY]);
          loaded = true;
          return snapshot();
        })
        .finally(() => { loadPromise = null; });
    }
    return loadPromise;
  };

  const persistUpdate = (update) => {
    writePromise = writePromise.then(async () => {
      const next = update(policy);
      await persistSettings({ [SETTINGS_KEY]: next });
      policy = next;
      loaded = true;
      broadcastGlobalUiEvent?.({
        type: 'openchamber:permission-auto-accept.updated',
        properties: {
          ...snapshot(),
          modes: { ...policy.modes },
        },
      });
      return snapshot();
    });
    return writePromise;
  };

  const setSessionPolicy = async (sessionId, enabled, directory) => {
    const input = sessionPolicyInputSchema.parse({ sessionId, enabled, directory });
    await load();
    const result = await setSessionMode(
      input.sessionId,
      permissionModeFromLegacyAutoAccept(input.enabled),
      input.directory,
    );
    return { sessions: result.sessions, revision: result.revision };
  };

  const setSessionMode = async (sessionId, mode, directory) => {
    const input = sessionModeInputSchema.parse({ sessionId, mode, directory });
    await load();
    if (input.mode !== 'manual' && input.mode !== 'full-access') {
      const capabilities = normalizeModeCapabilities(await getModeCapabilities({ directory: input.directory }));
      if (!capabilities.supportedModes.includes(input.mode)) {
        const error = new Error(capabilities.reason || `Permission mode ${input.mode} is unavailable for this runtime`);
        error.code = 'PERMISSION_MODE_UNAVAILABLE';
        throw error;
      }
    }

    const normalizedSessionId = input.sessionId;
    const persisted = await persistUpdate((current) => {
      const modes = { ...current.modes, [normalizedSessionId]: input.mode };
      return {
        modes,
        sessions: Object.fromEntries(
          Object.entries(modes).map(([id, entryMode]) => [id, legacyAutoAcceptFromPermissionMode(entryMode)]),
        ),
        revision: current.revision + 1,
      };
    });
    if (input.mode !== 'manual') await reconcilePending({ directories: [input.directory] });
    return {
      modes: { ...policy.modes },
      sessions: { ...persisted.sessions },
      revision: persisted.revision,
      capabilities: normalizeModeCapabilities(await getModeCapabilities({ directory: input.directory })),
    };
  };

  const rememberSession = (info, directoryHint) => {
    const parsed = sessionInfoSchema.safeParse(info);
    if (!parsed.success) return;
    sessions.set(parsed.data.id, {
      parentID: parsed.data.parentID ?? null,
      directory: parsed.data.directory ?? directoryHint,
    });
    if (sessions.size > SESSION_CACHE_LIMIT) {
      sessions.delete(sessions.keys().next().value);
    }
  };

  const request = async (path, { directory, method = 'GET', body } = {}) => {
    const url = new URL(buildOpenCodeUrl(path, ''));
    if (directory) url.searchParams.set('directory', directory);
    const headers = {
      Accept: 'application/json',
      ...getOpenCodeAuthHeaders(),
    };
    const requestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(requestTimeoutMs),
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestInit.body = JSON.stringify(body);
    }
    const response = await fetchImpl(url, requestInit);
    if (!response.ok) {
      const error = new Error(`OpenCode request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json().catch(() => null);
  };

  const getSession = async (sessionId, directory) => {
    const cached = sessions.get(sessionId);
    if (cached) return cached;
    const info = await request(`/session/${encodeURIComponent(sessionId)}`, { directory });
    rememberSession(info?.data ?? info, directory);
    return sessions.get(sessionId) ?? null;
  };

  const getSessionMode = async (sessionId, directory) => {
    await load();
    const seen = new Set();
    let current = sessionId;
    let currentDirectory = directory;
    while (current && !seen.has(current)) {
      if (Object.hasOwn(policy.modes, current)) return policy.modes[current];
      seen.add(current);
      let info;
      try {
        info = await getSession(current, currentDirectory);
      } catch {
        return 'manual';
      }
      current = info?.parentID ?? null;
      currentDirectory = info?.directory ?? currentDirectory;
    }
    return 'manual';
  };

  const isSessionAutoAccepting = async (sessionId, directory) => {
    const mode = await getSessionMode(sessionId, directory);
    return mode === 'full-access';
  };

  const evaluatePermission = async (permission, directory) => {
    const parsed = permissionRequestSchema.safeParse(permission);
    if (!parsed.success) {
      return {
        mode: 'manual',
        effect: 'ask',
        reasonCode: 'auto.ask.permission-invalid',
        risk: 'unknown',
      };
    }
    const request = parsed.data;
    const mode = await getSessionMode(request.sessionID, directory ?? request.directory);
    if (mode === 'full-access') {
      return { mode, effect: 'allow', reasonCode: 'full-access.allow', risk: 'unrestricted' };
    }
    if (mode === 'auto') {
      return {
        mode,
        ...classifyAutoPermission({
          ...request,
          directory: directory ?? request.directory,
        }),
      };
    }
    return { mode: 'manual', effect: 'ask', reasonCode: 'manual.ask', risk: 'manual' };
  };

  const shouldAutoAcceptPermission = async (permission, directory) => (
    (await evaluatePermission(permission, directory)).effect === 'allow'
  );

  const replyOnce = async (permission, directory) => {
    await request(`/permission/${encodeURIComponent(permission.id)}/reply`, {
      directory,
      method: 'POST',
      body: { reply: 'once' },
    });
    return true;
  };

  const processPermission = (permission, directory) => {
    const parsed = permissionRequestSchema.safeParse(permission);
    if (!parsed.success) return Promise.resolve(false);
    const request = parsed.data;
    const key = request.id;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const task = (async () => {
      const evaluation = await evaluatePermission(request, directory);
      if (evaluation.mode === 'auto' || evaluation.mode === 'full-access') {
        broadcastGlobalUiEvent?.({
          type: 'openchamber:permission-auto-decision',
          properties: {
            sessionID: request.sessionID,
            permissionID: request.id,
            permission: request.permission,
            mode: evaluation.mode,
            effect: evaluation.effect,
            reasonCode: evaluation.reasonCode,
            risk: evaluation.risk,
          },
        });
      }
      if (evaluation.effect !== 'allow') return false;
      for (const delay of retryDelaysMs) {
        if (delay > 0) await wait(delay);
        try {
          return await replyOnce(request, directory);
        } catch (error) {
          if (error?.status === 404) return true;
        }
      }
      return false;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };

  async function reconcilePending({ directories = [] } = {}) {
    const parsedDirectories = z.array(z.string()).safeParse(directories.filter(Boolean));
    const normalizedDirectories = Array.from(new Set(
      (parsedDirectories.success ? parsedDirectories.data : []).map((directory) => directory.trim()).filter(Boolean),
    ));
    const key = normalizedDirectories.length > 0 ? normalizedDirectories.join('\n') : 'all';
    const existing = reconcilePromises.get(key);
    if (existing) return existing;
    const task = (async () => {
      await load();
      const scopes = [undefined, ...normalizedDirectories];
      const pendingById = new Map();
      for (const directory of scopes) {
        let payload;
        try {
          payload = await request('/permission', { directory });
        } catch {
          continue;
        }
        const parsedPending = pendingPermissionPayloadSchema.safeParse(payload);
        if (!parsedPending.success) continue;
        const pending = Array.isArray(parsedPending.data) ? parsedPending.data : parsedPending.data.data;
        for (const permission of pending) {
          pendingById.set(permission.id, { permission, directory: permission.directory ?? directory });
        }
      }
      await Promise.all(Array.from(pendingById.values()).map(({ permission, directory }) =>
        processPermission(permission, directory)));
    })().finally(() => { reconcilePromises.delete(key); });
    reconcilePromises.set(key, task);
    return task;
  }

  const processEvent = (event) => {
    const parsed = trackedEventEnvelopeSchema.safeParse(event);
    if (!parsed.success) return;
    const raw = parsed.data.payload;
    const payload = 'payload' in raw ? raw.payload : raw;
    const directory = parsed.data.directory && parsed.data.directory !== 'global'
      ? parsed.data.directory
      : undefined;
    if (payload?.type === 'session.created' || payload?.type === 'session.updated') {
      rememberSession(payload.properties?.info, directory);
      return;
    }
    if (payload?.type === 'permission.asked') {
      void processPermission(payload.properties, directory);
    }
  };

  const start = () => {
    const unsubscribeEvent = globalEventHub.subscribeEvent(processEvent);
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status?.type === 'connect') void reconcilePending();
    });
    void load().then(() => reconcilePending()).catch((error) => {
      console.warn('[permission-auto-accept] failed to load policy:', error?.message ?? error);
    });
    return () => {
      unsubscribeEvent();
      unsubscribeStatus();
    };
  };

  return {
    snapshot,
    modeSnapshot,
    load,
    setSessionPolicy,
    setSessionMode,
    getSessionMode,
    isSessionAutoAccepting,
    evaluatePermission,
    shouldAutoAcceptPermission,
    processPermission,
    reconcilePending,
    start,
  };
}

export function registerPermissionAutoAcceptRoutes(app, runtime) {
  const isUsageError = (error) => error instanceof TypeError || error instanceof z.ZodError;

  app.get('/api/permission-auto-accept', async (_req, res) => {
    try {
      res.json(await runtime.load());
    } catch (error) {
      res.status(500).json({ error: error?.message ?? 'Failed to load permission auto-accept policy' });
    }
  });

  app.put('/api/permission-auto-accept/sessions/:sessionId', async (req, res) => {
    try {
      const body = legacyPolicyRouteBodySchema.parse(req.body);
      res.json(await runtime.setSessionPolicy(req.params.sessionId, body.enabled, body.directory));
    } catch (error) {
      res.status(isUsageError(error) ? 400 : 500).json({ error: error?.message });
    }
  });

  app.get('/api/permission-policy', async (req, res) => {
    try {
      await runtime.load();
      const query = modePolicyQuerySchema.parse(req.query);
      res.json(await runtime.modeSnapshot(query.directory));
    } catch (error) {
      res.status(500).json({ error: error?.message ?? 'Failed to load permission policy' });
    }
  });

  app.put('/api/permission-policy/sessions/:sessionId', async (req, res) => {
    try {
      const body = modePolicyRouteBodySchema.parse(req.body);
      res.json(await runtime.setSessionMode(req.params.sessionId, body.mode, body.directory));
    } catch (error) {
      const status = isUsageError(error) ? 400 : error?.code === 'PERMISSION_MODE_UNAVAILABLE' ? 409 : 500;
      const payload = {
        error: error?.message ?? 'Failed to update permission mode',
      };
      if (error?.code) payload.code = error.code;
      res.status(status).json(payload);
    }
  });
}
