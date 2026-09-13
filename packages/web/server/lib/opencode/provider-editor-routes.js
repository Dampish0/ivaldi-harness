import { createProviderEditor, ProviderEditorError } from './provider-editor.js';
import { z } from 'zod';
import { isPlainObject } from './shared.js';

const storedCredential = z.discriminatedUnion('type', [
  z.object({ type: z.literal('api'), key: z.string().min(1) }),
  z.object({ type: z.literal('oauth'), refresh: z.string(), access: z.string(), expires: z.number() }),
  z.object({ type: z.literal('wellknown'), key: z.string(), token: z.string() }),
]);

export function registerProviderEditorRoutes(app, { resolveProjectDirectory, getAuthLibrary, editor = createProviderEditor() }) {
  const route = '/api/provider/:providerId/editor';

  function hasStoredAuth({ readAuthFile }, providerId) {
    const auth = readAuthFile();
    if (!isPlainObject(auth)) {
      throw new ProviderEditorError(500, 'PROVIDER_EDITOR_FAILED', 'Stored credentials could not be read safely.');
    }
    if (!Object.hasOwn(auth, providerId)) return false;
    if (!storedCredential.safeParse(auth[providerId]).success) {
      throw new ProviderEditorError(500, 'PROVIDER_EDITOR_FAILED', 'Stored credentials could not be read safely.');
    }
    return true;
  }

  async function directoryFor(req) {
    const requested = req.get('x-opencode-directory') || req.query.directory;
    const resolved = await resolveProjectDirectory(req);
    if (requested && !resolved.directory) {
      throw new ProviderEditorError(400, 'PROVIDER_EDITOR_INVALID', 'The requested project directory is unavailable.');
    }
    return resolved.directory ?? null;
  }

  function failure(res, error) {
    if (error instanceof ProviderEditorError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    return res.status(500).json({ error: 'Provider configuration could not be saved or loaded.', code: 'PROVIDER_EDITOR_FAILED' });
  }

  app.get(route, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const directory = await directoryFor(req);
      const auth = await getAuthLibrary();
      const stored = hasStoredAuth(auth, req.params.providerId);
      return res.json(editor.read(req.params.providerId, directory, { hasStoredAuth: stored }));
    } catch (error) {
      return failure(res, error);
    }
  });

  app.put(route, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const directory = await directoryFor(req);
      const auth = await getAuthLibrary();
      const stored = hasStoredAuth(auth, req.params.providerId);
      return res.json(editor.save(req.params.providerId, req.body, directory, { hasStoredAuth: stored }));
    } catch (error) {
      return failure(res, error);
    }
  });

  app.delete(route, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const directory = await directoryFor(req);
      return res.json(editor.remove(req.params.providerId, req.body, directory));
    } catch (error) {
      return failure(res, error);
    }
  });
}
