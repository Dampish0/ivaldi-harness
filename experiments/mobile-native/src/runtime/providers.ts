import { z } from 'zod';
import type { NativeRuntime } from './connection';

const idSchema = z.string().min(1);
const conditionSchema = z.object({ key: idSchema, op: z.enum(['eq', 'neq']), value: z.string() });
export const authPromptSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), key: idSchema, message: z.string(), placeholder: z.string().optional(), when: conditionSchema.optional() }),
  z.object({ type: z.literal('select'), key: idSchema, message: z.string(), options: z.array(z.object({ label: z.string(), value: idSchema, hint: z.string().optional() })).min(1), when: conditionSchema.optional() }),
]);
export type AuthPrompt = z.infer<typeof authPromptSchema>;
export const providerAuthMethodsSchema = z.record(z.string(), z.array(z.object({ type: z.enum(['api', 'oauth']), label: z.string(), prompts: z.array(authPromptSchema).optional() })));
export type ProviderAuthMethod = z.infer<typeof providerAuthMethodsSchema>[string][number];
export const providerCatalogSchema = z.object({
  all: z.array(z.object({ id: idSchema, name: z.string(), source: z.enum(['env', 'config', 'custom', 'api']).optional(), models: z.record(z.string(), z.object({ id: idSchema, name: z.string() })) })),
  connected: z.array(idSchema), default: z.record(z.string(), z.string()),
});
export type ProviderCatalog = z.infer<typeof providerCatalogSchema>;
export type NativeProvider = ProviderCatalog['all'][number];
const sourceSchema = z.object({ exists: z.boolean() });
export const providerSourcesSchema = z.object({ auth: sourceSchema, user: sourceSchema, project: sourceSchema, custom: sourceSchema.optional().default({ exists: false }) });
export type ProviderSources = z.infer<typeof providerSourcesSchema>;
const sourceResponseSchema = z.object({ providerId: idSchema, sources: providerSourcesSchema });
export const oauthAuthorizationSchema = z.object({ url: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]), instructions: z.string(), method: z.enum(['auto', 'code']) }).refine(value => Boolean(value.url || value.instructions));
export type OAuthAuthorization = z.infer<typeof oauthAuthorizationSchema>;
const removeResponseSchema = z.object({ success: z.literal(true), removed: z.boolean(), requiresRestart: z.boolean().optional(), restartDeferred: z.boolean().optional(), requiresReload: z.boolean().optional() });
const applyResponseSchema = z.object({ success: z.literal(true), requiresReload: z.boolean().optional(), requiresManualRestart: z.boolean().optional(), reloadDelayMs: z.number().nonnegative().optional() }).refine(value => value.requiresReload === true || value.requiresManualRestart === true);

export type ProviderOperation = 'key' | 'remove' | 'authorize' | 'callback' | 'apply' | 'config';
export type ProviderErrorCode = 'request' | 'invalidInput' | 'unavailable' | 'busy';
export class ProviderOperationError extends Error {
  readonly code: ProviderErrorCode;
  readonly field?: string;
  constructor(code: ProviderErrorCode, field?: string) { super(code); this.code = code; this.field = field; }
}
interface LoadState<Value> { value: Value | null; loading: boolean; error: boolean }
export interface ProvidersSnapshot {
  catalog: LoadState<ProviderCatalog>;
  methods: LoadState<z.infer<typeof providerAuthMethodsSchema>>;
  sources: { [providerID: string]: LoadState<ProviderSources> };
  mutation: { kind: ProviderOperation; providerID: string | null } | null;
  error: { operation: ProviderOperation; providerID: string | null; code: ProviderErrorCode; field?: string } | null;
  pendingRestart: string[];
  applyState: 'idle' | 'pending' | 'manual' | 'refresh';
}
export interface ProvidersTransport {
  directory(): string | undefined;
  catalog(directory: string | undefined, signal: AbortSignal): Promise<ProviderCatalog>;
  methods(directory: string | undefined, signal: AbortSignal): Promise<z.infer<typeof providerAuthMethodsSchema>>;
  source(providerID: string, directory: string | undefined, signal: AbortSignal): Promise<ProviderSources>;
  saveKey(providerID: string, key: string, signal: AbortSignal): Promise<boolean>;
  removeAuth(providerID: string, directory: string | undefined, signal: AbortSignal): Promise<z.infer<typeof removeResponseSchema>>;
  authorize(providerID: string, method: number, inputs: { [key: string]: string }, directory: string | undefined, signal: AbortSignal): Promise<OAuthAuthorization>;
  callback(providerID: string, method: number, code: string | undefined, directory: string | undefined, signal: AbortSignal): Promise<boolean>;
  apply(signal: AbortSignal): Promise<z.infer<typeof applyResponseSchema>>;
  refreshModels(): Promise<void>;
}

