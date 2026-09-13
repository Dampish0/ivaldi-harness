import { z } from 'zod';

const appearanceSchema = z.object({
  scheme: z.enum(['system', 'light', 'dark']),
  fontFamily: z.enum(['selawik', 'system']),
  textScale: z.number().int().min(80).max(150).multipleOf(5),
  density: z.number().int().min(80).max(120).multipleOf(5),
});
const appearancePatchSchema = appearanceSchema.partial();
export type AppearancePreferences = z.infer<typeof appearanceSchema>;
export const defaultAppearance: AppearancePreferences = { scheme: 'system', fontFamily: 'selawik', textScale: 100, density: 100 };
const storageKey = 'ivaldi.native.appearance.v1';
const legacyKey = 'ivaldi.native.theme';

interface AppearanceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface AppearanceSnapshot {
  appearance: AppearancePreferences;
  appearanceReady: boolean;
  storageError: boolean;
}

/** Device preferences commit after persistence. Queued edits merge with the last successful write. */
export class AppearancePreferencesStore {
  private readonly storage: AppearanceStorage;
  private state: AppearanceSnapshot = { appearance: defaultAppearance, appearanceReady: false, storageError: false };
  private readonly listeners = new Set<() => void>();
  private hydration: Promise<void> | null = null;
  private writes = Promise.resolve();

  constructor(storage: AppearanceStorage) { this.storage = storage; }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private publish(state: AppearanceSnapshot) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  private async read(): Promise<AppearancePreferences> {
    const saved = await this.storage.getItem(storageKey);
    if (saved !== null) return appearanceSchema.parse(JSON.parse(saved));
    const legacy = await this.storage.getItem(legacyKey);
    if (legacy === null) return defaultAppearance;
    return { ...defaultAppearance, scheme: z.enum(['light', 'dark']).parse(legacy) };
  }

  hydrate = (): Promise<void> => {
    if (this.state.appearanceReady) return Promise.resolve();
    if (this.hydration) return this.hydration;
    this.hydration = this.read().then(appearance => {
      this.publish({ appearance, appearanceReady: true, storageError: false });
    }).catch(error => {
      this.publish({ ...this.state, storageError: true });
      throw error;
    }).finally(() => { this.hydration = null; });
    return this.hydration;
  };

  setAppearance = async (patch: Partial<AppearancePreferences>): Promise<void> => {
    const requested = appearancePatchSchema.parse(patch);
    const write = this.writes.catch(() => undefined).then(async () => {
      // Waiting also preserves fields the user has not changed during startup.
      await this.hydrate();
      const appearance = appearanceSchema.parse({ ...this.state.appearance, ...requested });
      const previous = this.state.appearance;
      if (appearance.scheme === previous.scheme && appearance.fontFamily === previous.fontFamily && appearance.textScale === previous.textScale && appearance.density === previous.density) {
        if (this.state.storageError) this.publish({ ...this.state, storageError: false });
        return;
      }
      await this.storage.setItem(storageKey, JSON.stringify(appearance));
      this.publish({ appearance, appearanceReady: true, storageError: false });
    }).catch(error => {
      if (!this.state.storageError) this.publish({ ...this.state, storageError: true });
      throw error;
    });
    this.writes = write;
    return write;
  };
}
