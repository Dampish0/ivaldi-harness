import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { isPlainObject, readConfigLayers } from './shared.js';

const providerID = z.string().regex(/^[a-z0-9][a-z0-9-_]*$/);
const scopeSchema = z.enum(['user', 'project', 'custom']);
const name = z.string().trim().min(1);
const packages = z.enum(['@ai-sdk/openai-compatible', '@ai-sdk/openai', '@ai-sdk/anthropic']);
const endpoint = z.url({ protocol: /^https?$/ });
// Zod record parsing drops __proto__. Parse entries to preserve every literal model/header key.
function dictionary(key, value) {
  return z.preprocess(input => isPlainObject(input) ? Object.entries(input) : null,
    z.array(z.tuple([key, value])).transform(entries => Object.fromEntries(entries)));
}
const headers = dictionary(z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), z.string().min(1).regex(/^[^\r\n]*$/))
  .refine(value => new Set(Object.keys(value).map(key => key.toLowerCase())).size === Object.keys(value).length);
const environment = z.array(name).min(1);
const modelNames = dictionary(name, z.strictObject({ name })).refine(value => Object.keys(value).length > 0);
const submittedConfig = z.strictObject({
  npm: packages,
  name,
  env: environment.optional(),
  options: z.strictObject({ baseURL: endpoint, headers: headers.optional() }),
  models: modelNames,
});
const rawConfig = z.looseObject({
  npm: packages,
  name,
  env: environment.optional(),
  options: z.looseObject({ baseURL: endpoint, headers: headers.optional(), apiKey: z.string().optional() }),
  models: dictionary(name, z.looseObject({ name })).refine(value => Object.keys(value).length > 0),
});
const guard = z.strictObject({ scope: scopeSchema, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) });
const update = guard.extend({
  credentials: z.enum(['preserve', 'stored-auth', 'environment']),
  config: submittedConfig,
});

export class ProviderEditorError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const invalid = () => new ProviderEditorError(400, 'PROVIDER_EDITOR_INVALID', 'Invalid custom provider configuration.');
const unsupported = () => new ProviderEditorError(422, 'PROVIDER_EDITOR_UNSUPPORTED', 'This provider configuration cannot be edited safely in this form.');
const conflict = () => new ProviderEditorError(409, 'PROVIDER_EDITOR_CONFLICT', 'The provider configuration changed. Reload it before saving.');