export function defaultPromptValues(prompts: readonly AuthPrompt[]): { [key: string]: string } {
  return Object.fromEntries(prompts.map(prompt => [prompt.key, prompt.type === 'select' ? prompt.options[0].value : '']));
}
export function visiblePrompts(prompts: readonly AuthPrompt[], values: { [key: string]: string }): AuthPrompt[] {
  return prompts.filter(prompt => !prompt.when || (prompt.when.op === 'eq' ? (values[prompt.when.key] ?? '') === prompt.when.value : (values[prompt.when.key] ?? '') !== prompt.when.value));
}
export function collectPromptInputs(prompts: readonly AuthPrompt[], values: { [key: string]: string }): { [key: string]: string } {
  return Object.fromEntries(visiblePrompts(prompts, values).map(prompt => {
    const value = (values[prompt.key] ?? '').trim();
    if (!value || prompt.type === 'select' && !prompt.options.some(option => option.value === value)) throw new ProviderOperationError('invalidInput', prompt.key);
    return [prompt.key, value];
  }));
}
export function providerAuthMethods(snapshot: ProvidersSnapshot, providerID: string): ProviderAuthMethod[] | null {
  if (!snapshot.methods.value || snapshot.methods.error) return null;
  return snapshot.methods.value[providerID] ?? [];
}
export function supportsApiKey(methods: readonly ProviderAuthMethod[] | null): boolean {
  return methods !== null && (methods.length === 0 || methods.some(method => method.type === 'api'));
}
export function shouldOpenOAuthUrl(providerID: string, authorization: OAuthAuthorization): boolean {
  return providerID !== 'claude-code' && Boolean(authorization.url);
}

