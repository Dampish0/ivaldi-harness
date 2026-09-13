import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useI18n } from '@/lib/i18n';
import { movement } from '../motion';
import { useTheme, useTypography } from '../theme';
import type { NativeRuntime } from '../runtime/connection';
import { allowsWorkspaceNavigation } from '../runtime/workspace';
import { WorkspaceLoader } from '../runtime/workspace-load';
import { Button, Icon } from './ui';

export function Workspace({ runtime, sessionId, mode, close }: { runtime: NativeRuntime; sessionId: string | null; mode: 'work' | 'developer'; close: () => void }) {
  const { colors } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n(); const safe = useSafeAreaInsets();
  const loader = useMemo(() => new WorkspaceLoader(() => runtime.workspace(sessionId, mode)), [runtime, sessionId, mode]);
  const state = useSyncExternalStore(loader.subscribe, loader.getSnapshot);
  const { page, attempt } = state;
  const opacity = useSharedValue(0);
  const pageStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => {
    Keyboard.dismiss();
    void loader.load();
    return loader.cancel;
  }, [loader]);
  useEffect(() => { opacity.value = withTiming(state.status === 'ready' ? 1 : 0, { ...movement, duration: 180 }); }, [state.status, opacity]);
  const leave = () => { loader.cancel(); Keyboard.dismiss(); close(); };

  return <View accessibilityViewIsModal testID="workspace" style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface.background, paddingTop: safe.top, paddingBottom: safe.bottom, paddingLeft: safe.left, paddingRight: safe.right, zIndex: 20 }]}>
    <View style={styles.header}>
      <Button icon="arrow-left" label={t('mobile.surface.closeAria')} onPress={leave} testID="close-workspace" />
      <Text accessibilityRole="header" style={[styles.title, typography.text(18, 24), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight, color: colors.surface.foreground }]}>{t('mobile.header.workspace')}</Text>
    </View>
    <View style={styles.stage}>
      {page && <Animated.View pointerEvents={state.status === 'ready' ? 'auto' : 'none'} accessibilityElementsHidden={state.status !== 'ready'} importantForAccessibility={state.status === 'ready' ? 'auto' : 'no-hide-descendants'} style={[StyleSheet.absoluteFill, pageStyle]}>
        <WebView key={attempt} source={page} originWhitelist={['*']} incognito cacheEnabled={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false} allowUniversalAccessFromFileURLs={false} javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows
          onShouldStartLoadWithRequest={request => request.isTopFrame === false || allowsWorkspaceNavigation(request.url, page.baseUrl)}
          onLoadStart={() => loader.loading(attempt)} onLoad={() => loader.ready(attempt)} onError={() => loader.failed(attempt)}
          onHttpError={event => { if (allowsWorkspaceNavigation(event.nativeEvent.url, page.baseUrl)) loader.failed(attempt); }}
          onRenderProcessGone={() => loader.failed(attempt)} onContentProcessDidTerminate={() => loader.failed(attempt)}
          style={[styles.stage, { backgroundColor: colors.surface.background }]} />
      </Animated.View>}
      {state.status !== 'ready' && <ScrollView style={styles.stage} contentContainerStyle={styles.feedback} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}>
          {state.status === 'failed' ? <Icon name="folder-3" size={32} color={colors.surface.mutedForeground} /> : <ActivityIndicator color={colors.surface.foreground} accessibilityLabel={t('common.loading')} />}
          <Text accessibilityRole={state.status === 'failed' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.note, typography.text(16, 24), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{t(state.status === 'failed' ? 'mobile.native.workspace.loadFailed' : 'common.loading')}</Text>
          {state.status === 'failed' && <Button variant="action" label={t('contextPanel.preview.actions.retry')} onPress={() => { void loader.load(); }} testID="workspace-retry" />}
        </View>
      </ScrollView>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 64 },
  title: { flex: 1, includeFontPadding: false },
  stage: { flex: 1 },
  feedback: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  notice: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 20 },
  note: { textAlign: 'center', includeFontPadding: false },
});
