import { describe, expect, test } from 'bun:test';
import express from 'express';
import request from 'supertest';
import { createProviderEditor } from './provider-editor.js';
import { registerProviderEditorRoutes } from './provider-editor-routes.js';

function fixture() {
  const layers = {
    userConfig: {}, projectConfig: {}, customConfig: {}, layerErrors: [],
    paths: { userPath: '/user.json', projectPath: '/project.json', customPath: null },
  };
  let storedAuth = false;
  let failRead = false;
  const writes = [];
  const directories = [];
  let fallbackCalls = 0;
  const app = express();
  app.use(express.json());
  const editor = createProviderEditor({
    readLayers: directory => {
      directories.push(directory);
      if (failRead) throw new Error('private-file-path and credential must not be returned');
      return structuredClone(layers);
    },
    writeConfig: (value, filePath) => {
      writes.push(filePath);
      if (filePath === '/user.json') layers.userConfig = value;
      else layers.projectConfig = value;
    },
  });
  registerProviderEditorRoutes(app, {
    editor,
    resolveProjectDirectory: async req => {
      const directory = req.get('x-opencode-directory') || req.query.directory;
      return directory === '/invalid' ? { directory: null, error: 'private directory failure' } : { directory: directory ?? null };
    },
    getAuthLibrary: async () => ({ readAuthFile: () => storedAuth ? { example: { type: 'api', key: 'private-auth' } } : {} }),
  });
  app.use((_req, res) => { fallbackCalls += 1; res.status(404).json({ fallback: true }); });
  return {
    app, layers, writes, directories,
    storeAuth: () => { storedAuth = true; },
    failRead: () => { failRead = true; },
    fallbackCalls: () => fallbackCalls,
  };
}

const config = () => ({
  npm: '@ai-sdk/anthropic', name: 'Example', env: ['EXAMPLE_KEY'],
  options: { baseURL: 'https://example.test' }, models: { model: { name: 'Model' } },
});

describe('provider editor HTTP routes', () => {
  test('GET/PUT/DELETE register before fallback, propagate the captured directory and defer restart', async () => {
    const context = fixture();
    const endpoint = '/api/provider/example/editor?directory=%2Fproject';
    const first = await request(context.app).get(endpoint).expect(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const saved = await request(context.app).put(endpoint).send({
      scope: first.body.scope, expectedRevision: first.body.revision, credentials: 'environment', config: config(),
    }).expect(200);
    expect(saved.body).toEqual({ success: true, providerId: 'example', requiresRestart: true, restartDeferred: true });
    const current = await request(context.app).get(endpoint).expect(200);
    expect(current.body.config).toEqual(config());
    const removed = await request(context.app).delete(endpoint).send({ scope: current.body.scope, expectedRevision: current.body.revision }).expect(200);
    expect(removed.body).toMatchObject({ removed: true, requiresRestart: true });
    expect(context.directories.every(directory => directory === '/project')).toBe(true);
    expect(context.writes).toEqual(['/user.json', '/user.json']);
    expect(context.fallbackCalls()).toBe(0);
  });

  test('stored-auth mode reads authoritative auth after SDK-style credential storage', async () => {
    const context = fixture();
    const endpoint = '/api/provider/example/editor';
    const first = await request(context.app).get(endpoint).expect(200);
    const body = { scope: first.body.scope, expectedRevision: first.body.revision, credentials: 'stored-auth', config: config() };
    await request(context.app).put(endpoint).send(body).expect(400);
    context.storeAuth();
    await request(context.app).put(endpoint).send(body).expect(200);
    const current = await request(context.app).get(endpoint).expect(200);
    expect(current.body.credentials).toEqual({ storedAuth: true, inline: false });
    expect(current.body.config.env).toBeUndefined();
    expect(JSON.stringify(current.body)).not.toContain('private-auth');
  });

  test('stale create and delete return a fixed 409 and never call generic OpenCode fallback', async () => {
    const context = fixture();
    const endpoint = '/api/provider/example/editor';
    const first = await request(context.app).get(endpoint).expect(200);
    context.layers.userConfig.provider = { example: config() };
    const stale = { scope: first.body.scope, expectedRevision: first.body.revision };
    const result = await request(context.app).put(endpoint).send({ ...stale, credentials: 'environment', config: config() }).expect(409);
    expect(result.body.code).toBe('PROVIDER_EDITOR_CONFLICT');
    await request(context.app).delete(endpoint).send(stale).expect(409);
    expect(context.writes).toHaveLength(0);
    expect(context.fallbackCalls()).toBe(0);
  });

  test('requested invalid directories reject read/write/delete instead of falling back to global config', async () => {
    const context = fixture();
    const endpoint = '/api/provider/example/editor?directory=%2Finvalid';
    for (const method of ['get', 'put', 'delete']) {
      const result = await request(context.app)[method](endpoint).send({}).expect(400);
      expect(result.body.code).toBe('PROVIDER_EDITOR_INVALID');
      expect(JSON.stringify(result.body)).not.toContain('private');
    }
    expect(context.writes).toHaveLength(0);
    expect(context.directories).toHaveLength(0);
  });

  test('unsupported and failed config reads return distinct fixed errors without raw config or exception text', async () => {
    const context = fixture();
    context.layers.userConfig.provider = { example: { ...config(), npm: 'unsupported', privateExtension: 'private-value' } };
    const unsupported = await request(context.app).get('/api/provider/example/editor').expect(422);
    expect(unsupported.body.code).toBe('PROVIDER_EDITOR_UNSUPPORTED');
    expect(JSON.stringify(unsupported.body)).not.toContain('private');
    context.failRead();
    const failed = await request(context.app).get('/api/provider/example/editor').expect(500);
    expect(failed.body.code).toBe('PROVIDER_EDITOR_FAILED');
    expect(JSON.stringify(failed.body)).not.toContain('private');
  });

  test('JSON model/header prototype-like keys survive the HTTP boundary', async () => {
    const context = fixture();
    const endpoint = '/api/provider/example/editor';
    const first = await request(context.app).get(endpoint).expect(200);
    const value = config();
    value.models = Object.fromEntries([['__proto__', { name: 'Literal model' }], ['constructor', { name: 'Constructor' }]]);
    value.options.headers = Object.fromEntries([['__proto__', 'Literal header']]);
    await request(context.app).put(endpoint).send({ scope: first.body.scope, expectedRevision: first.body.revision, credentials: 'environment', config: value }).expect(200);
    const current = await request(context.app).get(endpoint).expect(200);
    expect(Object.hasOwn(current.body.config.models, '__proto__')).toBe(true);
    expect(current.body.config.models.__proto__).toEqual({ name: 'Literal model' });
    expect(current.body.config.options.headers.__proto__).toBe('Literal header');
  });

  test('prototype properties never count as stored provider credentials', async () => {
    const context = fixture();
    const result = await request(context.app).get('/api/provider/constructor/editor').expect(200);
    expect(result.body.credentials.storedAuth).toBe(false);
    await request(context.app).put('/api/provider/constructor/editor').send({
      scope: result.body.scope, expectedRevision: result.body.revision, credentials: 'stored-auth', config: config(),
    }).expect(400);
    expect(context.writes).toHaveLength(0);
  });
});
