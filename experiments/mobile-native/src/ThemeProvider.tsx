import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dark from './generated/dark.json';
import light from './generated/light.json';

import { ThemeContext } from './theme';
import { AppearancePreferencesStore } from './runtime/appearance';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preferences] = useState(() => new AppearancePreferencesStore(AsyncStorage));
  const snapshot = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  useEffect(() => {
    // The store publishes failures for the Settings page to show and retry.
    void preferences.hydrate().catch(() => undefined);
  }, [preferences]);
  const isDark = snapshot.appearance.scheme === 'system' ? system !== 'light' : snapshot.appearance.scheme === 'dark';
  const toggle = () => preferences.setAppearance({ scheme: isDark ? 'light' : 'dark' });
  return <ThemeContext.Provider value={{ ...snapshot, colors: (isDark ? dark : light).colors, dark: isDark, toggle, setAppearance: preferences.setAppearance }}>{children}</ThemeContext.Provider>;
}
