import { z } from 'zod';

const chatDisplaySchema = z.object({
  showReasoningTraces: z.boolean(),
  collapsibleThinkingBlocks: z.boolean(),
  showExpandedBashTools: z.boolean(),
  showExpandedEditTools: z.boolean(),
  codeBlockLineWrap: z.boolean(),
  userMessageRenderingMode: z.enum(['plain', 'markdown']),
});
const chatDisplayPatchSchema = chatDisplaySchema.partial();
export type ChatDisplayPreferences = z.infer<typeof chatDisplaySchema>;
export const defaultChatDisplay: ChatDisplayPreferences = {
  showReasoningTraces: true,
  collapsibleThinkingBlocks: true,
  showExpandedBashTools: false,
  showExpandedEditTools: false,
  codeBlockLineWrap: false,
  userMessageRenderingMode: 'plain',
};
const storageKey = 'ivaldi.native.chat-display.v1';

interface ChatDisplayStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface ChatDisplaySnapshot {
  preferences: ChatDisplayPreferences;
  ready: boolean;
  storageError: boolean;
}

/** Device choices publish only after storage commits, independently of connections. */
export class ChatDisplayPreferencesStore {
  private readonly storage: ChatDisplayStorage;
  private state: ChatDisplaySnapshot = { preferences: defaultChatDisplay, ready: false, storageError: false };
  private readonly listeners = new Set<() => void>();
  private hydration: Promise<void> | null = null;
  private writes = Promise.resolve();

  constructor(storage: ChatDisplayStorage) { this.storage = storage; }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private publish(state: ChatDisplaySnapshot) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  private async read(): Promise<ChatDisplayPreferences> {
    const saved = await this.storage.getItem(storageKey);
    return saved === null ? defaultChatDisplay : chatDisplaySchema.parse(JSON.parse(saved));
  }

  hydrate = (): Promise<void> => {
    if (this.state.ready) return Promise.resolve();
    if (this.hydration) return this.hydration;
    this.hydration = this.read().then(preferences => {
      this.publish({ preferences, ready: true, storageError: false });
    }).catch(error => {
      this.publish({ ...this.state, storageError: true });
      throw error;
    }).finally(() => { this.hydration = null; });
    return this.hydration;
  };

  setPreferences = async (patch: Partial<ChatDisplayPreferences>): Promise<void> => {
    const requested = chatDisplayPatchSchema.parse(patch);
    const write = this.writes.catch(() => undefined).then(async () => {
      // A startup edit must retain saved fields that the user has not changed.
      await this.hydrate();
      const preferences = chatDisplaySchema.parse({ ...this.state.preferences, ...requested });
      const previous = this.state.preferences;
      if (preferences.showReasoningTraces === previous.showReasoningTraces
        && preferences.collapsibleThinkingBlocks === previous.collapsibleThinkingBlocks
        && preferences.showExpandedBashTools === previous.showExpandedBashTools
        && preferences.showExpandedEditTools === previous.showExpandedEditTools
        && preferences.codeBlockLineWrap === previous.codeBlockLineWrap
        && preferences.userMessageRenderingMode === previous.userMessageRenderingMode) {
        if (this.state.storageError) this.publish({ ...this.state, storageError: false });
        return;
      }
      await this.storage.setItem(storageKey, JSON.stringify(preferences));
      this.publish({ preferences, ready: true, storageError: false });
    }).catch(error => {
      if (!this.state.storageError) this.publish({ ...this.state, storageError: true });
      throw error;
    });
    this.writes = write;
    return write;
  };
}
