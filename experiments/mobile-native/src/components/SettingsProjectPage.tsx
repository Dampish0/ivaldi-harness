import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import type { SettingsProjectsStore } from '../runtime/settings-projects';
import { Button, Icon } from './ui';
import { SettingsSection } from './SettingsControls';

export function SettingsProjectPage({ store, choose, busy, compactSearch, onSearchFocus, active, currentProjectAvailable }: {
  store: SettingsProjectsStore; choose: (projectID: string | null) => void; busy: boolean;
  compactSearch: boolean; onSearchFocus: (focused: boolean) => void;
  active: boolean;
  currentProjectAvailable: boolean;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { t, locale } = useI18n(); const { colors, appearance } = useTheme(); const { font, text } = useTypography();
  const [query, setQuery] = useState(''); const input = useRef<TextInput>(null);
  const list = useRef<FlatList<(typeof state.projects)[number]>>(null);
  const normalized = query.trim().toLocaleLowerCase(locale);
  const projects = state.projects.filter(project => `${project.label ?? ''} ${project.path}`.toLocaleLowerCase(locale).includes(normalized));
  const secondary = [text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }];
  useEffect(() => { if (!active) return; void store.load().catch(() => {}); return store.cancelLoad; }, [store, active]);
  return <FlatList ref={list} data={projects} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} contentContainerStyle={[styles.content, { paddingBottom: 32 * appearance.density / 100 }]} testID="settings-page-settings-project"
    ListHeaderComponent={<>
      <View style={[styles.search, compactSearch && styles.compactSearch, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }]}>
        {compactSearch && <Button icon="arrow-left" label={t('settings.view.actions.back')} onPress={() => { input.current?.blur(); Keyboard.dismiss(); onSearchFocus(false); }} testID="settings-project-search-dismiss" animateIcon={false} />}
        <Icon name="search" size={19} color={colors.surface.mutedForeground} />
        <TextInput ref={input} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} disableFullscreenUI returnKeyType="search"
          onFocus={() => { onSearchFocus(true); list.current?.scrollToOffset({ offset: 0, animated: false }); }} onBlur={() => onSearchFocus(false)} onSubmitEditing={() => { Keyboard.dismiss(); onSearchFocus(false); }}
          accessibilityLabel={t('chat.chatInput.draftPicker.searchProjects')} placeholder={t('chat.chatInput.draftPicker.searchProjects')} placeholderTextColor={colors.surface.mutedForeground}
          style={[styles.input, compactSearch && styles.compactInput, text(16, 22), { fontFamily: font.regular, color: colors.surface.foreground }]} testID="settings-project-search" />
        {query.length > 0 && <Button icon="close" label={t('settings.view.search.clear')} onPress={() => setQuery('')} testID="settings-project-search-clear" animateIcon={false} />}
      </View>
      {!compactSearch && <SettingsSection title={t('mobile.native.settingsProject')} info={t('mobile.native.settingsProjectDescription')}>
        <Button variant="setting" showSelection selected={state.selectedId === null} label={t('mobile.native.settingsProjectCurrent')} onPress={() => choose(null)} disabled={busy || state.loading || !currentProjectAvailable} testID="settings-project-current">
          <View style={styles.rowText}><Text style={[text(16, 23), { fontFamily: font.regular, color: colors.surface.foreground }]}>{t('mobile.native.settingsProjectCurrent')}</Text><Text style={secondary}>{t(currentProjectAvailable ? 'mobile.native.settingsProjectCurrentDescription' : 'common.unavailable')}</Text></View>
        </Button>
      </SettingsSection>}
      {state.loading && <Text accessibilityLiveRegion="polite" style={[secondary, styles.notice]}>{t('common.loading')}</Text>}
      {state.error && <View style={styles.notice}><Text accessibilityRole="alert" style={secondary}>{t('mobile.native.settingsProjectUnavailable')}</Text><Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} disabled={busy || state.loading} onPress={() => { void store.load().catch(() => {}); }} testID="settings-project-retry" /></View>}
    </>}
    ListEmptyComponent={!state.loading && state.ready && !state.error ? <Text style={[secondary, styles.notice]}>{t(normalized ? 'settings.view.search.noResults' : 'mobile.native.settingsProjectEmpty')}</Text> : null}
    renderItem={({ item }) => <Button variant="setting" showSelection selected={item.id === state.selectedId} label={`${item.label || item.path.split(/[\\/]/).filter(Boolean).at(-1) || item.path}, ${item.path}`}
      disabled={busy || state.loading || !!state.error} onPress={() => choose(item.id)} testID={`settings-project-${item.id}`}>
      <View style={styles.rowText}><Text style={[text(16, 23), { fontFamily: font.regular, color: colors.surface.foreground }]}>{item.label || item.path.split(/[\\/]/).filter(Boolean).at(-1) || item.path}</Text>{!compactSearch && <Text style={[text(13, 19), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{item.path}</Text>}</View>
    </Button>} />;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14, paddingRight: 4, marginTop: 12 },
  input: { flex: 1, minWidth: 0, paddingVertical: 12, includeFontPadding: false }, compactSearch: { marginTop: 0, paddingLeft: 0 }, compactInput: { paddingVertical: 4 },
  rowText: { flex: 1, gap: 2 }, notice: { paddingHorizontal: 12, paddingVertical: 16 },
});
