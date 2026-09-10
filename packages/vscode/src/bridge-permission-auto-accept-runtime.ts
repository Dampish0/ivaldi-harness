const STORAGE_KEY = 'permissionAutoAccept';
const PERMISSION_MODES = ['manual', 'auto', 'full-access'] as const;

type PermissionMode = (typeof PERMISSION_MODES)[number];
type PolicyContext = {
  globalState: {
    get: <T>(key: string) => T | undefined;
    update: (key: string, value: PermissionPolicySnapshot) => PromiseLike<void>;
  };
};

export type PermissionPolicySnapshot = {
  modes: Record<string, PermissionMode>;
  sessions: Record<string, boolean>;
  revision: number;
};

type StoredPermissionPolicy = {
  modes?: Record<string, string>;
  sessions?: Record<string, boolean>;
  revision?: number;
};

type PermissionWritePayload = {
  sessionId?: string;
  enabled?: boolean;
  mode?: string;
};

const isPermissionMode = (value?: string | null): value is PermissionMode => (
  value === 'manual' || value === 'auto' || value === 'full-access'
);
const legacyEnabledForMode = (mode: PermissionMode) => mode === 'full-access';

const normalizeSnapshot = (source: StoredPermissionPolicy = {}): PermissionPolicySnapshot => {
  const modes: Record<string, PermissionMode> = {};
  for (const [sessionId, mode] of Object.entries(source.modes ?? {})) {
    if (sessionId && isPermissionMode(mode)) modes[sessionId] = mode;
  }
  for (const [sessionId, enabled] of Object.entries(source.sessions ?? {})) {
    if (!sessionId || Object.prototype.hasOwnProperty.call(modes, sessionId)) continue;
    if (enabled === true) modes[sessionId] = 'full-access';
    if (enabled === false) modes[sessionId] = 'manual';
  }
  const sessions = Object.fromEntries(
    Object.entries(modes).map(([sessionId, mode]) => [sessionId, legacyEnabledForMode(mode)]),
  );
  const revision = Number.isSafeInteger(source.revision) && Number(source.revision) >= 0
    ? Number(source.revision)
    : 0;
  return { modes, sessions, revision };
};

const readPolicy = (context: PolicyContext) => normalizeSnapshot(
  context.globalState.get<StoredPermissionPolicy>(STORAGE_KEY),
);
const operationQueues = new WeakMap<object, Promise<void>>();

const serialize = async <T>(context: PolicyContext, operation: () => Promise<T>): Promise<T> => {
  const owner = context.globalState;
  const previous = operationQueues.get(owner) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => current);
  operationQueues.set(owner, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (operationQueues.get(owner) === queued) operationQueues.delete(owner);
  }
};

const policyResponse = (snapshot: PermissionPolicySnapshot) => ({
  ...snapshot,
  capabilities: { supportedModes: [...PERMISSION_MODES] },
});
const legacyResponse = (snapshot: PermissionPolicySnapshot) => ({
  sessions: snapshot.sessions,
  revision: snapshot.revision,
});

const setMode = async (
  context: PolicyContext,
  sessionId: string,
  mode: PermissionMode,
  broadcast: (snapshot: PermissionPolicySnapshot) => PromiseLike<void>,
) => serialize(context, async () => {
  const current = readPolicy(context);
  const modes = { ...current.modes, [sessionId]: mode };
  const snapshot: PermissionPolicySnapshot = {
    modes,
    sessions: Object.fromEntries(
      Object.entries(modes).map(([id, entryMode]) => [id, legacyEnabledForMode(entryMode)]),
    ),
    revision: current.revision + 1,
  };
  await context.globalState.update(STORAGE_KEY, snapshot);
  await broadcast(snapshot);
  return snapshot;
});

export async function handlePermissionAutoAcceptBridgeMessage(
  message: { id: string; type: string; payload?: unknown },
  context?: PolicyContext,
  dependencies?: { broadcast: (snapshot: PermissionPolicySnapshot) => PromiseLike<void> },
) {
  const supportedTypes = new Set([
    'api:permission-auto-accept:get',
    'api:permission-auto-accept:set',
    'api:permission-policy:get',
    'api:permission-policy:set',
  ]);
  if (!supportedTypes.has(message.type)) return null;
  if (!context) return { id: message.id, type: message.type, success: false, error: 'Extension context is unavailable' };

  if (message.type === 'api:permission-auto-accept:get' || message.type === 'api:permission-policy:get') {
    const snapshot = await serialize(context, async () => readPolicy(context));
    return {
      id: message.id,
      type: message.type,
      success: true,
      data: message.type === 'api:permission-policy:get' ? policyResponse(snapshot) : legacyResponse(snapshot),
    };
  }

  // SAFETY: VS Code webview messages are structured-clone payloads. The field
  // checks below reject missing or wrong-shaped values before any mutation.
  const payload = Object(message.payload ?? {}) as PermissionWritePayload;
  const sessionId = payload.sessionId?.trim?.() ?? '';
  if (!sessionId) return { id: message.id, type: message.type, success: false, error: 'sessionId is required' };
  const mode = message.type === 'api:permission-policy:set'
    ? payload.mode
    : payload.enabled === true
      ? 'full-access'
      : payload.enabled === false ? 'manual' : null;
  if (!isPermissionMode(mode)) {
    return {
      id: message.id,
      type: message.type,
      success: false,
      error: message.type === 'api:permission-policy:set' ? 'mode is invalid' : 'enabled must be a boolean',
    };
  }

  const snapshot = await setMode(
    context,
    sessionId,
    mode,
    dependencies?.broadcast ?? (() => Promise.resolve()),
  );
  return {
    id: message.id,
    type: message.type,
    success: true,
    data: message.type === 'api:permission-policy:set' ? policyResponse(snapshot) : legacyResponse(snapshot),
  };
}
