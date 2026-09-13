import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatCatalogDirectory, ModelCatalogRefresh } from './model-refresh.ts';
import type { ChatState } from './chat.ts';
import type { ModelChoice } from './schema.ts';

const original: ModelChoice = { providerID: 'old', id: 'model', provider: 'Old', name: 'Original model', variants: ['high'] };
const available: ModelChoice = { providerID: 'new', id: 'model/new', provider: 'New', name: 'New model', variants: ['low'] };
type CatalogAccess = ConstructorParameters<typeof ModelCatalogRefresh>[0];
type Selection = ReturnType<CatalogAccess['getSelection']>;

function fixture(reads: Pick<CatalogAccess, 'readModels' | 'readAgents'> = {
  readModels: async () => ({ models: [available], defaults: { new: available.id } }), readAgents: async () => ['plan'],
}) {
  let state: Pick<ChatState, 'activeId' | 'model' | 'agent' | 'models' | 'agents' | 'modelCatalog' | 'agentCatalog' | 'drafts' | 'sessions' | 'sessionChoices' | 'favorites' | 'draftDirectory'> & { revision: number; scopeRevision: number; directory: string | null | undefined } = {
    activeId: 'saved-chat', model: { providerID: original.providerID, modelID: original.id, variant: 'high' }, agent: 'build', models: [original], agents: ['build'], revision: 0,
    drafts: { 'saved-chat': { text: 'Unsent question', attachments: [{ uri: 'file:///picked.png', name: 'picked.png', mime: 'image/png', size: 12 }] } },
    sessions: [{ id: 'saved-chat', title: 'Saved chat', directory: '/work/project', time: { created: 1, updated: 2 } }],
    sessionChoices: { 'saved-chat': { model: { providerID: original.providerID, modelID: original.id, variant: 'high' }, agent: 'build' } },
    favorites: ['old/model'], draftDirectory: '/work/project', directory: '/work/project', scopeRevision: 0,
    modelCatalog: { status: 'ready', available: true }, agentCatalog: { status: 'ready', available: true },
  };
  const modelPublications: ModelChoice[][] = [];
  const refresh = new ModelCatalogRefresh({
    ...reads,
    getSelection: () => state,
    publish: patch => { if ('models' in patch && patch.models) modelPublications.push(patch.models); state = { ...state, ...patch }; },
  });
  return {
    refresh, get: () => state, modelPublications,
    select: (patch: Partial<Omit<Selection, 'revision' | 'scopeRevision'>>) => {
      const directory = 'directory' in patch ? patch.directory : state.directory;
      const scopeChanged = directory !== state.directory;
      state = { ...state, ...patch, scopeRevision: state.scopeRevision + Number(scopeChanged), revision: state.revision + 1 };
      if (scopeChanged) state = { ...state, modelCatalog: { status: 'unavailable', available: false }, agentCatalog: { status: 'unavailable', available: false } };
    },
  };
}

test('explicit catalog refresh preserves active chat, unavailable choices, drafts and attachments', async () => {
  const value = fixture();
  const before = value.get();
  await value.refresh.refresh();
  const after = value.get();
  assert.deepEqual(after.models, [available]);
  assert.deepEqual(after.agents, ['plan']);
  for (const key of ['activeId', 'model', 'agent', 'drafts', 'sessions', 'sessionChoices', 'favorites', 'draftDirectory'] as const) assert.strictEqual(after[key], before[key]);
});

test('refresh also preserves an explicit new-draft choice or an unset selection', async () => {
  const value = fixture();
  value.select({ activeId: null });
  const selected = value.get().model;
  await value.refresh.refresh();
  assert.strictEqual(value.get().model, selected);
  assert.equal(value.get().agent, 'build');
  value.select({ model: null, agent: '' });
  await value.refresh.refresh();
  assert.equal(value.get().model, null);
  assert.equal(value.get().agent, '');
});

