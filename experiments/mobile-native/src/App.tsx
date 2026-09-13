import React, { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useFonts } from 'expo-font';
import { ThemeProvider } from './ThemeProvider';
import { ChatDisplayProvider } from './ChatDisplayProvider';
import { useTheme } from './theme';
import regularFont from '../assets/fonts/selawk.ttf';
import semiboldFont from '../assets/fonts/selawksb.ttf';
import { Connections } from './components/Connections';
import { ChatScreen } from './components/ChatScreen';
import { wasPairingRedeemed, type NativeRuntime } from './runtime/connection';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModelVisibilityStore } from './runtime/model-visibility';

export default function App() {
  const [loaded, error] = useFonts({ Selawik: regularFont, SelawikSemibold: semiboldFont });
  if (error) throw error;
  if (!loaded) return null;
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><ThemeProvider><ChatDisplayProvider><KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge><RuntimeScreen /></KeyboardProvider></ChatDisplayProvider></ThemeProvider></SafeAreaProvider></GestureHandlerRootView>;
}
function RuntimeScreen() {
  const [modelVisibility] = useState(() => new ModelVisibilityStore(AsyncStorage));
  useEffect(() => { void modelVisibility.load().catch(() => {}); }, [modelVisibility]);
  const [connection, setConnection] = useState<{ runtime: NativeRuntime; activation: number } | null>(null);
  const runtime = connection?.runtime;
  const [connections, setConnections] = useState(false);
  const [incomingLink, setIncomingLink] = useState<string | null | undefined>(undefined);
  const { colors } = useTheme();
  useEffect(() => {
    let active = true;
    const listener = Linking.addEventListener('url', event => { setIncomingLink(event.url); setConnections(true); });
    void Linking.getInitialURL().then(async link => {
      // Android can retain the launch intent when font-size changes recreate the
      // Activity. Restore the saved connection after successful redemption.
      const redeemed = link ? await wasPairingRedeemed(link).catch(() => false) : false;
      if (active) setIncomingLink(previous => previous === undefined ? redeemed ? null : link : previous);
    }).catch(() => { if (active) setIncomingLink(null); });
    return () => { active = false; listener.remove(); };
  }, []);
  const connected = useCallback((next: NativeRuntime, pendingLink?: string) => {
    // A confirmed connection starts a new runtime lifetime, even for the same
    // saved server. Old Settings retries must never target the replacement.
    setConnection(previous => ({ runtime: next, activation: (previous?.activation ?? 0) + 1 }));
    setConnections(Boolean(pendingLink)); setIncomingLink(pendingLink ?? null);
  }, []);
  return <View style={{ flex: 1, backgroundColor: colors.surface.background }}>
    {connection && <ChatScreen key={connection.activation} runtime={connection.runtime} foreground={!connections} openConnections={() => setConnections(true)} modelVisibility={modelVisibility} />}
    {incomingLink !== undefined && (!runtime || connections) && <View style={{ position: 'absolute', inset: 0, zIndex: 100, elevation: 100, backgroundColor: colors.surface.background }}><Connections incomingLink={incomingLink} autoRestore={!runtime && !incomingLink} connected={connected} close={runtime ? () => { setConnections(false); setIncomingLink(null); } : undefined} /></View>}
  </View>;
}