function waitForReload(delayMs: number | undefined, signal: AbortSignal): Promise<void> {
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new ProviderOperationError('unavailable')); return; }
    const abort = () => { clearTimeout(timer); reject(new ProviderOperationError('unavailable')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, Math.min(delayMs, 30_000));
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** One connected runtime owns this store; form secrets remain in callers' transient state. */
export class ProvidersStore {
  private readonly transport: ProvidersTransport;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private directory: string | undefined;
  private revision = 0;
  private credentialRevision = 0;
  private state: ProvidersSnapshot = { catalog: { value: null, loading: false, error: false }, methods: { value: null, loading: false, error: false }, sources: {}, mutation: null, error: null, pendingRestart: [], applyState: 'idle' };
  private catalogLoad: Promise<void> | null = null;
  private methodsLoad: Promise<void> | null = null;
  private sourceLoads = new Map<string, Promise<void>>();
  private mutation: AbortController | null = null;
  private oauth: { providerID: string; method: number; completion: 'auto' | 'code'; directory: string | undefined; controller: AbortController } | null = null;

  constructor(transport: ProvidersTransport) { this.transport = transport; this.directory = transport.directory(); }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<ProvidersSnapshot>) { if (!this.lifetime.signal.aborted) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); } }
  private current(directory: string | undefined, revision: number) { return !this.lifetime.signal.aborted && directory === this.transport.directory() && revision === this.revision; }
  private scope() {
    const directory = this.transport.directory();
    if (directory !== this.directory) {
      this.cancelOAuth(); this.directory = directory; this.revision++; this.catalogLoad = null; this.methodsLoad = null; this.sourceLoads.clear();
      this.publish({ catalog: { value: null, loading: false, error: false }, methods: { value: null, loading: false, error: false }, sources: {} });
    }
    return directory;
  }
  private invalidateReads() {
    this.revision++; this.catalogLoad = null; this.methodsLoad = null; this.sourceLoads.clear();
    this.publish({ catalog: { ...this.state.catalog, loading: false }, methods: { ...this.state.methods, loading: false }, sources: Object.fromEntries(Object.entries(this.state.sources).map(([id, state]) => [id, { ...state, loading: false }])) });
  }
  private pending(providerID: string) { this.credentialRevision++; this.publish({ pendingRestart: [...new Set([...this.state.pendingRestart, providerID])], applyState: 'pending' }); }
  private available(providerID: string) {
    this.scope();
    if (this.lifetime.signal.aborted || !this.state.catalog.value?.all.some(provider => provider.id === providerID)) throw new ProviderOperationError('unavailable');
  }

  loadCatalog = (): Promise<void> => {
    if (this.lifetime.signal.aborted) return Promise.reject(new ProviderOperationError('unavailable'));
    const directory = this.scope();
    if (this.catalogLoad) return this.catalogLoad;
    const revision = this.revision;
    this.publish({ catalog: { ...this.state.catalog, loading: true, error: false } });
    const request = (async () => {
      try {
        const value = providerCatalogSchema.parse(await this.transport.catalog(directory, this.lifetime.signal));
        if (this.current(directory, revision)) this.publish({ catalog: { value, loading: false, error: false } });
      } catch {
        if (this.current(directory, revision)) { this.publish({ catalog: { ...this.state.catalog, loading: false, error: true } }); throw new ProviderOperationError('request'); }
      }
    })().finally(() => { if (this.catalogLoad === request) this.catalogLoad = null; });
    this.catalogLoad = request;
    return request;
  };
  loadMethods = (): Promise<void> => {
    if (this.lifetime.signal.aborted) return Promise.reject(new ProviderOperationError('unavailable'));
    const directory = this.scope();
    if (this.methodsLoad) return this.methodsLoad;
    const revision = this.revision;
    this.publish({ methods: { ...this.state.methods, loading: true, error: false } });
    const request = (async () => {
      try {
        const value = providerAuthMethodsSchema.parse(await this.transport.methods(directory, this.lifetime.signal));
        if (this.current(directory, revision)) this.publish({ methods: { value, loading: false, error: false } });
      } catch {
        if (this.current(directory, revision)) { this.publish({ methods: { ...this.state.methods, loading: false, error: true } }); throw new ProviderOperationError('request'); }
      }
    })().finally(() => { if (this.methodsLoad === request) this.methodsLoad = null; });
    this.methodsLoad = request;
    return request;
  };
  load = async (): Promise<void> => {
    const results = await Promise.allSettled([this.loadCatalog(), this.loadMethods()]);
    if (results.some(result => result.status === 'rejected')) throw new ProviderOperationError('request');
  };
  loadSource = (providerID: string): Promise<void> => {
    if (this.lifetime.signal.aborted) return Promise.reject(new ProviderOperationError('unavailable'));
    const directory = this.scope();
    const existing = this.sourceLoads.get(providerID);
    if (existing) return existing;
    const revision = this.revision;
    this.publish({ sources: { ...this.state.sources, [providerID]: { value: this.state.sources[providerID]?.value ?? null, loading: true, error: false } } });
    const request = (async () => {
      try {
        const value = providerSourcesSchema.parse(await this.transport.source(providerID, directory, this.lifetime.signal));
        if (this.current(directory, revision)) this.publish({ sources: { ...this.state.sources, [providerID]: { value, loading: false, error: false } } });
      } catch {
        if (this.current(directory, revision)) { this.publish({ sources: { ...this.state.sources, [providerID]: { value: this.state.sources[providerID]?.value ?? null, loading: false, error: true } } }); throw new ProviderOperationError('request'); }
      }
    })().finally(() => { if (this.sourceLoads.get(providerID) === request) this.sourceLoads.delete(providerID); });
    this.sourceLoads.set(providerID, request);
    return request;
  };

  private async mutate<Result>(operation: ProviderOperation, providerID: string | null, action: (signal: AbortSignal) => Promise<Result>): Promise<Result> {
    if (this.lifetime.signal.aborted) throw new ProviderOperationError('unavailable');
    if (this.mutation) throw new ProviderOperationError('busy');
    const controller = new AbortController();
    this.mutation = controller;
    this.publish({ mutation: { kind: operation, providerID }, error: null });
    try { return await action(controller.signal); }
    catch (cause) {
      const error = cause instanceof ProviderOperationError ? cause : new ProviderOperationError('request');
      if (!controller.signal.aborted) this.publish({ error: { operation, providerID, code: error.code, field: error.field } });
      throw error;
    } finally { if (this.mutation === controller) { this.mutation = null; this.publish({ mutation: null }); } }
  }
  saveApiKey = async (providerID: string, key: string): Promise<void> => {
    this.available(providerID);
    if (!supportsApiKey(providerAuthMethods(this.state, providerID))) throw new ProviderOperationError('unavailable');
    const secret = key.trim();
    if (!secret) throw new ProviderOperationError('invalidInput');
    await this.mutate('key', providerID, async signal => {
      if (await this.transport.saveKey(providerID, secret, signal) !== true) throw new ProviderOperationError('request');
      if (this.lifetime.signal.aborted) return;
      this.invalidateReads(); this.pending(providerID);
      await this.loadSource(providerID).catch(() => undefined);
    });
  };
  removeStoredAuth = async (providerID: string): Promise<void> => {
    this.available(providerID);
    if (providerID === 'claude-code' || !this.state.sources[providerID]?.value?.auth.exists || this.state.sources[providerID]?.error) throw new ProviderOperationError('unavailable');
    await this.mutate('remove', providerID, async signal => {
      const response = removeResponseSchema.parse(await this.transport.removeAuth(providerID, this.scope(), signal));
      if (this.lifetime.signal.aborted) return;
      this.invalidateReads();
      if (response.removed && (response.restartDeferred || response.requiresRestart)) this.pending(providerID);
      await this.loadSource(providerID).catch(() => undefined);
    });
  };
  authorize = async (providerID: string, method: number, values: { [key: string]: string }): Promise<OAuthAuthorization | null> => {
    this.available(providerID);
    const authMethod = providerAuthMethods(this.state, providerID)?.[method];
    if (!Number.isInteger(method) || authMethod?.type !== 'oauth') throw new ProviderOperationError('unavailable');
    const inputs = collectPromptInputs(authMethod.prompts ?? [], values);
    this.cancelOAuth();
    const directory = this.scope();
    return this.mutate('authorize', providerID, async signal => {
      try {
        const authorization = oauthAuthorizationSchema.parse(await this.transport.authorize(providerID, method, inputs, directory, signal));
        if (signal.aborted || this.lifetime.signal.aborted || directory !== this.transport.directory()) return null;
        this.oauth = { providerID, method, completion: authorization.method, directory, controller: new AbortController() };
        return authorization;
      } catch (error) { if (signal.aborted) return null; throw error; }
    });
  };
  completeOAuth = async (providerID: string, method: number, code?: string): Promise<boolean> => {
    const flow = this.oauth;
    if (!flow || flow.providerID !== providerID || flow.method !== method || flow.directory !== this.transport.directory()) throw new ProviderOperationError('unavailable');
    const trimmedCode = code?.trim();
    if (flow.completion === 'code' && !trimmedCode) throw new ProviderOperationError('invalidInput');
    return this.mutate('callback', providerID, async signal => {
      const abort = () => flow.controller.abort();
      signal.addEventListener('abort', abort);
      try {
        const completed = await this.transport.callback(providerID, method, flow.completion === 'code' ? trimmedCode : undefined, flow.directory, flow.controller.signal);
        if (completed !== true) throw new ProviderOperationError('request');
        if (this.lifetime.signal.aborted) return false;
        this.invalidateReads();
        if (providerID !== 'claude-code') this.pending(providerID);
        await this.loadSource(providerID).catch(() => undefined);
        if (providerID === 'claude-code') {
          const refreshed = await Promise.allSettled([this.loadCatalog(), this.transport.refreshModels()]);
          if (refreshed.some(result => result.status === 'rejected') && this.state.pendingRestart.length === 0) this.publish({ applyState: 'refresh' });
        }
        if (this.oauth !== flow || flow.controller.signal.aborted) return false;
        this.oauth = null;
        return true;
      } catch (error) { if (flow.controller.signal.aborted) return false; throw error; }
      finally { signal.removeEventListener('abort', abort); }
    });
  };
  cancelOAuth = () => {
    this.oauth?.controller.abort(); this.oauth = null;
    if (this.state.mutation?.kind === 'authorize' || this.state.mutation?.kind === 'callback') { this.mutation?.abort(); this.mutation = null; this.publish({ mutation: null, error: null }); }
  };
  configurationChange = async <Result>(providerID: string, action: (signal: AbortSignal, changed: () => void) => Promise<Result>): Promise<Result> => {
    const result = await this.mutate('config', providerID, async signal => {
    let changed = false;
    try {
      const value = await action(signal, () => {
        if (this.lifetime.signal.aborted) return;
        changed = true; this.invalidateReads(); this.pending(providerID);
      });
      return { status: 'success', value } as const;
    } catch (error) {
      return { status: 'failure', error } as const;
    } finally {
      if (changed && !this.lifetime.signal.aborted) await this.loadSource(providerID).catch(() => undefined);
    }
    });
    if (result.status === 'failure') throw result.error;
    return result.value;
  };
  private async refreshApplied(credentialRevision: number): Promise<'ready' | 'pending' | 'refreshFailed'> {
    const directory = this.scope();
    this.invalidateReads();
    const revision = this.revision;
    const outcomes = await Promise.allSettled([this.load(), this.transport.refreshModels()]);
    if (this.lifetime.signal.aborted) throw new ProviderOperationError('unavailable');
    if (credentialRevision !== this.credentialRevision) return 'pending';
    if (!this.current(directory, revision) || outcomes.some(outcome => outcome.status === 'rejected')) { this.scope(); return 'refreshFailed'; }
    return 'ready';
  }
  confirmManualRestart = async (): Promise<'ready' | 'pending' | 'refreshFailed'> => {
    if (this.state.applyState !== 'manual') throw new ProviderOperationError('unavailable');
    return this.mutate('apply', null, async () => {
      const result = await this.refreshApplied(this.credentialRevision);
      if (result === 'ready') this.publish({ applyState: 'idle', pendingRestart: [] });
      else this.publish({ applyState: result === 'pending' ? 'pending' : 'manual' });
      return result;
    });
  };
  apply = async (): Promise<'ready' | 'pending' | 'manual' | 'refreshFailed'> => this.mutate('apply', null, async signal => {
    const manual = this.state.applyState === 'manual';
    const credentialRevision = this.credentialRevision;
    if (this.state.applyState !== 'refresh' && !manual) {
      const response = applyResponseSchema.parse(await this.transport.apply(signal));
      if (this.lifetime.signal.aborted) throw new ProviderOperationError('unavailable');
      if (response.requiresManualRestart) { this.publish({ applyState: 'manual' }); return 'manual'; }
      if (credentialRevision === this.credentialRevision) this.publish({ pendingRestart: [], applyState: 'refresh' });
      await waitForReload(response.reloadDelayMs, signal);
    }
    const result = await this.refreshApplied(credentialRevision);
    if (result === 'pending') {
      this.publish({ applyState: manual ? 'manual' : 'pending' });
      return manual ? 'manual' : 'pending';
    }
    if (result === 'refreshFailed') { this.publish({ applyState: manual ? 'manual' : 'refresh' }); return 'refreshFailed'; }
    if (manual) return 'manual';
    this.publish({ applyState: 'idle', pendingRestart: [] });
    return 'ready';
  });
  dispose = () => { this.cancelOAuth(); this.mutation?.abort(); this.lifetime.abort(); this.listeners.clear(); };
}