test('model read failure preserves its preceding catalog while a valid agent read commits', async () => {
  const value = fixture({ readModels: async () => { throw new Error('Provider read failed'); }, readAgents: async () => ['plan'] });
  const before = value.get();
  await assert.rejects(value.refresh.refresh(), /Provider read failed/);
  assert.strictEqual(value.get().models, before.models);
  assert.strictEqual(value.get().model, before.model);
  assert.deepEqual(value.get().agents, ['plan']);
  assert.equal(value.get().agent, before.agent);
});

test('agent read failure does not discard a complete model catalog', async () => {
  const value = fixture({ readModels: async () => ({ models: [available], defaults: {} }), readAgents: async () => { throw new Error('Agent read failed'); } });
  const before = value.get();
  await assert.rejects(value.refresh.refresh(), /Agent read failed/);
  assert.deepEqual(value.get().models, [available]);
  assert.strictEqual(value.get().agents, before.agents);
  assert.strictEqual(value.get().model, before.model);
});

test('successful empty catalogs are authoritative without clearing saved choices', async () => {
  const value = fixture({ readModels: async () => ({ models: [], defaults: {} }), readAgents: async () => [] });
  const before = value.get();
  await value.refresh.refresh();
  assert.deepEqual(value.get().models, []);
  assert.deepEqual(value.get().agents, []);
  assert.strictEqual(value.get().model, before.model);
  assert.equal(value.get().agent, before.agent);
});

test('a refresh after backend reload reads again rather than joining the preceding request', async () => {
  const firstRead = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  let reads = 0;
  const value = fixture({ readModels: () => ++reads === 1 ? firstRead.promise : Promise.resolve({ models: [available], defaults: {} }), readAgents: async () => ['build'] });
  const first = value.refresh.initialize();
  await Promise.resolve();
  await Promise.resolve();
  const second = value.refresh.refresh();
  await Promise.resolve();
  assert.equal(reads, 1);
  firstRead.resolve({ models: [original], defaults: {} });
  await Promise.all([first, second]);
  assert.equal(reads, 2);
  assert.deepEqual(value.modelPublications, [[original], [available]]);
  assert.deepEqual(value.get().models, [available]);
});

test('a failed catalog refresh does not block a queued fresh attempt', async () => {
  let reads = 0;
  const value = fixture({ readModels: async () => { if (++reads === 1) throw new Error('Reloading'); return { models: [available], defaults: {} }; }, readAgents: async () => ['plan'] });
  const first = assert.rejects(value.refresh.refresh(), /Reloading/);
  const second = value.refresh.refresh();
  await Promise.all([first, second]);
  assert.equal(reads, 2);
  assert.deepEqual(value.get().models, [available]);
});

test('disposal rejects late results and prevents queued reads from reaching the old runtime', async () => {
  const pending = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const agents = Promise.withResolvers<string[]>();
  let reads = 0;
  const value = fixture({ readModels: () => { reads++; return pending.promise; }, readAgents: () => agents.promise });
  const first = assert.rejects(value.refresh.refresh(), /closed/);
  await Promise.resolve();
  await Promise.resolve();
  const second = assert.rejects(value.refresh.refresh(), /closed/);
  value.refresh.dispose();
  pending.resolve({ models: [available], defaults: {} });
  agents.resolve(['plan']);
  await Promise.all([first, second]);
  assert.equal(reads, 1);
  assert.deepEqual(value.get().models, [original]);
  assert.deepEqual(value.get().agents, ['build']);
  assert.equal(value.modelPublications.length, 0);
  await assert.rejects(value.refresh.refresh(), /closed/);
  assert.equal(reads, 1);
});

test('startup preserves existing-chat choices even when both catalogs omit them', async () => {
  const value = fixture();
  const before = value.get();
  await value.refresh.initialize();
  assert.strictEqual(value.get().model, before.model);
  assert.equal(value.get().agent, before.agent);
});

test('startup keeps its model default and build-agent fallback for an untouched new draft', async () => {
  const value = fixture({ readModels: async () => ({ models: [original, available], defaults: { new: available.id } }), readAgents: async () => ['plan', 'build'] });
  value.select({ activeId: null, model: null, agent: '' });
  await value.refresh.initialize();
  assert.deepEqual(value.get().model, { providerID: available.providerID, modelID: available.id, variant: undefined });
  assert.equal(value.get().agent, 'build');
});

