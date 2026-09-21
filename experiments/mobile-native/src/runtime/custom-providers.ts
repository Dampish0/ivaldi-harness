import { z } from 'zod';
import type { NativeRuntime } from './connection';
import type { ProvidersStore } from './providers';

const protocols = { 'openai-chat': '@ai-sdk/openai-compatible', 'openai-responses': '@ai-sdk/openai', 'anthropic-messages': '@ai-sdk/anthropic' } as const;
export type CustomProviderProtocol = keyof typeof protocols;
export interface ModelRow { row: string; id: string; name: string }
export interface HeaderRow { row: string; key: string; value: string }
export interface CustomProviderFormState { providerID: string; name: string; protocol: CustomProviderProtocol; baseURL: string; apiKey: string; models: ModelRow[]; headers: HeaderRow[] }
const scopeSchema = z.enum(['user', 'project', 'custom']);
function dictionary<Value>(schema: z.ZodType<Value>) {
  return z.instanceof(Object).refine(value => Object.getPrototypeOf(value) === Object.prototype)
    .transform(value => Object.entries(value))
    .pipe(z.array(z.tuple([z.string(), schema])))
    .transform(entries => Object.fromEntries(entries));
}
const configSchema = z.object({
  npm: z.enum(['@ai-sdk/openai-compatible', '@ai-sdk/openai', '@ai-sdk/anthropic']), name: z.string(), env: z.array(z.string()).optional(),
  options: z.object({ baseURL: z.string(), headers: dictionary(z.string()).optional() }), models: dictionary(z.object({ name: z.string() })),
});
const editorSchema = z.object({ providerId: z.string().min(1), scope: scopeSchema, revision: z.string().min(1), config: configSchema.nullable(), credentials: z.object({ storedAuth: z.boolean(), inline: z.boolean() }) });
const mutationSchema = z.object({ success: z.literal(true), providerId: z.string().min(1), requiresRestart: z.boolean().optional(), restartDeferred: z.boolean().optional() });
const removalSchema = mutationSchema.extend({ removed: z.boolean() });
type EditorResponse = z.infer<typeof editorSchema>;
type CredentialMode = 'preserve' | 'stored-auth' | 'environment';
interface WriteRequest { scope: z.infer<typeof scopeSchema>; expectedRevision: string; credentials: CredentialMode; config: z.infer<typeof configSchema> }
interface DeleteRequest { scope: z.infer<typeof scopeSchema>; expectedRevision: string }
interface PersistPlan { body: WriteRequest; key?: string }
export interface CustomProviderEditor {
  providerID: string; directory?: string; scope: z.infer<typeof scopeSchema>; revision: string; exists: boolean;
  form: CustomProviderFormState; credentials: EditorResponse['credentials']; environment: string[];
}
type FieldError = 'required' | 'format' | 'duplicate' | 'exists' | 'immutable';
export interface CustomProviderValidation {
  fields: { providerID?: FieldError; name?: FieldError; baseURL?: FieldError; apiKey?: FieldError; models?: FieldError };
  models: Array<{ id?: FieldError; name?: FieldError }>;
  headers: Array<{ key?: FieldError; value?: FieldError }>;
}
export type CustomProviderErrorReason = 'invalidInput' | 'conflict' | 'unsupported' | 'upgrade' | 'request' | 'credentialSavedConfigFailed' | 'credentialSavedConflict' | 'busy' | 'unavailable';
export class CustomProviderError extends Error {
  readonly reason: CustomProviderErrorReason;
  readonly validation?: CustomProviderValidation;
  constructor(reason: CustomProviderErrorReason, validation?: CustomProviderValidation) {
    super(reason); this.reason = reason; this.validation = validation;
  }
}
export interface CustomProvidersSnapshot { error: { providerID: string; reason: CustomProviderErrorReason; credentialSaved: boolean } | null }
export interface CustomProvidersTransport {
  directory(): string | undefined | null;
  editor(providerID: string, directory: string | undefined, signal: AbortSignal): Promise<EditorResponse>;
  saveKey(providerID: string, key: string, signal: AbortSignal): Promise<boolean>;
  save(providerID: string, request: WriteRequest, directory: string | undefined, signal: AbortSignal): Promise<z.infer<typeof mutationSchema>>;
  remove(providerID: string, request: DeleteRequest, directory: string | undefined, signal: AbortSignal): Promise<z.infer<typeof removalSchema>>;
}

