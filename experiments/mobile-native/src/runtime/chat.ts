import { z } from 'zod';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FilePartInput, TextPartInput } from '@opencode-ai/sdk/v2';
import { File } from 'expo-file-system';
import type { NativeRuntime } from './connection';
import { agentSchema, eventSchema, homeSchema, messagesSchema, permissionSchema, providersSchema, questionSchema, sessionSchema, statusMapSchema, type Message, type ModelChoice, type ModelSelection, type Permission, type Question, type RuntimeEvent, type Session, type SessionStatus } from './schema';
import { applyMessageEvent, eventSessionId, reconcileHistory, upsertSession } from './conversations';
import { serializeWrite } from './storage';
import { loadCompleteSessionList, recoveredDraftState, resolveSelectedSession, sessionSendError, type SessionRecovery } from './session-recovery';
import { chatSelectionSchema, rememberChatChoice, restoreChatChoices, sessionChatChoice, type ChatChoice } from './chat-choices';
import { chatCatalogDirectory, ModelCatalogRefresh, type CatalogAvailability } from './model-refresh';

const attachmentSchema = z.object({ uri: z.string(), name: z.string(), mime: z.string(), size: z.number() });
export type Attachment = z.infer<typeof attachmentSchema>;
const draftSchema = z.object({ text: z.string(), attachments: z.array(attachmentSchema) });
export type Draft = z.infer<typeof draftSchema>;
const preferencesSchema = chatSelectionSchema.extend({ drafts: z.record(z.string(), draftSchema), mode: z.enum(['work', 'developer']), favorites: z.array(z.string()), draftDirectory: z.string().nullable().default(null) }).transform(saved => {
  const sessionChoices = restoreChatChoices(saved);
  return { ...saved, ...sessionChoices[saved.activeId ?? 'new'], sessionChoices };
});
type Preferences = z.infer<typeof preferencesSchema>;
export const emptyDraft: Draft = { text: '', attachments: [] };
type Submission = { sessionId: string; messageId: string; draft: Draft; state: 'sending' | 'uncertain' };
export type ChatState = Preferences & {
  sessions: Session[]; activeId: string | null; messages: ReadonlyMap<string, Message[]>;
  models: ModelChoice[]; agents: string[]; statuses: ReadonlyMap<string, SessionStatus>;
  modelCatalog: CatalogAvailability; agentCatalog: CatalogAvailability;
  permissions: Permission[]; questions: Question[]; submission: Submission | null;
  sessionRecovery: SessionRecovery | null; recoveringDraft: boolean;
  loading: boolean; preferencesReady: boolean; loadingHistory: string | null; hasMoreHistory: ReadonlyMap<string, boolean>; stream: 'connecting' | 'live' | 'offline';
  error: 'load' | 'send' | 'uncertain' | 'stop' | 'attachment' | 'storage' | 'action' | 'sessionMissing' | null;
};