test('startup retains a matching model variant and available selected agent', async () => {
  const value = fixture({ readModels: async () => ({ models: [original, available], defaults: { new: available.id } }), readAgents: async () => ['plan', 'build'] });
  value.select({ activeId: null, agent: 'plan' });
  const before = value.get();
  await value.refresh.initialize();
  assert.deepEqual(value.get().model, before.model);
  assert.equal(value.get().agent, 'plan');
});

test('navigation or manual choices made during startup are not replaced by late fallback selection', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const agents = Promise.withResolvers<string[]>();
  const value = fixture({ readModels: () => models.promise, readAgents: () => agents.promise });
  value.select({ activeId: null, model: null, agent: '' });
  const loading = value.refresh.initialize();
  await Promise.resolve();
  await Promise.resolve();
  value.select({ model: { providerID: 'manual', modelID: 'choice', variant: 'custom' }, agent: 'manual-agent' });
  const before = value.get();
  models.resolve({ models: [available], defaults: { new: available.id } });
  agents.resolve(['build']);
  await loading;
  assert.strictEqual(value.get().model, before.model);
  assert.equal(value.get().agent, before.agent);
  assert.deepEqual(value.get().models, [available]);
});

test('both catalog requests receive one captured chat directory', async () => {
  const directories: Array<string | undefined> = [];
  const value = fixture({
    readModels: async directory => { directories.push(directory); return { models: [available], defaults: {} }; },
    readAgents: async directory => { directories.push(directory); return ['plan']; },
  });
  await value.refresh.refresh();
  assert.deepEqual(directories, ['/work/project', '/work/project']);
  value.select({ activeId: null, directory: undefined });
  await value.refresh.refresh();
  assert.deepEqual(directories, ['/work/project', '/work/project', undefined, undefined]);
});

test('unresolved saved session scope cannot load the host default catalog', async () => {
  let reads = 0;
  const value = fixture({
    readModels: async () => { reads++; return { models: [], defaults: {} }; },
    readAgents: async () => { reads++; return []; },
  });
  value.select({ directory: null });
  await assert.rejects(value.refresh.initialize(), /directory/);
  assert.equal(reads, 0);
  assert.deepEqual(value.get().models, [original]);
});

test('late catalogs from an old directory cannot publish after navigation', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const agents = Promise.withResolvers<string[]>();
  const value = fixture({ readModels: () => models.promise, readAgents: () => agents.promise });
  const loading = assert.rejects(value.refresh.refresh(), /scope/);
  await Promise.resolve();
  await Promise.resolve();
  value.select({ directory: '/work/other', activeId: 'other-chat' });
  models.resolve({ models: [available], defaults: {} });
  agents.resolve(['plan']);
  await loading;
  assert.deepEqual(value.get().models, [original]);
  assert.deepEqual(value.get().agents, ['build']);
});

test('leaving and returning to the same directory invalidates its preceding read', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const value = fixture({ readModels: () => models.promise, readAgents: async () => ['build'] });
  const loading = assert.rejects(value.refresh.refresh(), /scope/);
  await Promise.resolve();
  await Promise.resolve();
  value.select({ directory: '/work/other' });
  value.select({ directory: '/work/project' });
  models.resolve({ models: [available], defaults: {} });
  await loading;
  assert.deepEqual(value.get().models, [original]);
});

test('queued obsolete scopes never reach the SDK and current scope refresh recovers', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const directories: Array<string | undefined> = [];
  const value = fixture({
    readModels: directory => { directories.push(directory); return directories.length === 1 ? models.promise : Promise.resolve({ models: [available], defaults: {} }); },
    readAgents: async () => ['plan'],
  });
  const first = assert.rejects(value.refresh.refresh(), /scope/);
  await Promise.resolve();
  await Promise.resolve();
  value.select({ directory: '/work/intermediate' });
  const obsolete = assert.rejects(value.refresh.refresh(), /scope/);
  value.select({ directory: '/work/final' });
  const current = value.refresh.refresh();
  models.resolve({ models: [original], defaults: {} });
  await Promise.all([first, obsolete, current]);
  assert.deepEqual(directories, ['/work/project', '/work/final']);
  assert.deepEqual(value.get().models, [available]);
});

