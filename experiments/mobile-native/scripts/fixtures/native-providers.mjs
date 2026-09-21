import { z } from 'zod';
import { validateCustomProviderConfig } from '../../../../packages/web/server/lib/opencode/providers.js';
import { createProviderEditor, ProviderEditorError } from '../../../../packages/web/server/lib/opencode/provider-editor.js';
import { isPlainObject } from '../../../../packages/web/server/lib/opencode/shared.js';

// These values only validate synthetic QA input. No submitted credentials are retained.
const apiInput = z.object({ type: z.literal('api'), key: z.literal('native-qa-key') }).strict();
const oauthInput = z.object({
  method: z.union([z.literal(1), z.literal(2)]),
  inputs: z.object({ account: z.enum(['personal', 'team']), workspace: z.string().optional() }).strict(),
}).strict().refine(value => value.inputs.account !== 'team' || value.inputs.workspace === 'native-qa-team');
const callbackInput = z.object({ method: z.union([z.literal(1), z.literal(2)]), code: z.string().optional() }).strict()
  .refine(value => value.method === 1 ? value.code === undefined : value.code === 'native-qa-code');
const reloadInput = z.object({ reloadMode: z.enum(['managed', 'manual']), simulateRestart: z.boolean().default(false) }).strict();
const catalogControlInput = z.object({ currentBuild: z.boolean().optional(), nativeVariants: z.enum(['standard', 'updated', 'none']).optional() }).strict()
  .refine(value => value.currentBuild !== undefined || value.nativeVariants !== undefined);
const sessionAvailabilityInput = z.object({ sessionId: z.enum(['ses_native_qa', 'ses_visual_18']), available: z.boolean() }).strict();
const projectRegistryInput = z.object({ registered: z.array(z.enum(['native-qa/current', 'native-qa/alternate'])).max(2) }).strict()
  .refine(value => new Set(value.registered).size === value.registered.length);
const fixtureProjects = [
  { id: 'native-qa/current', path: 'C:/IvaldiNativeQA/project', label: 'QA Current project' },
  { id: 'native-qa/alternate', path: 'C:/IvaldiNativeQA/alternate', label: 'QA Alternate project' },
];
const customId = z.string().regex(/^qa-custom-[a-z0-9][a-z0-9-_]*$/);
const fixtureDictionary = (value) => z.preprocess(input => isPlainObject(input) ? Object.entries(input) : null, z.array(z.tuple([z.string(), value])).transform(entries => Object.fromEntries(entries)));
const fixtureConfig = z.object({
  name: z.string().trim().startsWith('QA ').max(200),
  npm: z.enum(['@ai-sdk/openai-compatible', '@ai-sdk/openai', '@ai-sdk/anthropic']).optional(),
  env: z.array(z.literal('NATIVE_QA_API_KEY')).optional(),
  options: z.object({ baseURL: z.url().refine(value => new URL(value).hostname === 'native-qa.invalid'), headers: fixtureDictionary(z.enum(['fixture', 'fixture-updated', '{env:NATIVE_QA_API_KEY}'])).optional() }).strict(),
  models: fixtureDictionary(z.object({ name: z.string().trim().startsWith('QA ').max(200) }).strict()),
}).strict();
const configInput = z.object({ providerID: customId, config: fixtureConfig, scope: z.enum(['user', 'project', 'custom']).default('user') }).strict();
const editorGuard = z.strictObject({ scope: z.enum(['user', 'project', 'custom']), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) });
const editorInput = editorGuard.extend({ credentials: z.enum(['preserve', 'stored-auth', 'environment']), config: fixtureConfig });
const directoryInput = z.string().regex(/^C:\/IvaldiNativeQA(?:\/[a-zA-Z0-9_./-]+)?$/);
const configSeedInput = z.object({ providerID: customId, scope: z.enum(['user', 'project', 'custom']).default('user'), directory: directoryInput.default('C:/IvaldiNativeQA/project'), scenario: z.enum(['ordinary', 'preserved-fields', 'inline-auth', 'unsupported']), apply: z.boolean().default(false) }).strict();
const prompts = [
  { type: 'select', key: 'account', message: 'Fixture account', options: [{ label: 'Personal', value: 'personal' }, { label: 'Team', value: 'team', hint: 'Shows the workspace field' }] },
  { type: 'text', key: 'workspace', message: 'Fixture workspace', placeholder: 'native-qa-team', when: { key: 'account', op: 'eq', value: 'team' } },
];
const methods = {
  qa: [{ type: 'api', label: 'Fixture API key' }],
  'qa-api': [{ type: 'api', label: 'Fixture API key' }],
  'qa-oauth': [{ type: 'api', label: 'Fixture API key' }, { type: 'oauth', label: 'Browser sign-in', prompts }, { type: 'oauth', label: 'Enter a sign-in code', prompts }],
};