export function createProvidersStore(runtime: Pick<NativeRuntime, 'sdk' | 'json'>, options: { directory?: () => string | undefined; refreshModels: () => Promise<void> }): ProvidersStore {
  return new ProvidersStore({
    directory: () => options.directory?.(),
    catalog: async (directory, signal) => providerCatalogSchema.parse((await runtime.sdk.provider.list({ directory }, { signal, throwOnError: true })).data),
    methods: async (directory, signal) => providerAuthMethodsSchema.parse((await runtime.sdk.provider.auth({ directory }, { signal, throwOnError: true })).data),
    source: async (providerID, directory, signal) => {
      const query = directory ? `?directory=${encodeURIComponent(directory)}` : '';
      const response = await runtime.json(`/api/provider/${encodeURIComponent(providerID)}/source${query}`, sourceResponseSchema, { signal });
      if (response.providerId !== providerID) throw new ProviderOperationError('request');
      return response.sources;
    },
    saveKey: async (providerID, key, signal) => (await runtime.sdk.auth.set({ providerID, auth: { type: 'api', key } }, { signal, throwOnError: true })).data,
    removeAuth: (providerID, directory, signal) => runtime.json(`/api/provider/${encodeURIComponent(providerID)}/auth?scope=auth${directory ? `&directory=${encodeURIComponent(directory)}` : ''}`, removeResponseSchema, { method: 'DELETE', signal }),
    authorize: async (providerID, method, inputs, directory, signal) => oauthAuthorizationSchema.parse((await runtime.sdk.provider.oauth.authorize({ providerID, method, inputs, directory }, { signal, throwOnError: true })).data),
    callback: async (providerID, method, code, directory, signal) => (await runtime.sdk.provider.oauth.callback({ providerID, method, code, directory }, { signal, throwOnError: true })).data,
    apply: signal => runtime.json('/api/config/reload', applyResponseSchema, { method: 'POST', signal }),
    refreshModels: options.refreshModels,
  });
}