test('catalog scope follows the selected session record before the draft target', () => {
  const sessions = [{ id: 'active', directory: '/work/actual' }, { id: 'other', directory: '/work/other' }];
  assert.equal(chatCatalogDirectory({ activeId: 'active', draftDirectory: '/work/stale-draft', sessions }), '/work/actual');
  assert.equal(chatCatalogDirectory({ activeId: 'unresolved', draftDirectory: '/work/stale-draft', sessions }), null);
  assert.equal(chatCatalogDirectory({ activeId: null, draftDirectory: '/work/new-draft', sessions }), '/work/new-draft');
  assert.equal(chatCatalogDirectory({ activeId: null, draftDirectory: null, sessions }), undefined);
});

test('navigation within the same directory does not reject its valid catalog', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const value = fixture({ readModels: () => models.promise, readAgents: async () => ['plan'] });
  const loading = value.refresh.refresh();
  await Promise.resolve();
  await Promise.resolve();
  value.select({ activeId: 'other-chat', model: null, agent: 'custom' });
  models.resolve({ models: [available], defaults: {} });
  await loading;
  assert.deepEqual(value.get().models, [available]);
  assert.equal(value.get().activeId, 'other-chat');
  assert.equal(value.get().model, null);
  assert.equal(value.get().agent, 'custom');
});

test('target catalog reads use the requested directory without publishing into chat', async () => {
  const directories: Array<string | undefined> = [];
  const value = fixture({
    readModels: async directory => { directories.push(directory); return { models: [available], defaults: {} }; },
    readAgents: async directory => { directories.push(directory); return ['plan']; },
  });
  const before = value.get();
  assert.deepEqual(await value.refresh.readForDirectory('/work/new-chat'), { models: [available], agents: ['plan'] });
  assert.deepEqual(directories, ['/work/new-chat', '/work/new-chat']);
  assert.strictEqual(value.get(), before);
});

test('target catalog reads require both authoritative responses and preserve chat on failure', async () => {
  for (const failed of ['models', 'agents']) {
    const value = fixture({
      readModels: async () => { if (failed === 'models') throw new Error('Models unavailable'); return { models: [available], defaults: {} }; },
      readAgents: async () => { if (failed === 'agents') throw new Error('Agents unavailable'); return ['plan']; },
    });
    const before = value.get();
    await assert.rejects(value.refresh.readForDirectory('/work/new-chat'), /unavailable/);
    assert.strictEqual(value.get(), before);
  }
});

test('a successful empty target catalog remains an authoritative result', async () => {
  const value = fixture({ readModels: async () => ({ models: [], defaults: {} }), readAgents: async () => [] });
  assert.deepEqual(await value.refresh.readForDirectory(undefined), { models: [], agents: [] });
  assert.deepEqual(value.get().models, [original]);
});

test('late target catalog reads cannot escape a disposed runtime', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  let reads = 0;
  const value = fixture({ readModels: () => { reads++; return models.promise; }, readAgents: async () => ['plan'] });
  const before = value.get();
  const result = assert.rejects(value.refresh.readForDirectory('/work/new-chat'), /closed/);
  value.refresh.dispose();
  models.resolve({ models: [available], defaults: {} });
  await result;
  await assert.rejects(value.refresh.readForDirectory('/work/next'), /closed/);
  assert.equal(reads, 1);
  assert.strictEqual(value.get(), before);
});

test('scope change immediately makes retained preceding catalogs unavailable', () => {
  const value = fixture();
  const before = value.get();
  value.select({ directory: '/work/next' });
  assert.deepEqual(value.get().modelCatalog, { status: 'unavailable', available: false });
  assert.deepEqual(value.get().agentCatalog, { status: 'unavailable', available: false });
  assert.strictEqual(value.get().models, before.models);
  assert.strictEqual(value.get().agents, before.agents);
  assert.strictEqual(value.get().model, before.model);
  assert.equal(value.get().agent, before.agent);
});