let rowNumber = 0;
export const createModelRow = (): ModelRow => ({ row: `model-${rowNumber++}`, id: '', name: '' });
export const createHeaderRow = (): HeaderRow => ({ row: `header-${rowNumber++}`, key: '', value: '' });
export const createEmptyCustomProviderForm = (): CustomProviderFormState => ({ providerID: '', name: '', protocol: 'openai-chat', baseURL: '', apiKey: '', models: [createModelRow()], headers: [createHeaderRow()] });
function editorForm(response: EditorResponse): CustomProviderFormState {
  if (!response.config) return { ...createEmptyCustomProviderForm(), providerID: response.providerId };
  const config = response.config;
  const protocol = config.npm === '@ai-sdk/openai' ? 'openai-responses' : config.npm === '@ai-sdk/anthropic' ? 'anthropic-messages' : 'openai-chat';
  const headers = Object.entries(config.options.headers ?? {}).map(([key, value]) => ({ ...createHeaderRow(), key, value }));
  return { providerID: response.providerId, name: config.name, protocol, baseURL: config.options.baseURL, apiKey: '', models: Object.entries(config.models).map(([id, model]) => ({ ...createModelRow(), id, name: model.name })), headers: headers.length ? headers : [createHeaderRow()] };
}
function failure(cause: unknown): CustomProviderError {
  if (cause instanceof CustomProviderError) return cause;
  const operation = z.object({ code: z.enum(['busy', 'unavailable']) }).safeParse(cause);
  if (operation.success) return new CustomProviderError(operation.data.code);
  return new CustomProviderError('request');
}
export function validateCustomProviderForm(form: CustomProviderFormState, editor?: CustomProviderEditor, credentialSaved = false): CustomProviderValidation {
  const fields: CustomProviderValidation['fields'] = {};
  if (!form.providerID.trim()) fields.providerID = 'required';
  else if (!/^[a-z0-9][a-z0-9-_]*$/.test(form.providerID.trim())) fields.providerID = 'format';
  else if (editor && editor.providerID !== form.providerID.trim()) fields.providerID = 'immutable';
  if (!form.name.trim()) fields.name = 'required';
  if (!form.baseURL.trim()) fields.baseURL = 'required';
  else if (!z.url({ protocol: /^https?$/ }).safeParse(form.baseURL.trim()).success) fields.baseURL = 'format';
  if (!form.apiKey.trim() && !(credentialSaved || editor?.credentials.storedAuth || editor?.credentials.inline || editor?.environment.length)) fields.apiKey = 'required';
  if (form.models.length === 0) fields.models = 'required';
  const modelIDs = new Set<string>();
  const models = form.models.map(model => {
    const error: CustomProviderValidation['models'][number] = {};
    const id = model.id.trim();
    if (!id) error.id = 'required'; else if (modelIDs.has(id)) error.id = 'duplicate';
    modelIDs.add(id);
    if (!model.name.trim()) error.name = 'required';
    return error;
  });
  const headerNames = new Set<string>();
  const headers = form.headers.map(header => {
    const error: CustomProviderValidation['headers'][number] = {};
    const key = header.key.trim(); const value = header.value.trim();
    if (!key && !value) return error;
    if (!key) error.key = 'required'; else if (headerNames.has(key.toLowerCase())) error.key = 'duplicate';
    else if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(key)) error.key = 'format';
    headerNames.add(key.toLowerCase());
    if (!value) error.value = 'required'; else if (/[\r\n]/.test(value)) error.value = 'format';
    return error;
  });
  return { fields, models, headers };
}
function plan(form: CustomProviderFormState, editor: CustomProviderEditor, retryCredential: boolean): PersistPlan {
  const validation = validateCustomProviderForm(form, editor, retryCredential);
  if (Object.keys(validation.fields).length || validation.models.some(error => Object.keys(error).length) || validation.headers.some(error => Object.keys(error).length)) throw new CustomProviderError('invalidInput', validation);
  const value = form.apiKey.trim(); const environment = value.match(/^\{env:([^}]+)\}$/)?.[1]?.trim();
  if (retryCredential && value) throw new CustomProviderError('invalidInput', { ...validation, fields: { apiKey: 'immutable' } });
  const credentials: CredentialMode = retryCredential ? 'stored-auth' : environment ? 'environment' : value ? 'stored-auth' : 'preserve';
  const headers = Object.fromEntries(form.headers.filter(header => header.key.trim() && header.value.trim()).map(header => [header.key.trim(), header.value.trim()]));
  const config: z.infer<typeof configSchema> = { npm: protocols[form.protocol], name: form.name.trim(), options: { baseURL: form.baseURL.trim() }, models: Object.fromEntries(form.models.map(model => [model.id.trim(), { name: model.name.trim() }])) };
  if (environment) config.env = [environment];
  if (Object.keys(headers).length) config.options.headers = headers;
  return {
    key: value && !environment ? value : undefined,
    body: { scope: editor.scope, expectedRevision: editor.revision, credentials, config },
  };
}

