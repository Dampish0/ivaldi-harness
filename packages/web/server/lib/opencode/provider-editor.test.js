import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProviderEditor, ProviderEditorError } from './provider-editor.js';
import { readConfigFile } from './shared.js';

const config = () => ({
  npm: '@ai-sdk/openai-compatible', name: 'Example', env: ['EXAMPLE_KEY'],
  options: { baseURL: 'https://example.test/v1' }, models: { one: { name: 'One' } },
});

function fixture() {
  const layers = {
    userConfig: {}, projectConfig: {}, customConfig: {}, layerErrors: [],
    paths: { userPath: '/user.json', projectPath: '/project.json', customPath: '/custom.json' },
  };
  const writes = [];
  let beforeRead = () => {};
  const editor = createProviderEditor({
    readLayers: () => { beforeRead(); return structuredClone(layers); },
    writeConfig: (value, target) => {
      writes.push({ value, target });
      const scope = ['user', 'project', 'custom'].find(key => layers.paths[`${key}Path`] === target);
      layers[`${scope}Config`] = structuredClone(value);
    },
  });
  return { layers, editor, writes, beforeRead: callback => { beforeRead = callback; } };
}

function saveRequest(snapshot, next = snapshot.config ?? config(), credentials = 'preserve') {
  return { scope: snapshot.scope, expectedRevision: snapshot.revision, credentials, config: next };
}
function removeRequest(snapshot) {
  return { scope: snapshot.scope, expectedRevision: snapshot.revision };
}
function expectStatus(operation, status) {
  try { operation(); throw new Error('Expected editor rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(ProviderEditorError);
    expect(error.statusCode).toBe(status);
  }
}

describe('revision-protected provider editor', () => {
  test('absence creates a user provider and returns deferred restart without storing a submitted secret', () => {
    const { editor, layers, writes } = fixture();
    const initial = editor.read('example', '/project');
    expect(initial).toMatchObject({ scope: 'user', config: null, credentials: { storedAuth: false, inline: false } });
    expect(editor.save('example', saveRequest(initial, config(), 'environment'), '/project')).toEqual({
      success: true, providerId: 'example', requiresRestart: true, restartDeferred: true,
    });
    expect(layers.userConfig.provider.example).toEqual(config());
    expect(writes).toHaveLength(1);
  });

  test('read projects the winning raw layer and hides inline and unknown secret fields', () => {
    const { editor, layers } = fixture();
    layers.userConfig.provider = { example: config() };
    layers.projectConfig.provider = { example: { ...config(), name: 'Project' } };
    layers.customConfig.providers = { example: { ...config(), name: 'Custom', secretExtension: 'private-example', options: { ...config().options, apiKey: 'private-inline' } } };
    const result = editor.read('example', '/project', { hasStoredAuth: true });
    expect(result).toMatchObject({ scope: 'custom', config: { name: 'Custom' }, credentials: { storedAuth: true, inline: true } });
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(result.config.options).toEqual(config().options);
  });

  test('edits preserve alias, other layers, root settings, unknown options and retained model metadata', () => {
    const { editor, layers } = fixture();
    const original = {
      ...config(), extra: { nested: [1, 2] }, env: ['FIRST', 'SECOND'],
      options: { ...config().options, apiKey: 'inline-value', timeout: 321, headers: { Old: 'value' } },
      models: { one: { name: 'One', limit: { context: 99 }, variants: { fast: { effort: 'low' } } }, old: { name: 'Old' } },
    };
    layers.projectConfig = { unrelated: { value: true }, providers: { example: original, another: config() }, disabled_providers: ['example', 'another'] };
    layers.userConfig.provider = { example: { ...config(), name: 'User' } };
    const read = editor.read('example', '/project');
    const changed = structuredClone(read.config);
    changed.name = 'Renamed';
    changed.models = { one: { name: 'First' }, next: { name: 'Next' } };
    delete changed.env;
    delete changed.options.headers;
    editor.save('example', saveRequest(read, changed), '/project');
    expect(layers.projectConfig.providers.example).toEqual({
      ...original, name: 'Renamed', options: { baseURL: original.options.baseURL, apiKey: 'inline-value', timeout: 321 },
      models: { one: { ...original.models.one, name: 'First' }, next: { name: 'Next' } },
    });
    expect(layers.projectConfig.provider).toBeUndefined();
    expect(layers.projectConfig.unrelated).toEqual({ value: true });
    expect(layers.projectConfig.providers.another).toEqual(config());
    expect(layers.projectConfig.disabled_providers).toEqual(['another']);
    expect(layers.userConfig.provider.example.name).toBe('User');
  });

  test('model and header __proto__, constructor and toString keys remain literal own properties', () => {
    const { editor, layers } = fixture();
    const models = Object.fromEntries(['__proto__', 'constructor', 'toString'].map(id => [id, { name: id, limit: { context: 42 } }]));
    const headerValues = Object.fromEntries(['__proto__', 'constructor', 'toString'].map(id => [id, 'value']));
    layers.userConfig.provider = { example: { ...config(), models, options: { ...config().options, headers: headerValues } } };
    const read = editor.read('example');
    editor.save('example', saveRequest(read));
    const saved = layers.userConfig.provider.example;
    expect(Object.keys(saved.models)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(saved.models.__proto__).toEqual({ name: '__proto__', limit: { context: 42 } });
    expect(Object.hasOwn(saved.options.headers, '__proto__')).toBe(true);
    expect(saved.options.headers.__proto__).toBe('value');
    expect(Object.getPrototypeOf(saved.models)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(saved.options.headers)).toBe(Object.prototype);
  });

  test('environment and stored-auth explicitly replace the prior credential sources', () => {
    const { editor, layers } = fixture();
    layers.userConfig.provider = { example: { ...config(), options: { ...config().options, apiKey: 'inline' } } };
    let read = editor.read('example');
    editor.save('example', saveRequest(read, { ...read.config, env: ['REPLACEMENT'] }, 'environment'));
    expect(layers.userConfig.provider.example.env).toEqual(['REPLACEMENT']);
    expect(layers.userConfig.provider.example.options.apiKey).toBeUndefined();
    read = editor.read('example', null, { hasStoredAuth: true });
    editor.save('example', saveRequest(read, read.config, 'stored-auth'), null, { hasStoredAuth: true });
    expect(layers.userConfig.provider.example.env).toBeUndefined();
    expect(layers.userConfig.provider.example.options.apiKey).toBeUndefined();
  });

  test('stored auth is required by its explicit mode and auth changes do not alter config revisions', () => {
    const { editor, writes } = fixture();
    const read = editor.read('example');
    expect(editor.read('example', null, { hasStoredAuth: true }).revision).toBe(read.revision);
    expectStatus(() => editor.save('example', saveRequest(read, config(), 'stored-auth')), 400);
    expectStatus(() => editor.save('example', saveRequest(read)), 400);
    expect(writes).toHaveLength(0);
    editor.save('example', saveRequest(read, config(), 'stored-auth'), null, { hasStoredAuth: true });
    expect(writes).toHaveLength(1);
  });

  test('stale create, edit and delete refuse changes without writing', () => {
    const { editor, layers, writes } = fixture();
    const absent = editor.read('example');
    layers.userConfig.provider = { example: config() };
    expectStatus(() => editor.save('example', saveRequest(absent, config(), 'environment')), 409);
    const read = editor.read('example');
    layers.userConfig.provider.example.models.one.limit = { context: 100 };
    expectStatus(() => editor.save('example', saveRequest(read)), 409);
    expectStatus(() => editor.remove('example', removeRequest(read)), 409);
    expect(writes).toHaveLength(0);
  });

  test('lower-layer, alias, path and disabled-state changes invalidate edit authority', () => {
    for (const change of [
      layers => { layers.userConfig.provider = { example: config() }; },
      layers => { layers.projectConfig.providers = layers.projectConfig.provider; delete layers.projectConfig.provider; },
      layers => { layers.paths.projectPath = '/other-project.json'; },
      layers => { layers.projectConfig.disabled_providers = ['example']; },
    ]) {
      const { editor, layers, writes } = fixture();
      layers.projectConfig.provider = { example: config() };
      const read = editor.read('example', '/project');
      change(layers);
      expectStatus(() => editor.save('example', saveRequest(read), '/project'), 409);
      expect(writes).toHaveLength(0);
    }
  });

  test('scope mismatch and missing project context never fall back to user config', () => {
    const { editor, layers, writes } = fixture();
    layers.projectConfig.provider = { example: config() };
    const read = editor.read('example', '/project');
    expectStatus(() => editor.save('example', { ...saveRequest(read), scope: 'user' }, '/project'), 409);
    expectStatus(() => editor.save('example', saveRequest(read)), 400);
    layers.paths.projectPath = null;
    const noPath = editor.read('example', '/project');
    expectStatus(() => editor.save('example', saveRequest(noPath), '/project'), 400);
    expect(writes).toHaveLength(0);
  });

  test('delete removes only the selected configuration and exposes the untouched lower layer', () => {
    const { editor, layers } = fixture();
    layers.userConfig.provider = { example: { ...config(), name: 'User' } };
    layers.customConfig.providers = { example: config(), another: config() };
    const read = editor.read('example', '/project', { hasStoredAuth: true });
    expect(editor.remove('example', removeRequest(read), '/project')).toMatchObject({ removed: true, requiresRestart: true });
    expect(layers.customConfig.providers).toEqual({ another: config() });
    expect(editor.read('example', '/project', { hasStoredAuth: true })).toMatchObject({ scope: 'user', credentials: { storedAuth: true } });
  });

  test('an absent delete is an authoritative no-op without a restart', () => {
    const { editor, writes } = fixture();
    const read = editor.read('example');
    expect(editor.remove('example', removeRequest(read))).toMatchObject({ removed: false, requiresRestart: false, restartDeferred: false });
    expect(writes).toHaveLength(0);
  });

  test('malformed layers, ambiguous aliases and unsupported raw config do not become empty create forms', () => {
    for (const bad of [
      layers => { layers.layerErrors = [{ code: 'INVALID_JSONC', path: '/user.json' }]; },
      layers => { layers.userConfig.provider = []; },
      layers => { layers.userConfig = { provider: { example: config() }, providers: { example: config() } }; },
      layers => { layers.userConfig.provider = { example: { ...config(), npm: 'unknown-adapter' } }; },
      layers => { layers.projectConfig.provider = { example: { name: 'Partial override' } }; },
    ]) {
      const { editor, layers, writes } = fixture();
      bad(layers);
      expect(() => editor.read('example', '/project')).toThrow(ProviderEditorError);
      expect(writes).toHaveLength(0);
    }
  });

  test('invalid URLs, headers, normalized model collisions and direct inline-key submissions reject without writes', () => {
    for (const alter of [
      value => { value.options.baseURL = 'https://'; },
      value => { value.options.baseURL = 'file:///tmp/data'; },
      value => { value.options.headers = { 'Invalid Header': 'value' }; },
      value => { value.options.headers = { Header: 'value\r\nOther: injected' }; },
      value => { value.options.headers = { Header: 'first', header: 'second' }; },
      value => { value.models = { one: { name: 'One' }, ' one ': { name: 'Other' } }; },
      value => { value.models = []; },
      value => { value.models = {}; },
      value => { value.options.apiKey = 'must-use-sdk'; },
    ]) {
      const { editor, writes } = fixture();
      const read = editor.read('example');
      const value = config();
      alter(value);
      expectStatus(() => editor.save('example', saveRequest(read, value, 'environment')), 400);
      expect(writes).toHaveLength(0);
    }
  });

  test('a change between validation and commit is rechecked', () => {
    const { editor, layers, writes, beforeRead } = fixture();
    layers.userConfig.provider = { example: config() };
    const read = editor.read('example');
    let reads = 0;
    beforeRead(() => { if (++reads === 2) layers.userConfig.provider.example.name = 'External edit'; });
    expectStatus(() => editor.save('example', saveRequest(read)), 409);
    expect(writes).toHaveLength(0);
  });

  test('an unrelated root change during the final check survives the provider save', () => {
    const { editor, layers, beforeRead } = fixture();
    layers.userConfig.provider = { example: config() };
    const read = editor.read('example');
    let reads = 0;
    beforeRead(() => { if (++reads === 2) layers.userConfig.newSetting = { keep: true }; });
    editor.save('example', saveRequest(read));
    expect(layers.userConfig.newSetting).toEqual({ keep: true });
  });

  test('failed persistence leaves the preceding snapshot available for an explicit retry', () => {
    const { layers } = fixture();
    layers.userConfig.provider = { example: config() };
    let fail = true;
    const editor = createProviderEditor({
      readLayers: () => structuredClone(layers),
      writeConfig: next => { if (fail) throw new Error('Failed storage'); layers.userConfig = next; },
    });
    const read = editor.read('example');
    const body = saveRequest(read, { ...read.config, name: 'New name' });
    expect(() => editor.save('example', body)).toThrow('Failed storage');
    expect(editor.read('example').revision).toBe(read.revision);
    expect(layers.userConfig.provider.example.name).toBe('Example');
    fail = false;
    editor.save('example', body);
    expect(layers.userConfig.provider.example.name).toBe('New name');
  });
});

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.join(os.tmpdir(), 'ivaldi-provider-editor-'))) throw new Error('Unsafe test cleanup');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('disk replacement preserves unrelated JSONC values, leaves a backup, and leaves the target intact if backup fails', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ivaldi-provider-editor-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'opencode.jsonc');
  fs.writeFileSync(filePath, '// Existing comment\n' + JSON.stringify({ provider: { example: config() }, other: { enabled: true } }));
  const editor = createProviderEditor({
    readLayers: () => ({
      userConfig: readConfigFile(filePath), projectConfig: {}, customConfig: {}, layerErrors: [],
      paths: { userPath: filePath, projectPath: null, customPath: null },
    }),
  });
  const read = editor.read('example');
  editor.save('example', saveRequest(read, { ...read.config, name: 'Updated' }));
  expect(readConfigFile(filePath)).toMatchObject({ provider: { example: { name: 'Updated' } }, other: { enabled: true } });
  const backup = `${filePath}.openchamber.backup`;
  expect(readConfigFile(backup).provider.example.name).toBe('Example');
  fs.unlinkSync(backup);
  fs.mkdirSync(backup);
  const second = editor.read('example');
  expect(() => editor.save('example', saveRequest(second, { ...second.config, name: 'Not saved' }))).toThrow();
  expect(readConfigFile(filePath).provider.example.name).toBe('Updated');
  expect(fs.readdirSync(directory).some(name => name.endsWith('.tmp'))).toBe(false);
});