test('new-scope loading and failure cannot make the preceding model choices selectable', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const agents = Promise.withResolvers<string[]>();
  const value = fixture({ readModels: () => models.promise, readAgents: () => agents.promise });
  value.select({ directory: '/work/next' });
  const loading = assert.rejects(value.refresh.refresh(), /Models unavailable/);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(value.get().modelCatalog, { status: 'loading', available: false });
  assert.deepEqual(value.get().agentCatalog, { status: 'loading', available: false });
  agents.resolve(['plan']);
  models.reject(new Error('Models unavailable'));
  await loading;
  assert.deepEqual(value.get().modelCatalog, { status: 'error', available: false });
  assert.deepEqual(value.get().agentCatalog, { status: 'ready', available: true });
  assert.deepEqual(value.get().models, [original]);
  assert.deepEqual(value.get().agents, ['plan']);
});

test('a complete model response remains available when the new-scope agent read fails', async () => {
  const value = fixture({ readModels: async () => ({ models: [available], defaults: {} }), readAgents: async () => { throw new Error('Agents unavailable'); } });
  value.select({ directory: '/work/next' });
  await assert.rejects(value.refresh.refresh(), /Agents unavailable/);
  assert.deepEqual(value.get().modelCatalog, { status: 'ready', available: true });
  assert.deepEqual(value.get().agentCatalog, { status: 'error', available: false });
  assert.deepEqual(value.get().models, [available]);
  assert.deepEqual(value.get().agents, ['build']);
});

test('same-scope refresh failure retains usable preceding choices and retry clears the error', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const agents = Promise.withResolvers<string[]>();
  let reads = 0;
  const value = fixture({
    readModels: () => ++reads === 1 ? models.promise : Promise.resolve({ models: [available], defaults: {} }),
    readAgents: () => reads === 1 ? agents.promise : Promise.resolve(['plan']),
  });
  const loading = assert.rejects(value.refresh.refresh(), /Models unavailable/);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(value.get().modelCatalog, { status: 'loading', available: true });
  assert.deepEqual(value.get().agentCatalog, { status: 'loading', available: true });
  models.reject(new Error('Models unavailable'));
  agents.reject(new Error('Agents unavailable'));
  await loading;
  assert.deepEqual(value.get().modelCatalog, { status: 'error', available: true });
  assert.deepEqual(value.get().agentCatalog, { status: 'error', available: true });
  await value.refresh.refresh();
  assert.deepEqual(value.get().modelCatalog, { status: 'ready', available: true });
  assert.deepEqual(value.get().agentCatalog, { status: 'ready', available: true });
});

test('authoritative empty catalogs are ready while unresolved scope errors settle unavailable', async () => {
  const value = fixture({ readModels: async () => ({ models: [], defaults: {} }), readAgents: async () => [] });
  value.select({ directory: '/work/empty' });
  await value.refresh.refresh();
  assert.deepEqual(value.get().modelCatalog, { status: 'ready', available: true });
  assert.deepEqual(value.get().agentCatalog, { status: 'ready', available: true });
  assert.deepEqual(value.get().models, []);
  value.select({ directory: null });
  await assert.rejects(value.refresh.initialize(), /directory/);
  assert.deepEqual(value.get().modelCatalog, { status: 'error', available: false });
  assert.deepEqual(value.get().agentCatalog, { status: 'error', available: false });
});

test('old-scope success and failure cannot replace current availability state', async () => {
  const models = Promise.withResolvers<Awaited<ReturnType<CatalogAccess['readModels']>>>();
  const agents = Promise.withResolvers<string[]>();
  const value = fixture({ readModels: () => models.promise, readAgents: () => agents.promise });
  const loading = assert.rejects(value.refresh.refresh(), /scope/);
  await Promise.resolve();
  await Promise.resolve();
  value.select({ directory: '/work/next' });
  const before = value.get();
  models.resolve({ models: [available], defaults: {} });
  agents.reject(new Error('Old agents unavailable'));
  await loading;
  assert.strictEqual(value.get(), before);
});
