import React, { useEffect, useState, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatDisplayContext } from './chat-display';
import { ChatDisplayPreferencesStore } from './runtime/chat-display';

export function ChatDisplayProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => new ChatDisplayPreferencesStore(AsyncStorage));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    // Settings shows the published storage failure and offers an explicit retry.
    void store.hydrate().catch(() => undefined);
  }, [store]);
  return <ChatDisplayContext.Provider value={{ ...snapshot, setPreferences: store.setPreferences, retryLoad: store.hydrate }}>{children}</ChatDisplayContext.Provider>;
}