/** Editor forms and header values stay in the caller; only safe failure metadata is observable. */
export class CustomProvidersStore {
  private readonly transport: CustomProvidersTransport;
  private readonly providers: ProvidersStore;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private state: CustomProvidersSnapshot = { error: null };
  private readonly partial = new Map<string, string>();
  constructor(transport: CustomProvidersTransport, providers: ProvidersStore) { this.transport = transport; this.providers = providers; }
  getSnapshot = () => this.state;
  hasPendingCredential = (providerID: string): boolean => {
    const directory = this.transport.directory();
    return !this.lifetime.signal.aborted && directory !== null && this.partial.has(JSON.stringify([providerID.trim(), directory]));
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(error: CustomProvidersSnapshot['error']) { if (!this.lifetime.signal.aborted) { this.state = { error }; this.listeners.forEach(listener => listener()); } }
  private check(directory: string | undefined | null): string | undefined {
    if (this.lifetime.signal.aborted || directory === null || directory !== this.transport.directory()) throw new CustomProviderError('unavailable');
    return directory;
  }
  private async read(providerID: string, directory: string | undefined, signal: AbortSignal): Promise<CustomProviderEditor> {
    this.check(directory);
    const response = editorSchema.parse(await this.transport.editor(providerID, directory, signal));
    if (response.providerId !== providerID || response.config === null && response.scope !== 'user') throw new CustomProviderError('request');
    this.check(directory);
    if (signal.aborted) throw new CustomProviderError('unavailable');
    return { providerID, directory, scope: response.scope, revision: response.revision, exists: response.config !== null, form: editorForm(response), credentials: response.credentials, environment: response.config?.env ?? [] };
  }
  readEditor = async (providerID: string, signal?: AbortSignal): Promise<CustomProviderEditor> => {
    const controller = new AbortController(); const abort = () => controller.abort();
    this.lifetime.signal.addEventListener('abort', abort); signal?.addEventListener('abort', abort);
    if (this.lifetime.signal.aborted || signal?.aborted) controller.abort();
    try { return await this.read(providerID, this.check(this.transport.directory()), controller.signal); }
    catch (cause) { throw controller.signal.aborted ? new CustomProviderError('unavailable') : failure(cause); }
    finally { this.lifetime.signal.removeEventListener('abort', abort); signal?.removeEventListener('abort', abort); }
  };
  save = async (form: CustomProviderFormState, previous?: CustomProviderEditor): Promise<void> => {
    const providerID = form.providerID.trim(); const directory = previous ? previous.directory : this.transport.directory();
    const partialKey = JSON.stringify([providerID, directory]);
    let credentialSaved = directory !== null && this.partial.has(partialKey);
    try {
      const resolvedDirectory = this.check(directory);
      const validation = validateCustomProviderForm(form, previous, credentialSaved || !previous?.exists);
      if (Object.keys(validation.fields).length || validation.models.some(error => Object.keys(error).length) || validation.headers.some(error => Object.keys(error).length)) throw new CustomProviderError('invalidInput', validation);
      await this.providers.configurationChange(providerID, async (signal, changed) => {
        if (!previous?.exists) {
          await this.providers.loadCatalog();
          this.check(directory);
          if (this.providers.getSnapshot().catalog.value?.all.some(provider => provider.id === providerID)) throw new CustomProviderError('conflict');
        }
        const editor = await this.read(providerID, resolvedDirectory, signal);
        if (previous ? previous.revision !== editor.revision || previous.scope !== editor.scope || previous.exists !== editor.exists : editor.exists || credentialSaved && this.partial.get(partialKey) !== editor.revision) throw new CustomProviderError('conflict');
        const retryCredential = this.partial.get(partialKey) === editor.revision;
        const prepared = plan(form, editor, retryCredential);
        if (prepared.key) {
          if (await this.transport.saveKey(providerID, prepared.key, signal) !== true) throw new CustomProviderError('request');
          credentialSaved = true; this.partial.set(partialKey, editor.revision); changed();
        }
        this.check(directory);
        if (signal.aborted) throw new CustomProviderError('unavailable');
        const response = mutationSchema.parse(await this.transport.save(providerID, prepared.body, resolvedDirectory, signal));
        if (response.providerId !== providerID) throw new CustomProviderError('request');
        if (response.requiresRestart && response.restartDeferred) changed();
        this.partial.delete(partialKey);
        if (directory === this.transport.directory()) this.publish(null);
      });
    } catch (cause) {
      const original = failure(cause);
      const error = credentialSaved && original.reason !== 'invalidInput' ? new CustomProviderError(original.reason === 'conflict' ? 'credentialSavedConflict' : 'credentialSavedConfigFailed') : original;
      if (directory === this.transport.directory()) this.publish({ providerID, reason: error.reason, credentialSaved });
      throw error;
    }
  };
  remove = async (editor: CustomProviderEditor): Promise<boolean> => {
    try {
      this.check(editor.directory);
      if (!editor.exists) throw new CustomProviderError('unavailable');
      return await this.providers.configurationChange(editor.providerID, async (signal, changed) => {
        const current = await this.read(editor.providerID, editor.directory, signal);
        if (current.revision !== editor.revision || current.scope !== editor.scope || !current.exists) throw new CustomProviderError('conflict');
        const result = removalSchema.parse(await this.transport.remove(editor.providerID, { scope: editor.scope, expectedRevision: editor.revision }, editor.directory, signal));
        if (result.providerId !== editor.providerID) throw new CustomProviderError('request');
        if (result.removed && result.requiresRestart && result.restartDeferred) changed();
        if (editor.directory === this.transport.directory()) this.publish(null);
        return result.removed;
      });
    } catch (cause) {
      const error = failure(cause);
      if (editor.directory === this.transport.directory()) this.publish({ providerID: editor.providerID, reason: error.reason, credentialSaved: false });
      throw error;
    }
  };
  dispose = () => { this.lifetime.abort(); this.partial.clear(); this.listeners.clear(); };
}

export function createCustomProvidersStore(runtime: Pick<NativeRuntime, 'sdk' | 'runtimeFetch'>, providers: ProvidersStore, options: { directory: () => string | undefined | null }): CustomProvidersStore {
  const request = async <Value>(providerID: string, directory: string | undefined, schema: z.ZodType<Value>, init: RequestInit): Promise<Value> => {
    const response = await runtime.runtimeFetch(`/api/provider/${encodeURIComponent(providerID)}/editor${directory ? `?directory=${encodeURIComponent(directory)}` : ''}`, init);
    if (!response.ok) { await response.text().catch(() => undefined); throw new CustomProviderError([404, 405, 501].includes(response.status) ? 'upgrade' : response.status === 409 ? 'conflict' : response.status === 422 ? 'unsupported' : 'request'); }
    return schema.parse(await response.json());
  };
  return new CustomProvidersStore({
    directory: options.directory,
    editor: (providerID, directory, signal) => request(providerID, directory, editorSchema, { signal }),
    saveKey: async (providerID, key, signal) => (await runtime.sdk.auth.set({ providerID, auth: { type: 'api', key } }, { signal, throwOnError: true })).data,
    save: (providerID, body, directory, signal) => request(providerID, directory, mutationSchema, { method: 'PUT', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    remove: (providerID, body, directory, signal) => request(providerID, directory, removalSchema, { method: 'DELETE', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }, providers);
}