// Write beside the target, then replace it. A failed write leaves the last config intact.
function writeEditorConfig(config, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    const mode = fs.existsSync(filePath) ? fs.statSync(filePath).mode : 0o600;
    fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { encoding: 'utf8', flag: 'wx', mode });
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.openchamber.backup`);
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function entryInLayer(config, id) {
  for (const key of ['provider', 'providers']) {
    if (Object.hasOwn(config, key) && !isPlainObject(config[key])) throw unsupported();
  }
  const primary = Object.hasOwn(config.provider ?? {}, id);
  const alias = Object.hasOwn(config.providers ?? {}, id);
  if (primary && alias) throw unsupported();
  const key = primary ? 'provider' : alias ? 'providers' : null;
  return { key, value: key ? config[key][id] : null };
}

function projectEditable(config) {
  if (!rawConfig.safeParse(config).success) throw unsupported();
  // Keep values exactly as read. Normalization happens only for submitted edits.
  const editable = {
    npm: config.npm,
    name: config.name,
    options: { baseURL: config.options.baseURL },
    models: Object.fromEntries(Object.entries(config.models).map(([id, model]) => [id, { name: model.name }])),
  };
  if (config.env) editable.env = [...config.env];
  if (config.options.headers) editable.options.headers = { ...config.options.headers };
  return editable;
}

function readEditorLayers(directory) {
  const layers = readConfigLayers(directory);
  // Keep existing symlinks intact and include their physical target in edit authority.
  layers.paths = Object.fromEntries(Object.entries(layers.paths).map(([key, filePath]) => [
    key, filePath && fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath,
  ]));
  return layers;
}

/** Raw config layers own edit authority. SDK catalog records are never write snapshots. */
export function createProviderEditor({ readLayers = readEditorLayers, writeConfig = writeEditorConfig } = {}) {
  // A keyed digest avoids exposing a guessable hash of inline credentials.
  const revisionKey = randomBytes(32);

  function snapshot(id, directory) {
    if (!providerID.safeParse(id).success) throw invalid();
    const layers = readLayers(directory);
    if (layers.layerErrors?.length) {
      throw new ProviderEditorError(500, 'PROVIDER_EDITOR_FAILED', 'Provider configuration could not be read safely.');
    }
    const entries = ['user', 'project', 'custom'].map(scope => {
      const config = layers[`${scope}Config`];
      const entry = entryInLayer(config, id);
      return { scope, config, path: layers.paths[`${scope}Path`], ...entry };
    });
    const selected = entries.findLast(entry => entry.key) ?? entries[0];
    const revision = createHmac('sha256', revisionKey).update(JSON.stringify(entries.map(entry => ({
      scope: entry.scope,
      path: entry.path,
      key: entry.key,
      value: entry.value,
      disabled: Array.isArray(entry.config.disabled_providers) && entry.config.disabled_providers.includes(id),
    })))).digest('hex');
    return { entries, selected, revision };
  }

  function checked(id, request, directory) {
    const current = snapshot(id, directory);
    if (request.expectedRevision !== current.revision || request.scope !== current.selected.scope) throw conflict();
    const { selected } = current;
    if (!selected.path || (selected.scope === 'project' && !directory)) throw invalid();
    if (selected.key) projectEditable(selected.value);
    return current;
  }

  function commit(id, directory, current, change) {
    // Re-read before the filesystem mutation so a changed external layer cannot be ignored.
    const latest = snapshot(id, directory);
    if (latest.revision !== current.revision) throw conflict();
    writeConfig(change(latest.selected.config), latest.selected.path);
    return { success: true, providerId: id, requiresRestart: true, restartDeferred: true };
  }

  return {
    read(id, directory, { hasStoredAuth = false } = {}) {
      const { selected, revision } = snapshot(id, directory);
      return {
        providerId: id,
        scope: selected.scope,
        revision,
        config: selected.key ? projectEditable(selected.value) : null,
        credentials: { storedAuth: hasStoredAuth, inline: Boolean(selected.value?.options?.apiKey) },
      };
    },

    save(id, body, directory, { hasStoredAuth = false } = {}) {
      const parsed = update.safeParse(body);
      if (!parsed.success) throw invalid();
      const request = parsed.data;
      // Reject normalized model-key collisions instead of silently dropping a model.
      if (Object.keys(body.config.models).length !== Object.keys(request.config.models).length) throw invalid();
      const current = checked(id, request, directory);
      const existing = current.selected.value ?? {};
      const config = request.config;
      const next = {
        ...existing,
        npm: config.npm,
        name: config.name,
        options: { ...existing.options, baseURL: config.options.baseURL },
        models: Object.fromEntries(Object.entries(config.models).map(([modelID, model]) => [modelID, {
          ...existing.models?.[modelID], name: model.name,
        }])),
      };
      if (config.options.headers) next.options.headers = config.options.headers;
      else delete next.options.headers;

      if (request.credentials === 'environment') {
        if (!config.env?.length) throw invalid();
        next.env = config.env;
        delete next.options.apiKey;
      } else if (request.credentials === 'stored-auth') {
        if (!hasStoredAuth) throw invalid();
        delete next.env;
        delete next.options.apiKey;
      } else if (!hasStoredAuth && !existing.env?.length && !existing.options?.apiKey) {
        throw invalid();
      }

      const { selected } = current;
      const key = selected.key ?? 'provider';
      return commit(id, directory, current, root => {
        const target = { ...root, [key]: { ...root[key], [id]: next } };
        if (Array.isArray(target.disabled_providers)) target.disabled_providers = target.disabled_providers.filter(value => value !== id);
        return target;
      });
    },

    remove(id, body, directory) {
      const parsed = guard.safeParse(body);
      if (!parsed.success) throw invalid();
      const request = parsed.data;
      const current = checked(id, request, directory);
      const { selected } = current;
      if (!selected.key) return { success: true, providerId: id, removed: false, requiresRestart: false, restartDeferred: false };
      const result = commit(id, directory, current, root => {
        const remaining = Object.fromEntries(Object.entries(root[selected.key]).filter(([key]) => key !== id));
        const target = { ...root, [selected.key]: remaining };
        if (Object.keys(remaining).length === 0) delete target[selected.key];
        return target;
      });
      return { ...result, removed: true };
    },
  };
}