export class ChatController {
  private state: ChatState = { drafts: {}, model: null, mode: 'work', agent: '', sessionChoices: {}, favorites: [], sessions: [], activeId: null, draftDirectory: null, messages: new Map(), models: [], agents: [], modelCatalog: { status: 'unavailable', available: false }, agentCatalog: { status: 'unavailable', available: false }, statuses: new Map(), permissions: [], questions: [], submission: null, sessionRecovery: null, recoveringDraft: false, loading: true, preferencesReady: false, loadingHistory: null, hasMoreHistory: new Map(), stream: 'connecting', error: null };
  private listeners = new Set<() => void>();
  private disposed = false;
  private streamAbort: AbortController | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private historyLoads = new Map<string, { events: RuntimeEvent[]; promise: Promise<void> }>();
  private sessionMutations: RuntimeEvent[] | null = null;
  private seenEvents = new Set<string>();
  private streamGeneration = 0;
  private preferencesRevision = 0;
  private selectionRevision = 0;
  private catalogScopeRevision = 0;
  private recoveryRevision = 0;
  private listPromise: Promise<void> | null = null;
  private liveRevisions = new Map<string, number>();
  private statusRevisions = new Map<string, number>();
  private historyLimits = new Map<string, number>();
  private readonly persistenceKey;
  private readonly modelCatalog: ModelCatalogRefresh;
  constructor(readonly runtime: NativeRuntime) {
    this.persistenceKey = `ivaldi.native.chat.v1.${runtime.connection.id}`;
    this.modelCatalog = new ModelCatalogRefresh({
      readModels: async directory => {
        const providers = providersSchema.parse((await this.runtime.sdk.provider.list({ directory }, { throwOnError: true })).data);
        const models = providers.all.filter(provider => providers.connected.includes(provider.id)).flatMap(provider => Object.values(provider.models).map(model => ({ id: model.id, providerID: provider.id, provider: provider.name, name: model.name, variants: Object.keys(model.variants ?? {}) })));
        return { models, defaults: providers.default };
      },
      readAgents: async directory => z.array(agentSchema).parse((await this.runtime.sdk.app.agents({ directory }, { throwOnError: true })).data).filter(agent => !agent.hidden && agent.mode !== 'subagent').map(agent => agent.name),
      getSelection: () => ({ activeId: this.state.activeId, model: this.state.model, agent: this.state.agent, revision: this.selectionRevision, directory: chatCatalogDirectory(this.state), scopeRevision: this.catalogScopeRevision, modelCatalog: this.state.modelCatalog, agentCatalog: this.state.agentCatalog }),
      publish: patch => this.publish(patch),
    });
  }
  getSnapshot = () => this.state;
  getChatSelectionRevision = () => this.selectionRevision;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<ChatState>, coalesce = false) {
    if (this.disposed) return;
    const mayChangeScope = 'activeId' in patch || 'draftDirectory' in patch || 'sessions' in patch;
    const precedingDirectory = mayChangeScope ? chatCatalogDirectory(this.state) : undefined;
    this.state = { ...this.state, ...patch };
    const scopeChanged = mayChangeScope && precedingDirectory !== chatCatalogDirectory(this.state);
    if (scopeChanged) {
      this.catalogScopeRevision++;
      this.state = { ...this.state, modelCatalog: { status: 'unavailable', available: false }, agentCatalog: { status: 'unavailable', available: false } };
    }
    if (coalesce) {
      if (!this.publishTimer) this.publishTimer = setTimeout(() => { this.publishTimer = null; this.listeners.forEach(listener => listener()); }, 32);
    } else { if (this.publishTimer) clearTimeout(this.publishTimer); this.publishTimer = null; this.listeners.forEach(listener => listener()); }
    if (scopeChanged && !this.state.loading && chatCatalogDirectory(this.state) !== null) {
      const revision = this.catalogScopeRevision;
      void this.refreshModels().catch(() => { if (revision === this.catalogScopeRevision) this.publish({ error: 'load' }); });
    }
  }
  async start() {
    const revision = this.preferencesRevision;
    try {
      // The preceding controller flushes on disposal. Its queued draft write
      // must finish before a replacement for this saved connection hydrates.
      let raw: string | null = null;
      await serializeWrite(async () => { raw = await AsyncStorage.getItem(this.persistenceKey); });
      const saved = raw === null ? null : preferencesSchema.parse(JSON.parse(raw));
      this.publish({ ...(revision === this.preferencesRevision ? saved : null), preferencesReady: true });
    } catch { this.publish({ error: 'storage' }); }
    if (this.disposed) return;
    void this.resume();
    await this.loadInitialData();
    this.publish({ loading: false });
  }
  private persist() {
    this.preferencesRevision++;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => { this.persistTimer = null; void this.flushPreferences(); }, 250);
  }
  async flushPreferences() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (!this.state.preferencesReady) return false;
    try {
      await serializeWrite(() => {
        // Read when this write runs, after any queued Mode commit has completed.
        const { drafts, model, mode, agent, favorites, activeId, draftDirectory, sessionChoices } = this.state;
        return AsyncStorage.setItem(this.persistenceKey, JSON.stringify({ drafts, model, mode, agent, favorites, activeId, draftDirectory, sessionChoices }));
      });
      if (this.state.error === 'storage') this.publish({ error: null });
      return true;
    } catch { this.publish({ error: 'storage' }); return false; }
  }
  setDraft(draft: Draft) { const key = this.state.activeId ?? 'new'; this.publish({ drafts: { ...this.state.drafts, [key]: draft } }); this.persist(); }
  async setMode(mode: Preferences['mode']) {
    if (!this.state.preferencesReady || this.disposed) throw new Error('Preferences are not ready');
    try {
      await serializeWrite(async () => {
        const { drafts, model, agent, favorites, activeId, draftDirectory, sessionChoices } = this.state;
        await AsyncStorage.setItem(this.persistenceKey, JSON.stringify({ drafts, model, mode, agent, favorites, activeId, draftDirectory, sessionChoices }));
        this.preferencesRevision++;
        // dispose() queues a final flush. Keep its snapshot current even after
        // listeners detach, otherwise that flush would restore the previous mode.
        if (this.disposed) this.state = { ...this.state, mode };
        else this.publish({ mode, error: this.state.error === 'storage' ? null : this.state.error });
      });
    } catch (error) { this.publish({ error: 'storage' }); throw error; }
  }
  setDraftDirectory(draftDirectory: string | null) { this.selectionRevision++; this.publish({ draftDirectory }); this.persist(); }
  setModel(model: ModelSelection) {
    if (!this.state.modelCatalog.available || !this.state.models.some(choice => choice.id === model.modelID && choice.providerID === model.providerID)) return;
    this.selectionRevision++; this.publish({ model, sessionChoices: rememberChatChoice(this.state.sessionChoices, this.state.activeId, { model, agent: this.state.agent }) }); this.persist();
  }
  setAgent(agent: string) {
    if (!this.state.agentCatalog.available || !this.state.agents.includes(agent)) return;
    this.selectionRevision++; this.publish({ agent, sessionChoices: rememberChatChoice(this.state.sessionChoices, this.state.activeId, { model: this.state.model, agent }) }); this.persist();
  }
  startNewChat(directory: string | undefined, defaults: ChatChoice) {
    if (this.disposed || this.state.loading || !this.state.preferencesReady) return false;
    this.selectionRevision++;
    this.recoveryRevision++;
    const sessionChoices = rememberChatChoice(rememberChatChoice(this.state.sessionChoices, this.state.activeId, { model: this.state.model, agent: this.state.agent }), null, defaults);
    this.publish({ activeId: null, draftDirectory: directory ?? null, model: defaults.model, agent: defaults.agent, sessionChoices, sessionRecovery: null, error: null });
    this.persist();
    return true;
  }
  applyNewChatDefaults(defaults: ChatChoice, expectedRevision: number) {
    if (this.disposed || this.state.loading || !this.state.preferencesReady || this.state.activeId !== null || this.selectionRevision !== expectedRevision) return false;
    this.selectionRevision++;
    this.publish({ model: defaults.model, agent: defaults.agent, sessionChoices: rememberChatChoice(this.state.sessionChoices, null, defaults) });
    this.persist();
    return true;
  }
  favorite(key: string) { this.publish({ favorites: this.state.favorites.includes(key) ? this.state.favorites.filter(item => item !== key) : [...this.state.favorites, key] }); this.persist(); }
  clearError() { this.publish({ error: null }); }
  reportAttachmentError() { this.publish({ error: 'attachment' }); }
  reportSettingsError() { this.publish({ error: 'storage' }); }
  select(id: string | null) {
    this.selectionRevision++;
    this.recoveryRevision++;
    const sessionChoices = rememberChatChoice(this.state.sessionChoices, this.state.activeId, { model: this.state.model, agent: this.state.agent });
    const choice = id ? sessionChatChoice(id, sessionChoices, this.state.sessions.find(session => session.id === id), this.state.messages.get(id) ?? []) : sessionChoices.new ?? { model: null, agent: '' };
    this.publish({ activeId: id, model: choice.model, agent: choice.agent, sessionChoices: rememberChatChoice(sessionChoices, id, choice), sessionRecovery: null, error: null });
    this.persist();
    if (id) void this.recoverActiveSession();
  }
  private session(id: string) { const session = this.state.sessions.find(item => item.id === id); if (!session) throw new Error('Session unavailable'); return session; }
  private restoreSessionChoice(id: string) {
    const saved = this.state.sessionChoices[id];
    if (saved?.model && saved.agent) return;
    const choice = sessionChatChoice(id, this.state.sessionChoices, this.state.sessions.find(session => session.id === id), this.state.messages.get(id) ?? []);
    if (choice.model === (saved?.model ?? null) && choice.agent === (saved?.agent ?? '')) return;
    const patch: Partial<ChatState> = { sessionChoices: rememberChatChoice(this.state.sessionChoices, id, choice) };
    if (this.state.activeId === id) { patch.model = choice.model; patch.agent = choice.agent; }
    this.publish(patch);
    this.persist();
  }
  async refreshSessions() {
    if (this.listPromise) return this.listPromise;
    this.listPromise = this.loadSessionPages().finally(() => { this.listPromise = null; });
    return this.listPromise;
  }
  private async loadSessionPages() {
    this.sessionMutations = [];
    try {
      const collected = await loadCompleteSessionList(async cursor => {
        const response = await this.runtime.sdk.experimental.session.list({ archived: true, roots: true, limit: 200, cursor }, { throwOnError: true });
        return { sessions: z.array(sessionSchema).parse(response.data), nextCursor: response.response.headers.get('x-next-cursor') };
      }, 200);
      for (const event of this.sessionMutations ?? []) {
        if (event.type === 'session.deleted') collected.delete(event.properties.info.id);
        if (event.type === 'session.created' || event.type === 'session.updated') collected.set(event.properties.info.id, event.properties.info);
      }
      this.publish({ sessions: [...collected.values()].sort((a, b) => b.time.updated - a.time.updated) });
      await this.recoverActiveSession();
    } catch (error) {
      const id = this.state.activeId;
      if (id && !this.state.sessions.some(session => session.id === id) && this.state.sessionRecovery?.reason !== 'missing') this.publish({ sessionRecovery: { sessionId: id, reason: 'unavailable' } });
      throw error;
    } finally { this.sessionMutations = null; }
  }
  private async recoverActiveSession() {
    const id = this.state.activeId;
    const revision = ++this.recoveryRevision;
    if (!id) { if (this.state.sessionRecovery) this.publish({ sessionRecovery: null }); return; }
    const result = await resolveSelectedSession(id, this.state.sessions, async sessionId => {
      const response = await this.runtime.sdk.session.get({ sessionID: sessionId }, { throwOnError: false });
      if (response.response.status === 404) return null;
      if (!response.response.ok) throw new Error('Session lookup failed');
      return sessionSchema.parse(response.data);
    });
    if (this.disposed || this.state.activeId !== id || revision !== this.recoveryRevision) return;
    const sessions = result.session && !this.state.sessions.includes(result.session) ? upsertSession(this.state.sessions, result.session) : this.state.sessions;
    this.publish({ sessions, sessionRecovery: result.recovery, error: !result.recovery && this.state.error === 'sessionMissing' ? null : this.state.error });
    if (result.session) { this.restoreSessionChoice(id); void this.loadHistory(id); void this.refreshLiveState(id); }
  }
  private loadModels() { return this.modelCatalog.initialize(); }
  refreshModels = (): Promise<void> => this.modelCatalog.refresh();
  catalogForDirectory = (directory: string | undefined): Promise<{ models: ModelChoice[]; agents: string[] }> => this.modelCatalog.readForDirectory(directory);
  private async loadInitialData() {
    const sessions = this.refreshSessions();
    // Saved IDs have no authoritative directory until session recovery finishes.
    const catalogs = chatCatalogDirectory(this.state) === null ? sessions.then(() => this.loadModels()) : this.loadModels();
    const results = await Promise.allSettled([sessions, catalogs]);
    if (chatCatalogDirectory(this.state) === null) this.publish({ modelCatalog: { status: 'error', available: false }, agentCatalog: { status: 'error', available: false } });
    if (results.some(result => result.status === 'rejected')) this.publish({ error: 'load' });
  }
  async loadHistory(id: string, limit = 100) {
    const existing = this.historyLoads.get(id);
    if (existing) return existing.promise;
    const session = this.state.sessions.find(item => item.id === id);
    if (!session) return;
    limit = Math.max(limit, this.historyLimits.get(id) ?? 100);
    this.historyLimits.set(id, limit);
    const events: RuntimeEvent[] = [];
    this.publish({ loadingHistory: id });
    const promise = (async () => {
      try {
        const response = await this.runtime.sdk.session.messages({ sessionID: id, directory: session.directory, limit }, { throwOnError: true });
        const snapshot = messagesSchema.parse(response.data);
        const messages = reconcileHistory(snapshot, this.state.messages.get(id) ?? [], events);
        this.publish({ messages: new Map(this.state.messages).set(id, messages), hasMoreHistory: new Map(this.state.hasMoreHistory).set(id, snapshot.length >= limit) });
        this.restoreSessionChoice(id);
        const submission = this.state.submission;
        if (submission?.sessionId === id && messages.some(message => message.info.id === submission.messageId)) this.acknowledgeSubmission(submission);
      } catch { this.publish({ error: 'load' }); }
      finally { this.historyLoads.delete(id); if (this.state.loadingHistory === id) this.publish({ loadingHistory: null }); }
    })();
    this.historyLoads.set(id, { events, promise });
    return promise;
  }
  private async refreshLiveState(id: string) {
    const session = this.state.sessions.find(item => item.id === id);
    if (!session) return;
    const revision = (this.liveRevisions.get(id) ?? 0) + 1;
    this.liveRevisions.set(id, revision);
    const current = () => this.liveRevisions.get(id) === revision;
    const statusRevision = this.statusRevisions.get(id);
    const requests = [
      this.runtime.sdk.session.status({ directory: session.directory }, { throwOnError: true }).then(response => {
        const statuses = statusMapSchema.parse(response.data);
        if (current() && this.statusRevisions.get(id) === statusRevision) this.publish({ statuses: new Map(this.state.statuses).set(id, statuses[id] ?? { type: 'idle' }) });
      }),
      this.runtime.sdk.permission.list({ directory: session.directory }, { throwOnError: true }).then(response => { const permissions = z.array(permissionSchema).parse(response.data); if (current()) this.publish({ permissions: [...this.state.permissions.filter(item => item.sessionID !== id), ...permissions.filter(item => item.sessionID === id)] }); }),
      this.runtime.sdk.question.list({ directory: session.directory }, { throwOnError: true }).then(response => { const questions = z.array(questionSchema).parse(response.data); if (current()) this.publish({ questions: [...this.state.questions.filter(item => item.sessionID !== id), ...questions.filter(item => item.sessionID === id)] }); }),
    ];
    const results = await Promise.allSettled(requests);
    if (current() && results.some(result => result.status === 'rejected')) this.publish({ error: 'load' });
  }
  private receive(event: RuntimeEvent) {
    if (event.id) {
      if (this.seenEvents.has(event.id)) return;
      this.seenEvents.add(event.id);
      if (this.seenEvents.size > 2048) { const first = this.seenEvents.values().next().value; if (first) this.seenEvents.delete(first); }
    }
    const id = eventSessionId(event);
    if (id) this.historyLoads.get(id)?.events.push(event);
    if (event.type === 'session.created' || event.type === 'session.updated' || event.type === 'session.deleted') {
      this.sessionMutations?.push(event);
      const active = event.properties.info.id === this.state.activeId;
      if (active) this.recoveryRevision++;
      this.publish({
        sessions: event.type === 'session.deleted' ? this.state.sessions.filter(session => session.id !== event.properties.info.id) : upsertSession(this.state.sessions, event.properties.info),
        sessionRecovery: active ? event.type === 'session.deleted' ? { sessionId: event.properties.info.id, reason: 'missing' } : null : this.state.sessionRecovery,
        error: active && event.type !== 'session.deleted' && this.state.error === 'sessionMissing' ? null : this.state.error,
      });
      if (active && event.type !== 'session.deleted') this.restoreSessionChoice(event.properties.info.id);
    }
    if (id && event.type.startsWith('message.')) {
      const previous = this.state.messages.get(id);
      if (previous) this.publish({ messages: new Map(this.state.messages).set(id, applyMessageEvent(previous, event)) }, event.type === 'message.part.delta');
      if (event.type === 'message.updated' && this.state.submission?.messageId === event.properties.info.id) this.acknowledgeSubmission(this.state.submission);
    }
    if (event.type === 'session.status' || event.type === 'session.idle') {
      this.statusRevisions.set(event.properties.sessionID, (this.statusRevisions.get(event.properties.sessionID) ?? 0) + 1);
      const status = event.type === 'session.idle' ? { type: 'idle' as const } : event.properties.status;
      this.publish({ statuses: new Map(this.state.statuses).set(event.properties.sessionID, status) });
      if (status.type === 'idle' && event.properties.sessionID === this.state.activeId) void this.loadHistory(event.properties.sessionID);
    }
    if (event.type.startsWith('permission.') || event.type.startsWith('question.')) { if (this.state.activeId) void this.refreshLiveState(this.state.activeId); }
    if (event.type === 'session.error') this.publish({ error: 'send' });
  }
  async resume() {
    const generation = ++this.streamGeneration;
    this.streamAbort?.abort();
    const abort = new AbortController(); this.streamAbort = abort;
    let attempt = 0;
    while (!this.disposed && !abort.signal.aborted && generation === this.streamGeneration) {
      this.publish({ stream: 'connecting' });
      try {
        const subscription = await this.runtime.sdk.global.event({ signal: abort.signal, sseMaxRetryAttempts: 1, onSseError: () => this.publish({ stream: 'offline' }) });
        let connected = false;
        for await (const envelope of subscription.stream) {
          if (abort.signal.aborted || this.disposed || generation !== this.streamGeneration) break;
          if (!connected) {
            connected = true; attempt = 0; this.publish({ stream: 'live' });
            void this.refreshSessions().catch(() => this.publish({ error: 'load' }));
          }
          const event = eventSchema.safeParse(envelope.payload);
          if (event.success) this.receive(event.data);
        }
      } catch { /* Reconnect preserves drafts and history; server work continues. */ }
      if (abort.signal.aborted || this.disposed) break;
      this.publish({ stream: 'offline' });
      await new Promise<void>(resolve => { const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); }; const timer = setTimeout(finish, Math.min(1000 * 2 ** attempt++, 15000)); abort.signal.addEventListener('abort', finish, { once: true }); });
    }
  }
  pause() { this.streamGeneration++; this.streamAbort?.abort(); this.publish({ stream: 'offline' }); void this.flushPreferences(); }
  private acknowledgeSubmission(submission: Submission) {
    const current = this.state.drafts[submission.sessionId];
    const unchanged = current?.text === submission.draft.text && current.attachments === submission.draft.attachments;
    this.publish({ submission: null, drafts: unchanged ? { ...this.state.drafts, [submission.sessionId]: emptyDraft } : this.state.drafts });
    this.persist();
  }
  private async createSession(directory: string | undefined, model: ModelSelection | null, agent: string) {
    let target = directory;
    if (!target) {
      const home = await this.runtime.json('/api/fs/home', homeSchema);
      if (this.disposed) throw new Error('Connection closed');
      const root = home.dataDirectory ?? `${home.home.replace(/[\\/]+$/, '')}/.config/openchamber`;
      target = `${root}/chats/${new Date().toISOString().slice(0, 10)}/session-${crypto.randomUUID()}`;
      await this.runtime.json('/api/fs/mkdir', z.json(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: target }) });
    }
    if (this.disposed) throw new Error('Connection closed');
    const result = await this.runtime.sdk.session.create({ directory: target, agent: agent || undefined, model: model ? { id: model.modelID, providerID: model.providerID, variant: model.variant } : undefined }, { throwOnError: true });
    const session = sessionSchema.parse(result.data);
    this.sessionMutations?.push({ type: 'session.created', properties: { info: session } });
    return session;
  }
  async recoverSessionDraft(directory?: string) {
    const sourceId = this.state.activeId;
    if (!sourceId || this.state.sessionRecovery?.sessionId !== sourceId || this.state.recoveringDraft || this.state.submission || this.disposed) return false;
    const selectionRevision = this.selectionRevision;
    const choice = { model: this.state.model, agent: this.state.agent };
    this.publish({ recoveringDraft: true, error: null });
    try {
      const session = await this.createSession(directory, choice.model, choice.agent);
      if (this.disposed) return false;
      const recovered = recoveredDraftState(this.state, sourceId, session.id);
      if (!recovered) { this.publish({ sessions: upsertSession(this.state.sessions, session), error: 'action' }); return false; }
      const selectCreated = this.state.activeId === sourceId && selectionRevision === this.selectionRevision;
      if (selectCreated) { this.selectionRevision++; this.recoveryRevision++; }
      this.publish({
        sessions: upsertSession(this.state.sessions, session),
        drafts: recovered.drafts,
        activeId: selectCreated ? recovered.activeId : this.state.activeId,
        model: selectCreated ? choice.model : this.state.model,
        agent: selectCreated ? choice.agent : this.state.agent,
        sessionChoices: rememberChatChoice(this.state.sessionChoices, session.id, choice),
        sessionRecovery: selectCreated ? null : this.state.sessionRecovery,
        messages: new Map(this.state.messages).set(session.id, []),
      });
      this.persist();
      return true;
    } catch { this.publish({ error: 'action' }); return false; }
    finally { this.publish({ recoveringDraft: false }); }
  }
  async send(directory?: string) {
    const originalId = this.state.activeId;
    const selectionRevision = this.selectionRevision;
    const draft = this.state.drafts[originalId ?? 'new'] ?? emptyDraft;
    const model = this.state.model;
    const agent = this.state.agent;
    if (!model || this.state.submission || this.state.recoveringDraft || (!draft.text.trim() && !draft.attachments.length)) return;
    if (!this.state.modelCatalog.available || !this.state.agentCatalog.available || !this.state.models.some(choice => choice.id === model.modelID && choice.providerID === model.providerID) || agent && !this.state.agents.includes(agent)) return;
    const sessionError = sessionSendError(originalId, this.state.sessions, this.state.sessionRecovery);
    if (sessionError) { this.publish({ error: sessionError }); return; }
    if (originalId && this.state.statuses.get(originalId)?.type !== undefined && this.state.statuses.get(originalId)?.type !== 'idle') return;
    const messageId = `msg_${Date.now().toString(16)}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    this.publish({ submission: { sessionId: originalId ?? 'new', messageId, draft, state: 'sending' }, error: null });
    let sessionId = originalId;
    let dispatched = false;
    let phase = 'attachments';
    try {
      const parts: (TextPartInput | FilePartInput)[] = draft.text.trim() ? [{ type: 'text', text: draft.text }] : [];
      if (draft.attachments.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) throw new Error('Attachment limit');
      for (const attachment of draft.attachments) {
        const content = await new File(attachment.uri).base64();
        parts.push({ type: 'file', filename: attachment.name, mime: attachment.mime, url: `data:${attachment.mime};base64,${content}` });
      }
      if (this.disposed) return;
      if (!sessionId) {
        phase = 'session';
        const session = await this.createSession(directory, model, agent);
        sessionId = session.id;
        const unchanged = this.state.drafts.new === draft;
        const selectCreated = unchanged && this.state.activeId === originalId && selectionRevision === this.selectionRevision;
        if (selectCreated) { this.selectionRevision++; this.recoveryRevision++; }
        this.publish({ sessions: upsertSession(this.state.sessions, session), activeId: selectCreated ? sessionId : this.state.activeId, model: selectCreated ? model : this.state.model, agent: selectCreated ? agent : this.state.agent, sessionChoices: rememberChatChoice(this.state.sessionChoices, sessionId, { model, agent }), drafts: { ...this.state.drafts, new: unchanged ? emptyDraft : this.state.drafts.new, [sessionId]: draft }, messages: new Map(this.state.messages).set(sessionId, []) });
      }
      phase = 'session';
      const currentSessionError = sessionSendError(sessionId, this.state.sessions, this.state.sessionRecovery);
      if (currentSessionError) { this.publish({ submission: null, error: currentSessionError }); return; }
      const session = this.session(sessionId);
      const submission: Submission = { sessionId, messageId, draft, state: 'sending' };
      this.publish({ submission });
      this.persist();
      dispatched = true;
      phase = 'prompt';
      const result = await this.runtime.sdk.session.promptAsync({ sessionID: sessionId, directory: session.directory, messageID: messageId, model, variant: model.variant, agent: agent || undefined, parts }, { throwOnError: false });
      if (!result.response.ok) {
        if (result.response.status >= 400 && result.response.status < 500 && ![408, 409, 429].includes(result.response.status)) dispatched = false;
        throw new Error('Prompt rejected');
      }
      this.acknowledgeSubmission(submission);
      await this.loadHistory(sessionId);
      await this.refreshLiveState(sessionId);
    } catch (cause) {
      // Only operation/type metadata. Never log SDK errors, bodies or paths.
      console.warn('[native-chat] send failed', phase, cause instanceof z.ZodError ? 'invalid-response' : cause instanceof TypeError ? 'type-error' : 'request-error');
      // A lost response may already have started a turn. Keep the exact draft
      // and message identity until an authoritative read resolves that outcome.
      if (dispatched && sessionId) {
        this.publish({ submission: { sessionId, messageId, draft, state: 'uncertain' }, error: 'uncertain' });
        await this.loadHistory(sessionId);
      } else this.publish({ submission: null, error: phase === 'attachments' ? 'attachment' : 'send' });
    }
  }
  async stop() {
    const id = this.state.activeId; if (!id) return;
    try {
      const directory = this.session(id).directory;
      await this.runtime.sdk.session.abort({ sessionID: id, directory }, { throwOnError: true });
      await this.refreshLiveState(id); await this.loadHistory(id);
      const submission = this.state.submission;
      if (submission?.sessionId === id && submission.state === 'uncertain') {
        const result = await this.runtime.sdk.session.message({ sessionID: id, directory, messageID: submission.messageId }, { throwOnError: false });
        if (result.response.status === 404) this.publish({ submission: null, error: null });
        else if (result.response.ok) { messagesSchema.parse([result.data]); this.acknowledgeSubmission(submission); this.clearError(); }
        else throw new Error('Submission outcome unavailable');
      }
    } catch { this.publish({ error: 'stop' }); }
  }
  async rename(title: string) { const id = this.state.activeId; if (!id || !title.trim()) return; try { const result = await this.runtime.sdk.session.update({ sessionID: id, directory: this.session(id).directory, title: title.trim() }, { throwOnError: true }); this.publish({ sessions: upsertSession(this.state.sessions, sessionSchema.parse(result.data)) }); } catch { this.publish({ error: 'action' }); } }
  async archive(id: string, archived: boolean) { try { const result = await this.runtime.sdk.session.update({ sessionID: id, directory: this.session(id).directory, time: { archived: archived ? Date.now() : 0 } }, { throwOnError: true }); this.publish({ sessions: upsertSession(this.state.sessions, sessionSchema.parse(result.data)) }); if (archived && id === this.state.activeId) this.select(null); } catch { this.publish({ error: 'action' }); } }
  async permissionReply(permission: Permission, reply: 'once' | 'always' | 'reject') { try { await this.runtime.sdk.permission.reply({ requestID: permission.id, directory: this.session(permission.sessionID).directory, reply }, { throwOnError: true }); await this.refreshLiveState(permission.sessionID); } catch { this.publish({ error: 'action' }); } }
  async questionReply(question: Question, answers: string[][] | null) { try { const parameters = { requestID: question.id, directory: this.session(question.sessionID).directory }; if (answers) await this.runtime.sdk.question.reply({ ...parameters, answers }, { throwOnError: true }); else await this.runtime.sdk.question.reject(parameters, { throwOnError: true }); await this.refreshLiveState(question.sessionID); } catch { this.publish({ error: 'action' }); } }
  async retry() { this.publish({ error: null }); await this.loadInitialData(); }
  dispose() { this.selectionRevision++; this.recoveryRevision++; this.modelCatalog.dispose(); this.pause(); this.disposed = true; if (this.publishTimer) clearTimeout(this.publishTimer); this.runtime.close(); this.listeners.clear(); }
}
