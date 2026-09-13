import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, BackHandler, Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { Button } from './ui';
import { Folder } from './Folder';
import { useTheme, useTypography } from '../theme';
import { ConnectionError, connectAddress, inspectPairing, reconnect, redeemPairing, type NativeRuntime } from '../runtime/connection';
import { forgetConnection, readActiveConnection, readConnections, setActiveConnection } from '../runtime/storage';
import { ConnectionAttempts } from '../runtime/connection-attempt';
import type { SavedConnection } from '../runtime/schema';

const errors = { invalidUrl: 'mobile.connect.error.invalidUrl', unreachable: 'mobile.connect.error.unreachable', authRequired: 'mobile.connect.error.authRequired', passwordFailed: 'mobile.connect.error.passwordFailed', invalidPairing: 'mobile.connect.scan.invalid', storage: 'mobile.native.saveFailed' } satisfies { [code in ConnectionError['code']]: MessageKey };

export function Connections({ connected, close, autoRestore = false, incomingLink }: { connected: (runtime: NativeRuntime, pendingLink?: string) => void; close?: () => void; autoRestore?: boolean; incomingLink: string | null }) {
  const { colors, appearance } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n(); const safe = useSafeAreaInsets();
  const [saved, setSaved] = useState<SavedConnection[]>([]);
  const [address, setAddress] = useState(''); const [password, setPassword] = useState(''); const [token, setToken] = useState('');
  const [pairing, setPairing] = useState<{ link: string; label: string; fingerprint?: string } | null>(null);
  const [error, setError] = useState<MessageKey | null>(null); const [scan, setScan] = useState(false);
  const [attempts] = useState(() => new ConnectionAttempts<NativeRuntime>(async id => {
    try { await setActiveConnection(id); } catch { throw new ConnectionError('storage'); }
  }));
  const attemptStatus = useSyncExternalStore(attempts.subscribe, attempts.getSnapshot);
  const busy = attemptStatus !== 'idle';
  const mounted = useRef(false);
  const navigationRevision = useRef(0);
  const savedRevision = useRef(0);
  const restoreOnMount = useRef(autoRestore);
  const [permission, requestPermission] = useCameraPermissions();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempts.dispose(); }; }, [attempts]);
  const refreshSaved = useCallback(async () => {
    const revision = ++savedRevision.current;
    const connections = await readConnections();
    if (mounted.current && revision === savedRevision.current) setSaved(connections);
    return connections;
  }, []);
  const cancelAttempt = useCallback(() => {
    if (!attempts.cancel()) return false;
    navigationRevision.current++;
    Keyboard.dismiss();
    return true;
  }, [attempts]);
  const dismiss = useCallback(() => { if (cancelAttempt()) close?.(); }, [cancelAttempt, close]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (attempts.getSnapshot() !== 'idle') { if (cancelAttempt()) { if (close) close(); else setPairing(null); } return true; }
      if (scan) { setScan(false); return true; }
      if (pairing) { setPairing(null); return true; }
      if (close) { dismiss(); return true; }
      return false;
    });
    return () => listener.remove();
  }, [scan, pairing, close, attempts, cancelAttempt, dismiss]);
  const acceptLink = useCallback((link: string) => {
    try {
      const normalized = link.replace(/^ivaldi-native:/i, 'ivaldi:');
      const inspected = inspectPairing(normalized);
      navigationRevision.current++;
      if (!attempts.replaceWithLink(normalized)) return;
      setPairing({ link: normalized, ...inspected }); setAddress(''); setScan(false); Keyboard.dismiss(); setError(null);
    }
    catch { setError('mobile.connect.scan.invalid'); }
  }, [attempts]);
  useEffect(() => { if (incomingLink) acceptLink(incomingLink); }, [incomingLink, acceptLink]);
  const run = useCallback(async (operation: () => Promise<NativeRuntime | null>, recovery = false) => {
    if (attempts.getSnapshot() !== 'idle') return;
    navigationRevision.current++;
    Keyboard.dismiss(); setError(null);
    try {
      const runtime = await attempts.run(operation);
      if (!runtime) return;
      if (!mounted.current) { runtime.close(); return; }
      setPassword(''); setToken('');
      const pendingLink = attempts.takePendingLink();
      if (pendingLink) acceptLink(pendingLink); else setPairing(null);
      connected(runtime, pendingLink ?? undefined);
    } catch (cause) {
      if (!mounted.current) return;
      const pendingLink = attempts.takePendingLink();
      if (pendingLink) acceptLink(pendingLink);
      setError(recovery ? 'mobile.connect.recovery.description' : cause instanceof ConnectionError ? errors[cause.code] : 'mobile.connect.error.unreachable');
    } finally {
      // A cancelled single-use redemption can still save its issued token.
      // Expose that saved connection without switching the active runtime or
      // publishing an abandoned request's error into a newer connection form.
      if (mounted.current) void refreshSaved().catch(() => undefined);
    }
  }, [attempts, connected, acceptLink, refreshSaved]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const connections = await refreshSaved();
      if (!active) return null;
      if (restoreOnMount.current) {
        const id = await readActiveConnection();
        const previous = connections.find(item => item.id === id);
        if (previous && active && revision === navigationRevision.current) return reconnect(previous);
      }
      return null;
    };
    // run takes its lock before the storage reads, so startup restoration and
    // a same-frame button press cannot establish competing active runtimes.
    const revision = navigationRevision.current + (restoreOnMount.current ? 1 : 0);
    if (restoreOnMount.current) void run(load, true);
    else void load().catch(() => { if (active) setError('mobile.connect.recovery.description'); });
    return () => { active = false; };
  }, [run, refreshSaved]);
  const beginScan = async () => {
    if (attempts.getSnapshot() !== 'idle') return;
    const revision = ++navigationRevision.current;
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!mounted.current || revision !== navigationRevision.current) return;
    if (granted) setScan(true); else setError('mobile.connect.scan.permissionDenied');
  };
  const inputStyle = [styles.input, typography.text(16, 24), { fontFamily: font.regular }, { color: colors.surface.foreground, borderColor: colors.interactive.border, backgroundColor: colors.surface.elevated }];
  if (scan) return <View style={{ flex: 1, paddingTop: safe.top, paddingBottom: safe.bottom, paddingLeft: safe.left, paddingRight: safe.right }}><Button variant="row" icon="close" label={t('mobile.surface.closeAria')} onPress={() => setScan(false)} /><CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={event => acceptLink(event.data)} /></View>;
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, paddingTop: safe.top, paddingLeft: safe.left, paddingRight: safe.right }}>
    <View style={styles.header}><Text style={[styles.headerTitle, typography.text(18, 24), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.foreground }]}>{t('mobile.connect.welcome.title')}</Text>{close && <Button icon="close" label={t('mobile.surface.closeAria')} disabled={attemptStatus === 'activating'} onPress={dismiss} testID="connections-close" />}</View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.page, { gap: 20 * appearance.density / 100, paddingBottom: safe.bottom + 28 }]}>
    {!pairing && <Text style={[typography.text(15, 23), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{t('mobile.connect.welcome.scanHint')}</Text>}
    {error && <Text accessibilityRole="alert" style={[typography.text(15, 23), { fontFamily: font.regular }, { color: colors.status.error }]}>{t(error)}</Text>}
    {busy ? <View style={{ gap: 12 }}><ActivityIndicator color={colors.surface.foreground} /><Button variant="row" label={t('gitView.common.cancel')} disabled={attemptStatus === 'activating'} onPress={() => { if (cancelAttempt()) setPairing(null); }} testID="cancel-connection" /></View> : <>
      {pairing ? <View style={[styles.pairing, { backgroundColor: colors.surface.elevated }]}>
        <Text style={[typography.text(20, 28), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.foreground }]}>{pairing.label}</Text>
        <Text style={[typography.text(15, 23), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{pairing.fingerprint}</Text>
        <Button variant="action" label={t('mobile.connect.connectButton')} onPress={() => { void run(() => redeemPairing(pairing.link)); }} testID="confirm-pairing" />
        <Button variant="row" label={t('gitView.common.cancel')} onPress={() => setPairing(null)} />
      </View> : <>
        <Button variant="action" icon="camera" iconSize={20} label={t('mobile.connect.scanQr')} onPress={() => { Keyboard.dismiss(); void beginScan(); }} testID="scan-qr" />
        <Folder detail title={t('mobile.connect.manual.toggle')} testID="manual-connection">
        <View style={{ gap: 12, paddingRight: 12, paddingBottom: 8 }}>
        <TextInput disableFullscreenUI value={address} onChangeText={value => { if (/^(ivaldi|openchamber|ivaldi-native):/i.test(value)) acceptLink(value); else setAddress(value); }} autoCapitalize="none" autoCorrect={false} placeholder={t('mobile.connect.url.label')} accessibilityLabel={t('mobile.connect.url.label')} placeholderTextColor={colors.surface.mutedForeground} style={inputStyle} testID="server-address" returnKeyType="go" onSubmitEditing={() => { if (address.trim()) void run(() => connectAddress(address, password, token)); }} />
          <TextInput disableFullscreenUI value={password} onChangeText={setPassword} secureTextEntry placeholder={t('mobile.connect.password.placeholder')} accessibilityLabel={t('mobile.connect.password.label')} placeholderTextColor={colors.surface.mutedForeground} style={inputStyle} />
          <Folder detail title={t('mobile.connect.advanced')} testID="connection-advanced">
          <TextInput disableFullscreenUI value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={t('mobile.connect.token.label')} accessibilityLabel={t('mobile.connect.token.label')} placeholderTextColor={colors.surface.mutedForeground} style={inputStyle} />
          <Text style={[typography.text(15, 23), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{t('mobile.connect.token.hint')}</Text>
          </Folder>
          <Button variant="action" disabled={!address.trim()} label={t('mobile.connect.connectButton')} onPress={() => { void run(() => connectAddress(address, password, token)); }} testID="connect-server" />
        </View></Folder>
      </>}
      {saved.length > 0 && <Text style={[styles.section, typography.text(13, 18), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.mutedForeground }]}>{t('mobile.connect.saved.title')}</Text>}
      <View style={{ gap: 4 }}>{saved.map(connection => <View key={connection.id} style={{ flexDirection: 'row', alignItems: 'center' }}><Button variant="row" icon="computer" iconSize={20} style={{ flex: 1 }} label={connection.label} onPress={() => { void run(() => reconnect(connection)); }} /><Button icon="delete-bin" iconSize={18} muted label={t('mobile.instances.confirmDeleteAria', { label: connection.label })} onPress={() => Alert.alert(connection.label, t('mobile.instances.confirmDeleteAria', { label: connection.label }), [{ text: t('gitView.common.cancel'), style: 'cancel' }, { text: t('mobile.instances.confirmDeleteAria', { label: connection.label }), style: 'destructive', onPress: () => { void forgetConnection(connection.id).then(() => readConnections()).then(setSaved).catch(() => setError('mobile.connect.recovery.description')); } }])} /></View>)}</View>
    </>}
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ page: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 28, gap: 20 }, header: { minHeight: 64, paddingLeft: 24, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerTitle: { flex: 1 }, pairing: { gap: 16, padding: 20, borderRadius: 20 }, section: { marginTop: 12 }, input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 } });
