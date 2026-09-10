import { z } from 'zod';

import {
  LIFECYCLE_HOOK_BLOCKING_EVENTS,
  LIFECYCLE_HOOK_EVENTS,
  LIFECYCLE_HOOK_FAILURE_MODES,
  validateLifecycleHooks,
} from './config.js';

const hookIdSchema = z.string().trim().min(1);

export class LifecycleHookManagementError extends Error {
  constructor(message, statusCode, code, details = {}) {
    super(message);
    this.name = 'LifecycleHookManagementError';
    this.statusCode = statusCode;
    this.code = code;
    Object.assign(this, details);
  }
}

const configurationUnavailable = () => new LifecycleHookManagementError(
  'Lifecycle hook configuration is unavailable',
  503,
  'LIFECYCLE_HOOK_CONFIG_UNAVAILABLE',
);

const validateOrThrow = (hooks) => {
  const validation = validateLifecycleHooks(hooks);
  if (validation.ok) return validation.hooks;
  throw new LifecycleHookManagementError(
    'Lifecycle hook configuration is invalid',
    400,
    'LIFECYCLE_HOOK_CONFIG_INVALID',
    { issues: validation.issues },
  );
};

const requireHookId = (hookId) => {
  const parsed = hookIdSchema.safeParse(hookId);
  if (!parsed.success) {
    throw new LifecycleHookManagementError(
      'hookId is required',
      400,
      'LIFECYCLE_HOOK_ID_REQUIRED',
    );
  }
  return parsed.data;
};

export const createLifecycleHookManagementService = ({
  getLifecycleHookRuntime,
  persistSettings,
}) => {
  let mutationQueue = Promise.resolve();

  const enqueueMutation = (operation) => {
    const pending = mutationQueue.then(operation, operation);
    mutationQueue = pending.catch(() => undefined);
    return pending;
  };

  const runtime = () => {
    const current = getLifecycleHookRuntime?.();
    if (!current) throw configurationUnavailable();
    return current;
  };

  const requireReadyRuntime = () => {
    const current = runtime();
    if (current.getConfigurationStatus()?.ready !== true) throw configurationUnavailable();
    return current;
  };

  const list = () => {
    const current = requireReadyRuntime();
    return {
      hooks: current.snapshotHooks(),
      recentExecutions: current.getRecentExecutions(),
      supportedEvents: LIFECYCLE_HOOK_EVENTS,
      blockingEvents: LIFECYCLE_HOOK_BLOCKING_EVENTS,
      failureModes: LIFECYCLE_HOOK_FAILURE_MODES,
    };
  };

  const persistValidated = async (current, validated) => {
    try {
      await persistSettings({ lifecycleHooks: validated });
      // Settings persistence normally refreshes the runtime through the global
      // settings observer. Replacing here as well keeps this service correct in
      // tests and alternative runtimes where that observer is not installed.
      current.replaceHooks(validated);
      return current.snapshotHooks();
    } catch (error) {
      if (error instanceof LifecycleHookManagementError) throw error;
      throw new LifecycleHookManagementError(
        'Failed to save lifecycle hooks',
        500,
        'LIFECYCLE_HOOK_SAVE_FAILED',
        { cause: error },
      );
    }
  };

  const save = (hooks) => {
    const validated = validateOrThrow(hooks);
    return enqueueMutation(async () => {
      const current = requireReadyRuntime();
      return persistValidated(current, validated);
    });
  };

  const create = (hook) => enqueueMutation(async () => {
    const current = requireReadyRuntime();
    const validated = validateOrThrow([...current.snapshotHooks(), hook]);
    return persistValidated(current, validated);
  });

  const update = (hookId, patch) => {
    const id = requireHookId(hookId);
    return enqueueMutation(async () => {
      const current = requireReadyRuntime();
      const hooks = current.snapshotHooks();
      const index = hooks.findIndex((hook) => hook.id === id);
      if (index === -1) {
        throw new LifecycleHookManagementError(
          `Lifecycle hook "${id}" was not found`,
          404,
          'LIFECYCLE_HOOK_NOT_FOUND',
        );
      }
      const next = hooks.map((hook, hookIndex) => (
        hookIndex === index ? { ...hook, ...patch, id } : hook
      ));
      return persistValidated(current, validateOrThrow(next));
    });
  };

  const remove = (hookId) => {
    const id = requireHookId(hookId);
    return enqueueMutation(async () => {
      const current = requireReadyRuntime();
      const hooks = current.snapshotHooks();
      if (!hooks.some((hook) => hook.id === id)) {
        throw new LifecycleHookManagementError(
          `Lifecycle hook "${id}" was not found`,
          404,
          'LIFECYCLE_HOOK_NOT_FOUND',
        );
      }
      const validated = validateOrThrow(hooks.filter((hook) => hook.id !== id));
      const next = await persistValidated(current, validated);
      return { deleted: true, hookId: id, hooks: next };
    });
  };

  const testCandidate = async (hook, payload) => {
    const current = runtime();
    const [validated] = validateOrThrow([hook]);
    try {
      return await current.testHook(validated, payload);
    } catch (error) {
      throw new LifecycleHookManagementError(
        'Failed to test lifecycle hook',
        500,
        'LIFECYCLE_HOOK_TEST_FAILED',
        { cause: error },
      );
    }
  };

  const testSaved = async (hookId, payload) => {
    const id = requireHookId(hookId);
    const current = requireReadyRuntime();
    const hook = current.snapshotHooks().find((entry) => entry.id === id);
    if (!hook) {
      throw new LifecycleHookManagementError(
        `Lifecycle hook "${id}" was not found`,
        404,
        'LIFECYCLE_HOOK_NOT_FOUND',
      );
    }
    return testCandidate(hook, payload);
  };

  return {
    create,
    list,
    remove,
    replace: save,
    testCandidate,
    testSaved,
    update,
  };
};
