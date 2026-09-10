import {
  createLifecycleHookManagementService,
  LifecycleHookManagementError,
} from './management.js';

const errorResponse = (error) => {
  const payload = {
    success: false,
    code: error.code,
    error: error.message,
  };
  if (error.issues) payload.issues = error.issues;
  return payload;
};

export const registerLifecycleHookRoutes = (app, dependencies) => {
  const {
    lifecycleHookRuntime,
    persistSettings,
  } = dependencies;
  const management = dependencies.management ?? createLifecycleHookManagementService({
    getLifecycleHookRuntime: () => lifecycleHookRuntime,
    persistSettings,
  });

  app.get('/api/lifecycle-hooks', (_req, res) => {
    try {
      return res.json(management.list());
    } catch (error) {
      if (error instanceof LifecycleHookManagementError) {
        return res.status(error.statusCode).json(errorResponse(error));
      }
      throw error;
    }
  });

  app.put('/api/lifecycle-hooks', async (req, res) => {
    try {
      return res.json({ success: true, hooks: await management.replace(req.body?.hooks) });
    } catch (error) {
      if (error instanceof LifecycleHookManagementError) {
        if (error.statusCode >= 500) console.error('[lifecycle-hooks] Failed to persist hooks:', error.cause ?? error);
        return res.status(error.statusCode).json(errorResponse(error));
      }
      throw error;
    }
  });

  app.post('/api/lifecycle-hooks/test', async (req, res) => {
    try {
      const result = await management.testCandidate(req.body?.hook, req.body?.payload);
      return res.json({ success: true, result });
    } catch (error) {
      if (error instanceof LifecycleHookManagementError) {
        if (error.statusCode >= 500) console.error('[lifecycle-hooks] Failed to test hook:', error.cause ?? error);
        return res.status(error.statusCode).json(errorResponse(error));
      }
      throw error;
    }
  });
};
