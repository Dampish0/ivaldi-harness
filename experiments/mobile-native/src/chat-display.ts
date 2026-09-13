import { createContext, useContext } from 'react';
import type { ChatDisplayPreferences } from './runtime/chat-display';

type NativeChatDisplay = {
  preferences: ChatDisplayPreferences;
  ready: boolean;
  storageError: boolean;
  setPreferences: (patch: Partial<ChatDisplayPreferences>) => Promise<void>;
  retryLoad: () => Promise<void>;
};

export const ChatDisplayContext = createContext<NativeChatDisplay | null>(null);

export function useChatDisplay() {
  const value = useContext(ChatDisplayContext);
  if (!value) throw new Error('ChatDisplayProvider is required');
  return value;
}
