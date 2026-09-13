import React, { useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import type { SessionDefaultsStore } from '../runtime/session-defaults';
import type { ModelChoice } from '../runtime/schema';
import { Button, Icon } from './ui';
import { SettingsRow, SettingsSection } from './SettingsControls';
import { CatalogStatus } from './CatalogStatus';
import type { CatalogAvailability } from '../runtime/model-refresh';

export type DefaultsPage = 'sessions' | 'default-model' | 'default-agent' | 'default-effort';

export function SessionDefaultsPage({ page, store, models, agents, connection, go, save, busy, offset, onScroll, compactSearch, onSearchFocus, hiddenModels, modelCatalog, agentCatalog, refreshCatalog }: {
  page: DefaultsPage; store: SessionDefaultsStore; models: ModelChoice[]; agents: string[]; connection: string;
  go: (page: DefaultsPage) => void; save: (operation: () => Promise<void>) => void; busy: boolean;
  offset: number; onScroll: (offset: number) => void;
  compactSearch: boolean; onSearchFocus: (focused: boolean) => void;
  hiddenModels: string[];
  modelCatalog: CatalogAvailability; agentCatalog: CatalogAvailability; refreshCatalog: () => void;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { colors, appearance } = useTheme(); const { font, text } = useTypography(); const { t } = useI18n();
  const [query, setQuery] = useState('');
  const searchInput = useRef<TextInput>(null);
  const modelList = useRef<FlatList<ModelChoice>>(null);
  const selected = models.find(model => `${model.providerID}/${model.id}` === state.defaults.defaultModel);
  const inherited = t('settings.openchamber.defaults.option.default');
  const disabled = busy || state.loading || state.saving || !state.ready;
  const update = (patch: Parameters<SessionDefaultsStore['save']>[0]) => { Keyboard.dismiss(); save(async () => { await store.save(patch); }); };
  const secondary = [text(14, 21), { color: colors.surface.mutedForeground, fontFamily: font.regular }];
  const content = [styles.content, { paddingBottom: 32 * appearance.density / 100 }];
  const status = <>
    {state.loading && <Text accessibilityLiveRegion="polite" style={[secondary, styles.notice]}>{t('common.loading')}</Text>}
    {state.error === 'load' && <View style={styles.notice}>
      <Text accessibilityRole="alert" style={secondary}>{t('mobile.native.defaults.loadFailed')}</Text>
      <Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} disabled={state.loading} onPress={() => { void store.load().catch(() => {}); }} testID="defaults-load-retry" />
    </View>}
  </>;
  if (page === 'default-model') {
    const normalized = query.trim().toLocaleLowerCase();
    const hidden = new Set(hiddenModels);
    const filtered = models.filter(model => !hidden.has(`${model.providerID}/${model.id}`) && `${model.name} ${model.provider} ${model.id}`.toLocaleLowerCase().includes(normalized));
    return <FlatList ref={modelList} data={filtered} keyExtractor={model => `${model.providerID}/${model.id}`} style={styles.list} contentContainerStyle={content} contentOffset={{ x: 0, y: offset }} onScroll={event => onScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} testID="settings-page-default-model"
      ListHeaderComponent={<>{status}<View style={[styles.search, compactSearch && styles.compactSearch, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }]}>
        {compactSearch && <Button icon="arrow-left" label={t('settings.view.actions.back')} onPress={() => { searchInput.current?.blur(); Keyboard.dismiss(); onSearchFocus(false); }} testID="defaults-model-search-dismiss" animateIcon={false} />}
        <Icon name="search" size={19} color={colors.surface.mutedForeground} />
        <TextInput ref={searchInput} disableFullscreenUI value={query} onChangeText={setQuery} onFocus={() => { onSearchFocus(true); modelList.current?.scrollToOffset({ offset: 0, animated: false }); }} onBlur={() => onSearchFocus(false)} returnKeyType="search" onSubmitEditing={() => { Keyboard.dismiss(); onSearchFocus(false); }} autoCorrect={false} autoCapitalize="none" accessibilityLabel={t('chat.modelControls.searchModels')} placeholder={t('chat.modelControls.searchModels')} placeholderTextColor={colors.surface.mutedForeground} style={[styles.searchInput, compactSearch && styles.compactSearchInput, text(16, 22), { color: colors.surface.foreground, fontFamily: font.regular }]} testID="defaults-model-search" />
      </View>
      {!compactSearch && <Button variant="setting" showSelection selected={state.ready && !state.defaults.defaultModel} label={inherited} onPress={() => update({ defaultModel: '', defaultVariant: '' })} disabled={disabled} testID="defaults-model-reset" />}
      <CatalogStatus availability={modelCatalog} retry={refreshCatalog} />
      {!compactSearch && state.ready && modelCatalog.available && state.defaults.defaultModel && !selected && <Text style={[secondary, styles.notice]}>{state.defaults.defaultModel}{'\n'}{t('mobile.native.defaults.unavailable')}</Text>}
      </>}
      ListEmptyComponent={state.loading || !modelCatalog.available ? null : <Text style={[secondary, styles.notice]}>{t('chat.modelControls.noProvidersOrModelsFound')}</Text>}
      renderItem={({ item }) => <Button variant="setting" showSelection selected={state.ready && selected === item} label={`${item.name}, ${item.provider}`} disabled={disabled} onPress={() => { if (selected !== item) update({ defaultModel: `${item.providerID}/${item.id}` }); }} testID={`defaults-model-${item.providerID}-${item.id}`}>
        <View style={{ flex: 1 }}><Text style={[text(16, 23), { fontFamily: font.regular, color: colors.surface.foreground }]}>{item.name}</Text>{!compactSearch && <Text style={[text(13, 19), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{item.provider}</Text>}</View>
      </Button>} />;
  }
  return <ScrollView contentContainerStyle={content} contentOffset={{ x: 0, y: offset }} onScroll={event => onScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" testID={`settings-page-${page}`}>
    {status}
    {page === 'sessions' && <SettingsSection title={t('settings.page.work.ai.defaultsTitle')}>
      <Text style={[secondary, styles.scope]}>{t('mobile.native.defaults.scope', { connection })}</Text>
      <SettingsRow title={t('settings.openchamber.defaults.field.defaultModel')} value={state.ready ? selected?.name || state.defaults.defaultModel || inherited : t('common.loading')} icon="robot" onPress={() => go('default-model')} testID="settings-default-model" />
      <SettingsRow title={t('settings.openchamber.defaults.field.defaultThinking')} value={state.ready ? state.defaults.defaultVariant || inherited : t('common.loading')} icon="equalizer-2" onPress={() => go('default-effort')} testID="settings-default-effort" />
      <SettingsRow title={t('settings.openchamber.defaults.field.defaultAgent')} value={state.ready ? state.defaults.defaultAgent || inherited : t('common.loading')} icon="chat-3" onPress={() => go('default-agent')} testID="settings-default-agent" />
    </SettingsSection>}
    {page === 'default-agent' && <SettingsSection>
      <CatalogStatus availability={agentCatalog} retry={refreshCatalog} />
      {state.ready && agentCatalog.available && state.defaults.defaultAgent && !agents.includes(state.defaults.defaultAgent) && <Text style={[secondary, styles.notice]}>{state.defaults.defaultAgent}{'\n'}{t('mobile.native.defaults.unavailable')}</Text>}
      {['', ...agents].map(agent => <Button key={agent} variant="setting" showSelection label={agent || inherited} selected={state.ready && state.defaults.defaultAgent === agent} disabled={disabled} onPress={() => update({ defaultAgent: agent })} testID={`defaults-agent-${agent || 'reset'}`} />)}
    </SettingsSection>}
    {page === 'default-effort' && <SettingsSection>
      <CatalogStatus availability={modelCatalog} retry={refreshCatalog} />
      {selected && <Text style={[secondary, styles.scope]}>{selected.name}</Text>}
      {state.ready && modelCatalog.available && state.defaults.defaultVariant && !selected?.variants.includes(state.defaults.defaultVariant) && <Text style={[secondary, styles.notice]}>{state.defaults.defaultVariant}{'\n'}{t('mobile.native.defaults.unavailable')}</Text>}
      {['', ...(selected?.variants ?? [])].map(variant => <Button key={variant} variant="setting" showSelection label={variant || inherited} selected={state.ready && state.defaults.defaultVariant === variant} disabled={disabled} onPress={() => update({ defaultVariant: variant })} testID={`defaults-effort-${variant || 'reset'}`} />)}
    </SettingsSection>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  list: { flex: 1 }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16 },
  notice: { paddingHorizontal: 12, paddingVertical: 16 }, scope: { paddingHorizontal: 12, paddingBottom: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, marginVertical: 12 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, includeFontPadding: false },
  compactSearch: { marginTop: 0, marginBottom: 0, paddingLeft: 0 }, compactSearchInput: { paddingVertical: 4 },
});
