import { z } from 'zod';
import type { ModelChoice, ModelSelection } from './schema';

const fieldsSchema = z.object({ defaultModel: z.string().trim(), defaultVariant: z.string().trim(), defaultAgent: z.string().trim() });
const patchSchema = fieldsSchema.partial();
export const sessionDefaultsSchema = patchSchema.transform(fields => ({ defaultModel: fields.defaultModel ?? '', defaultVariant: fields.defaultVariant ?? '', defaultAgent: fields.defaultAgent ?? '' }));
export type SessionDefaults = z.infer<typeof sessionDefaultsSchema>;

interface DefaultsTransport {
  read(): Promise<SessionDefaults>;
  write(patch: Partial<SessionDefaults>): Promise<SessionDefaults>;
}
interface DefaultsSnapshot {
  defaults: SessionDefaults;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  error: 'load' | 'save' | null;
}

/** One connected server owns these defaults. Components supply its authenticated transport. */
export class SessionDefaultsStore {
  private readonly transport: DefaultsTransport;
  private state: DefaultsSnapshot = { defaults: { defaultModel: '', defaultVariant: '', defaultAgent: '' }, ready: false, loading: false, saving: false, error: null };
  private readonly listeners = new Set<() => void>();
  private operations = Promise.resolve();
  private writeRevision = 0;
  private pendingLoad: { revision: number; promise: Promise<SessionDefaults> } | null = null;

  constructor(transport: DefaultsTransport) { this.transport = transport; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<DefaultsSnapshot>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  load = (): Promise<SessionDefaults> => {
    if (this.pendingLoad?.revision === this.writeRevision) return this.pendingLoad.promise;
    const revision = this.writeRevision;
    const promise = this.enqueue(async () => {
      this.publish({ loading: true, error: null });
      try {
        const defaults = sessionDefaultsSchema.parse(await this.transport.read());
        this.publish({ defaults, ready: true, loading: false });
        return defaults;
      } catch (error) { this.publish({ loading: false, error: 'load' }); throw error; }
    }).finally(() => { if (this.pendingLoad?.promise === promise) this.pendingLoad = null; });
    this.pendingLoad = { revision, promise };
    return promise;
  };

  save = async (patch: Partial<SessionDefaults>): Promise<void> => {
    const requested = patchSchema.parse(patch);
    this.writeRevision++;
    await this.enqueue(async () => {
      if (!this.state.ready) throw new Error('Session defaults have not loaded');
      const update = { ...requested };
      // Variant IDs belong to one model. Clearing or changing that model must
      // not leave the preceding model's thinking choice behind on the server.
      if (update.defaultModel === '' || update.defaultModel !== undefined && update.defaultModel !== this.state.defaults.defaultModel && update.defaultVariant === undefined) update.defaultVariant = '';
      if (Object.keys(update).length === 0) return;
      this.publish({ saving: true, error: null });
      try {
        const defaults = sessionDefaultsSchema.parse(await this.transport.write(update));
        this.publish({ defaults, ready: true, saving: false });
      } catch (error) { this.publish({ saving: false, error: 'save' }); throw error; }
    });
  };
}

/** Unavailable saved choices stay in the store; chat uses a currently usable fallback. */
export function resolveSessionDefaults(defaults: SessionDefaults, models: ModelChoice[], agents: string[], fallbackModel: ModelSelection | null, fallbackAgent: string) {
  const configured = models.find(model => `${model.providerID}/${model.id}` === defaults.defaultModel);
  const fallback = models.find(model => model.providerID === fallbackModel?.providerID && model.id === fallbackModel.modelID);
  const selected = configured ?? fallback ?? models[0];
  const requestedVariant = configured ? defaults.defaultVariant : selected === fallback ? fallbackModel?.variant : undefined;
  const variant = requestedVariant && selected?.variants.includes(requestedVariant) ? requestedVariant : undefined;
  const model: ModelSelection | null = selected ? { providerID: selected.providerID, modelID: selected.id, variant } : null;
  const agent = agents.includes(defaults.defaultAgent) ? defaults.defaultAgent : agents.includes(fallbackAgent) ? fallbackAgent : agents.includes('build') ? 'build' : agents[0] ?? '';
  return {
    model,
    agent,
    unavailable: {
      model: Boolean(defaults.defaultModel && !configured),
      variant: Boolean(defaults.defaultVariant && !configured?.variants.includes(defaults.defaultVariant)),
      agent: Boolean(defaults.defaultAgent && !agents.includes(defaults.defaultAgent)),
    },
  };
}