export function createProviderFixture({ origin, catalog, answer, body, applyNextControl }) {
  catalog.all.push(
    { id: 'qa-api', name: 'QA API provider', models: { sample: { id: 'sample', name: 'API fixture model', variants: { low: {}, high: {} } } } },
    { id: 'qa-oauth', name: 'QA OAuth provider', models: { sample: { id: 'sample', name: 'OAuth fixture model' } } },
  );
  catalog.default['qa-api'] = 'sample'; catalog.default['qa-oauth'] = 'sample';
  const stored = new Set();
  let appliedStored = new Set();
  const registeredProjects = new Set(fixtureProjects.map(project => project.id));
  const projects = () => fixtureProjects.filter(project => registeredProjects.has(project.id)).map(project => ({ ...project }));
  let currentBuild = true; let nativeVariants = 'standard';
  const alternateSession = { id: 'ses_visual_18', title: 'QA Alternate conversation', directory: fixtureProjects[1].path, model: { providerID: 'qa-custom-alternate', id: 'qa/alternate' }, agent: 'qa-alternate', time: { created: Date.now() - 18, updated: Date.now() - 18 } };
  const unavailableSessions = new Set();
  const sessionAvailable = sessionID => !unavailableSessions.has(sessionID);
  const agents = directory => [
    ...currentBuild || directory !== fixtureProjects[0].path ? [{ name: 'build', mode: 'primary' }] : [],
    { name: 'plan', mode: 'primary' },
    ...directory === fixtureProjects[1].path ? [{ name: 'qa-alternate', mode: 'primary' }] : [],
  ];
  const configs = new Map([['project:C:/IvaldiNativeQA/alternate', { fixtureMarker: true, provider: {
    'qa-custom-alternate': { name: 'QA Alternate provider', npm: '@ai-sdk/openai-compatible', env: ['NATIVE_QA_API_KEY'], options: { baseURL: 'https://native-qa.invalid/alternate' }, models: { 'qa/alternate': { name: 'QA Alternate model' } } },
  } }]]);
  let appliedConfigs = structuredClone(configs);
  const configKey = (scope, directory) => scope === 'project' ? `project:${directory}` : scope;
  const configPath = (scope, directory) => scope === 'project' ? `${directory}/opencode.json` : scope === 'custom' ? 'C:/IvaldiNativeQA/custom-opencode.json' : 'C:/IvaldiNativeQA/opencode.json';
  const layerConfig = (scope, directory) => configs.get(configKey(scope, directory)) ?? { provider: {}, fixtureMarker: true };
  const writerTargets = new Map();
  const editor = createProviderEditor({
    readLayers: directory => {
      const scopes = ['user', 'project', 'custom'];
      for (const scope of scopes) writerTargets.set(configPath(scope, directory), configKey(scope, directory));
      return { userConfig: structuredClone(layerConfig('user', directory)), projectConfig: structuredClone(layerConfig('project', directory)), customConfig: structuredClone(layerConfig('custom', directory)), paths: Object.fromEntries(scopes.map(scope => [`${scope}Path`, configPath(scope, directory)])), layerErrors: [] };
    },
    writeConfig: (config, path) => {
      const target = writerTargets.get(path);
      if (!target || config.fixtureMarker !== true) throw new Error('Invalid fixture config write');
      configs.set(target, structuredClone(config));
    },
  });
  const requestDirectory = (request, url) => directoryInput.parse(request.headers['x-opencode-directory'] || url.searchParams.get('directory') || 'C:/IvaldiNativeQA/project');
  const customCatalog = directory => {
    const merged = new Map();
    for (const scope of ['user', 'project', 'custom']) for (const [id, config] of Object.entries(appliedConfigs.get(configKey(scope, directory))?.provider ?? {})) {
      const previous = merged.get(id);
      merged.set(id, { ...previous, ...config, models: { ...previous?.models, ...config.models }, options: { ...previous?.options, ...config.options, headers: { ...previous?.options.headers, ...config.options.headers } } });
    }
    return [...merged].map(([id, config]) => ({ id, name: config.name, source: 'config', env: config.env ?? [], options: config.options, models: Object.fromEntries(Object.entries(config.models).map(([id, model]) => [id, { id, name: model.name, api: { id, npm: config.npm, url: config.options.baseURL } }])) }));
  };
  const customSources = (provider, directory) => Object.fromEntries(['user', 'project', 'custom'].map(scope => [scope, { exists: Object.hasOwn(layerConfig(scope, directory).provider ?? {}, provider), path: configPath(scope, directory) }]));
  const effectiveCatalog = directory => {
    const custom = customCatalog(directory);
    const base = directory === fixtureProjects[0].path && nativeVariants !== 'standard' ? catalog.all.map(provider => provider.id === 'qa' ? { ...provider, models: { ...provider.models, native: { ...provider.models.native, variants: nativeVariants === 'updated' ? { low: {}, medium: {} } : {} } } } : provider) : catalog.all;
    return { all: [...base, ...custom], connected: [...catalog.connected, ...custom.filter(provider => provider.env.length > 0 || provider.options.apiKey || appliedStored.has(provider.id)).map(provider => provider.id)], default: { ...catalog.default, ...Object.fromEntries(custom.map(provider => [provider.id, Object.keys(provider.models)[0]])) } };
  };
  let authorization = null;
  let reloadMode = 'managed';
  const counts = { catalogReads: 0, agentReads: 0, catalogChanges: 0, registryChanges: 0, sessionAvailabilityChanges: 0, authReads: 0, sourceReads: 0, saves: 0, deletions: 0, authorizations: 0, callbacks: 0, reloads: 0, browserOpens: 0, simulatedRestarts: 0, configReads: 0, configWrites: 0, configDeletes: 0, configSeeds: 0 };
  const catalogDirectories = new Map(); const agentDirectories = new Map();
  const apply = () => { catalog.connected = ['qa', ...[...stored].filter(provider => Object.hasOwn(methods, provider))]; appliedStored = new Set(stored); appliedConfigs = structuredClone(configs); };
  const snapshot = () => ({ ...counts, reloadMode, catalogState: { currentBuild, nativeVariants }, unavailableSessions: [...unavailableSessions].sort(), stored: [...stored].sort(), connected: effectiveCatalog('C:/IvaldiNativeQA/project').connected, pendingAuthorization: authorization?.method ?? null, registeredProjects: [...registeredProjects], catalogDirectories: Object.fromEntries(catalogDirectories), agentDirectories: Object.fromEntries(agentDirectories), configurations: [...configs].flatMap(([scope, root]) => Object.entries(root.provider ?? {}).map(([providerID, config]) => ({ scope, providerID, modelIDs: Object.keys(config.models), extraProviderPreserved: config.fixtureMetadata === true, extraOptionsPreserved: config.options.timeout === 12345, extraModelPreserved: config.models['qa/kept']?.limit?.context === 16384 }))) });
  const known = provider => Object.hasOwn(methods, provider) || customId.safeParse(provider).success;
  const fail = (response, message, status = 400) => answer(response, { error: message }, status);

  async function handlePublic(request, response, url) {
    if (url.pathname === '/__qa/session-availability' && request.method === 'POST') {
      const parsed = sessionAvailabilityInput.safeParse(await body(request, 4096));
      if (!parsed.success) { fail(response, 'Invalid session availability fixture control'); return true; }
      if (parsed.data.available) unavailableSessions.delete(parsed.data.sessionId);
      else unavailableSessions.add(parsed.data.sessionId);
      counts.sessionAvailabilityChanges++;
      answer(response, snapshot()); return true;
    }
    if (url.pathname === '/__qa/catalog' && request.method === 'POST') {
      const parsed = catalogControlInput.safeParse(await body(request, 4096));
      if (!parsed.success) { fail(response, 'Invalid catalog fixture control'); return true; }
      if (parsed.data.currentBuild !== undefined) currentBuild = parsed.data.currentBuild;
      if (parsed.data.nativeVariants !== undefined) nativeVariants = parsed.data.nativeVariants;
      counts.catalogChanges++;
      answer(response, snapshot()); return true;
    }
    if (url.pathname === '/__qa/projects' && request.method === 'POST') {
      const parsed = projectRegistryInput.safeParse(await body(request, 4096));
      if (!parsed.success) { fail(response, 'Invalid project registry fixture control'); return true; }
      registeredProjects.clear();
      for (const id of parsed.data.registered) registeredProjects.add(id);
      counts.registryChanges++;
      answer(response, { projects: projects() }); return true;
    }
    if (url.pathname === '/__qa/provider-config' && request.method === 'POST') {
      const parsed = configSeedInput.safeParse(await body(request, 4096));
      if (!parsed.success) { fail(response, 'Invalid custom-provider fixture seed'); return true; }
      const { providerID, scope, directory, scenario } = parsed.data;
      const config = { name: 'QA Seeded custom provider', npm: '@ai-sdk/openai-compatible', env: ['NATIVE_QA_API_KEY'], options: { baseURL: 'https://native-qa.invalid/v1', headers: { 'X-Native-QA': 'fixture' } }, models: { 'qa/kept': { name: 'QA retained model' }, 'qa/removed': { name: 'QA removable model' } } };
      if (scenario === 'preserved-fields') { config.fixtureMetadata = true; config.options.timeout = 12345; config.models['qa/kept'].limit = { context: 16384, output: 2048 }; }
      if (scenario === 'inline-auth') { delete config.env; config.options.apiKey = 'native-qa-inline'; }
      if (scenario === 'unsupported') config.npm = '@ivaldi/unsupported-fixture';
      const root = layerConfig(scope, directory);
      configs.set(configKey(scope, directory), { ...root, provider: { ...root.provider, [providerID]: config } });
      counts.configSeeds++;
      if (parsed.data.apply) apply();
      answer(response, snapshot()); return true;
    }
    if (url.pathname === '/__qa/providers' && request.method === 'POST') {
      const parsed = reloadInput.safeParse(await body(request, 4096));
      if (!parsed.success) { fail(response, 'Invalid provider fixture controls'); return true; }
      reloadMode = parsed.data.reloadMode;
      if (parsed.data.simulateRestart) { counts.simulatedRestarts++; apply(); }
      answer(response, snapshot()); return true;
    }
    if (url.pathname === '/__qa/provider-login' && request.method === 'GET') {
      counts.browserOpens++;
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      response.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ivaldi provider fixture</title><style>body{font:18px system-ui;margin:32px;max-width:40rem;line-height:1.5}</style><h1>Synthetic sign-in</h1><p>No account was accessed. Return to Ivaldi to complete this test.</p><p>The code for the code flow is <code>native-qa-code</code>.</p></html>'); return true;
    }
    return false;
  }

  async function handle(request, response, url) {
    const path = url.pathname;
    const editorRoute = path.match(/^\/api\/provider\/([^/]+)\/editor$/);
    if (editorRoute) {
      const providerID = decodeURIComponent(editorRoute[1]);
      if (!customId.safeParse(providerID).success) { fail(response, 'Unsupported synthetic editor provider', 404); return true; }
      const directory = requestDirectory(request, url);
      try {
        if (request.method === 'GET') {
          counts.configReads++;
          if (!await applyNextControl('provider-config-read', response)) answer(response, editor.read(providerID, directory, { hasStoredAuth: stored.has(providerID) }));
          return true;
        }
        if (request.method === 'PUT') {
          const parsed = editorInput.safeParse(await body(request, 16384));
          if (!parsed.success) { fail(response, 'Use synthetic editor configuration'); return true; }
          counts.configWrites++;
          if (!await applyNextControl('provider-config-write', response)) answer(response, editor.save(providerID, parsed.data, directory, { hasStoredAuth: stored.has(providerID) }));
          return true;
        }
        if (request.method === 'DELETE') {
          const parsed = editorGuard.safeParse(await body(request, 4096));
          if (!parsed.success) { fail(response, 'Invalid fixture editor deletion'); return true; }
          counts.configDeletes++;
          if (!await applyNextControl('provider-config-delete', response)) answer(response, editor.remove(providerID, parsed.data, directory));
          return true;
        }
        fail(response, 'Unsupported fixture editor action', 405); return true;
      } catch (error) {
        if (!(error instanceof ProviderEditorError)) throw error;
        answer(response, { error: error.message, code: error.code }, error.statusCode); return true;
      }
    }
    if (path === '/api/provider' && request.method === 'GET') {
      counts.catalogReads++;
      const directory = requestDirectory(request, url);
      catalogDirectories.set(directory, (catalogDirectories.get(directory) ?? 0) + 1);
      if (!await applyNextControl('provider-list', response)) answer(response, effectiveCatalog(directory));
      return true;
    }
    if (path === '/api/agent' && request.method === 'GET') {
      counts.agentReads++;
      const directory = requestDirectory(request, url);
      agentDirectories.set(directory, (agentDirectories.get(directory) ?? 0) + 1);
      if (!await applyNextControl('agent-list', response)) answer(response, agents(directory));
      return true;
    }
    if (path === '/api/provider' && request.method === 'PUT') {
      const parsed = configInput.safeParse(await body(request, 16384));
      if (!parsed.success) { fail(response, 'Use synthetic custom-provider configuration'); return true; }
      const { providerID, config, scope } = parsed.data;
      const validated = validateCustomProviderConfig(providerID, config, { hasStoredAuth: stored.has(providerID) });
      if (!validated.ok) { fail(response, 'Invalid custom-provider configuration'); return true; }
      const directory = requestDirectory(request, url);
      counts.configWrites++;
      if (await applyNextControl('provider-config-write', response)) return true;
      const key = configKey(scope, directory);
      const root = layerConfig(scope, directory);
      configs.set(key, { ...root, provider: { ...root.provider, [providerID]: validated.value.config } });
      answer(response, { success: true, requiresReload: false, requiresRestart: true, restartDeferred: true, message: 'Fixture provider saved. Apply to update active models.', providerId: providerID, path: configPath(scope, directory), config: validated.value.config });
      return true;
    }
    if (path === '/api/provider/auth' && request.method === 'GET') {
      counts.authReads++;
      if (!await applyNextControl('provider-auth', response)) answer(response, methods);
      return true;
    }
    if (path === '/api/config/reload' && request.method === 'POST') {
      counts.reloads++;
      if (await applyNextControl('provider-reload', response)) return true;
      if (reloadMode === 'manual') answer(response, { success: true, requiresReload: false, requiresManualRestart: true, message: 'Restart the connected fixture server to apply saved changes.' });
      else { apply(); answer(response, { success: true, requiresReload: true, reloadDelayMs: 0, message: 'Fixture configuration reloaded.' }); }
      return true;
    }
    const save = path.match(/^\/api\/auth\/([^/]+)$/);
    if (save && request.method === 'PUT') {
      const provider = decodeURIComponent(save[1]);
      if (!known(provider) || provider === 'qa') { fail(response, 'Unsupported fixture provider', 404); return true; }
      const parsed = apiInput.safeParse(await body(request, 4096));
      if (!parsed.success) { fail(response, 'Use the synthetic fixture API key'); return true; }
      counts.saves++;
      if (await applyNextControl('provider-save', response)) return true;
      stored.add(provider); answer(response, true); return true;
    }
    const route = path.match(/^\/api\/provider\/([^/]+)\/(source|auth|oauth\/authorize|oauth\/callback)$/);
    if (!route) return false;
    const provider = decodeURIComponent(route[1]); const action = route[2];
    if (!known(provider)) { fail(response, 'Unknown fixture provider', 404); return true; }
    if (action === 'source' && request.method === 'GET') {
      counts.sourceReads++;
      const directory = requestDirectory(request, url);
      const sources = customId.safeParse(provider).success ? customSources(provider, directory) : { user: { exists: provider === 'qa', path: 'C:/IvaldiNativeQA/opencode.json' }, project: { exists: false, path: null }, custom: { exists: false, path: null } };
      if (!await applyNextControl('provider-source', response)) answer(response, { providerId: provider, sources: { auth: { exists: stored.has(provider) }, ...sources } });
      return true;
    }
    if (action === 'auth' && request.method === 'DELETE') {
      const scope = url.searchParams.get('scope') ?? 'auth';
      if (customId.safeParse(provider).success && ['user', 'project', 'custom', 'all'].includes(scope)) {
        const directory = requestDirectory(request, url);
        counts.configDeletes++;
        if (await applyNextControl('provider-config-delete', response)) return true;
        let removed = scope === 'all' && stored.delete(provider);
        for (const target of scope === 'all' ? ['user', 'project', 'custom'] : [scope]) {
          const root = layerConfig(target, directory);
          if (Object.hasOwn(root.provider ?? {}, provider)) { delete root.provider[provider]; removed = true; }
        }
        answer(response, removed
          ? { success: true, removed: true, requiresReload: false, requiresRestart: true, restartDeferred: true, message: 'Fixture configuration removed. Apply to update active models.' }
          : { success: true, removed: false, requiresReload: false, message: 'Provider was not connected' });
        return true;
      }
      if (url.searchParams.get('scope') !== 'auth' || provider === 'qa') { fail(response, 'Fixture deletion supports stored auth only'); return true; }
      counts.deletions++;
      if (await applyNextControl('provider-delete', response)) return true;
      const removed = stored.delete(provider);
      if (provider === 'qa-oauth') authorization = null;
      answer(response, removed
        ? { success: true, removed, requiresReload: false, requiresRestart: true, restartDeferred: true, message: 'Fixture credentials removed. Apply to update active models.' }
        : { success: true, removed, requiresReload: false, message: 'Provider was not connected' });
      return true;
    }
    if (action === 'oauth/authorize' && request.method === 'POST' && provider === 'qa-oauth') {
      const parsed = oauthInput.safeParse(await body(request, 4096));
      if (!parsed.success) { fail(response, 'Invalid synthetic sign-in inputs'); return true; }
      counts.authorizations++;
      if (await applyNextControl('provider-authorize', response)) return true;
      authorization = { method: parsed.data.method };
      answer(response, { url: `${origin}/__qa/provider-login`, method: parsed.data.method === 1 ? 'auto' : 'code', instructions: parsed.data.method === 1 ? 'Return to Ivaldi after the synthetic sign-in page opens.' : 'Enter native-qa-code from the synthetic sign-in page.' });
      return true;
    }
    if (action === 'oauth/callback' && request.method === 'POST' && provider === 'qa-oauth') {
      const parsed = callbackInput.safeParse(await body(request, 4096));
      if (!parsed.success || authorization?.method !== parsed.data.method) { fail(response, 'Start the matching synthetic sign-in first'); return true; }
      counts.callbacks++;
      const pending = authorization;
      if (await applyNextControl('provider-callback', response)) return true;
      if (authorization !== pending) { fail(response, 'Synthetic sign-in was replaced'); return true; }
      stored.add(provider); authorization = null; answer(response, true); return true;
    }
    fail(response, 'Unsupported provider fixture action', 405); return true;
  }

  return { handle, handlePublic, snapshot, catalog: effectiveCatalog, projects, agents, alternateSession, sessionAvailable };
}
