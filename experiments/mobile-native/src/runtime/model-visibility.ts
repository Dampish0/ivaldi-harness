import { z } from 'zod';

const hiddenSchema = z.array(z.string().min(1));
const storageKey = 'ivaldi.native.model-visibility.v1';

interface ModelVisibilityStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface ModelVisibilitySnapshot {
  hidden: string[];
  ready: boolean;
  loading: boolean;
  saving: boolean;
  error: 'load' | 'save' | null;
}

/** Device picker preferences do not change chat choices or server defaults. */
export class ModelVisibilityStore {
  private readonly storage: ModelVisibilityStorage;
  private state: ModelVisibilitySnapshot = { hidden: [], ready: false, loading: false, saving: false, error: null };
  private readonly listeners = new Set<() => void>();
  private operations = Promise.resolve();

  constructor(storage: ModelVisibilityStorage) { this.storage = storage; }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<ModelVisibilitySnapshot>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operations.then(operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  load = (): Promise<void> => this.enqueue(async () => {
    this.publish({ loading: true, error: null });
    try {
      const saved = await this.storage.getItem(storageKey);
      const hidden = saved === null ? [] : [...new Set(hiddenSchema.parse(JSON.parse(saved)))];
      this.publish({ hidden, ready: true, loading: false });
    } catch (error) { this.publish({ ready: false, loading: false, error: 'load' }); throw error; }
  });

  setHidden = (key: string, hidden: boolean): Promise<void> => this.setProviderHidden([key], hidden);

  setProviderHidden = async (keys: string[], hide: boolean): Promise<void> => {
    const requested = new Set(hiddenSchema.parse(keys));
    await this.enqueue(async () => {
      if (!this.state.ready) {
        this.publish({ error: 'load' });
        throw new Error('Model visibility has not loaded');
      }
      const previous = this.state.hidden;
      const hidden = hide ? [...new Set([...previous, ...requested])] : previous.filter(key => !requested.has(key));
      if (hidden.length === previous.length) {
        if (this.state.error) this.publish({ error: null });
        return;
      }
      this.publish({ saving: true, error: null });
      try {
        await this.storage.setItem(storageKey, JSON.stringify(hidden));
        this.publish({ hidden, saving: false });
      } catch (error) { this.publish({ saving: false, error: 'save' }); throw error; }
    });
  };
}
