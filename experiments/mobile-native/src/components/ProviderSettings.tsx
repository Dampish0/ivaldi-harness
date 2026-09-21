import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, FlatList, Keyboard, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import { collectPromptInputs, defaultPromptValues, visiblePrompts, shouldOpenOAuthUrl, ProviderOperationError, type ProvidersStore, type OAuthAuthorization, type NativeProvider, type ProviderAuthMethod, type ProviderOperation } from '../runtime/providers';
import { Button, Icon } from './ui';
import { SettingsForm, SettingsInput, SettingsRow, SettingsSection, SettingsToggle } from './SettingsControls';
import type { ModelVisibilityStore } from '../runtime/model-visibility';

export type ProviderPage = 'providers' | 'provider-detail' | 'provider-auth';
export function ProviderSettings({ page, store, providerID, methodIndex, go, openCustom, compactSearch, compactAuth, onSearchFocus, offset, onScroll, query, setQuery, modelVisibility, save, busy: settingsBusy, projectLabel, openProject, directory, active }: {
  page: ProviderPage; store: ProvidersStore; providerID: string | null; methodIndex: number | null;
  go: (page: ProviderPage, providerID?: string, methodIndex?: number) => void;
  openCustom: (providerID?: string) => void;
  compactSearch: boolean; compactAuth: boolean; onSearchFocus: (focused: boolean) => void;
  offset: number; onScroll: (offset: number) => void;
  query: string; setQuery: (value: string) => void;
  modelVisibility: ModelVisibilityStore; save: (operation: () => Promise<void>) => void; busy: boolean;
  projectLabel: string; openProject: () => void; directory: string | undefined | null; active: boolean;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const visibility = useSyncExternalStore(modelVisibility.subscribe, modelVisibility.getSnapshot);
  const hidden = new Set(visibility.hidden);
  const { t } = useI18n(); const { colors } = useTheme(); const { font, text } = useTypography();
  const [key, setKey] = useState(''); const [code, setCode] = useState('');
  const [authorization, setAuthorization] = useState<OAuthAuthorization | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showBusy, setShowBusy] = useState(false);
  const input = useRef<TextInput>(null); const list = useRef<FlatList<NativeProvider>>(null);
  const request = useRef(0);
  const catalog = directory === null ? [] : state.catalog.value?.all ?? [];
  // A successful config or credential write can precede OpenCode's next catalog.
  // Keep its explicit pending identity reachable until Apply returns live data.
  const pendingProviders: NativeProvider[] = directory === null ? [] : state.pendingRestart.filter(id => !catalog.some(item => item.id === id)).map(id => ({ id, name: id, models: {} }));
  const availableProviders = [...catalog, ...pendingProviders];
  const provider = availableProviders.find(item => item.id === providerID);
  const declared = providerID ? state.methods.value?.[providerID] ?? [] : [];
  const methods: ProviderAuthMethod[] = state.methods.value && !state.methods.error && declared.length === 0 ? [{ type: 'api', label: t('settings.providers.page.auth.apiKeyLabel') }] : declared;
  const method = methodIndex === null ? undefined : methods[methodIndex];
  const prompts = method?.prompts ?? [];
  const [answers, setAnswers] = useState(() => defaultPromptValues(prompts));
  const source = providerID ? state.sources[providerID] : undefined;
  const operationBusy = state.mutation !== null || settingsBusy || visibility.saving;
  const busy = operationBusy || directory === null;
  const primary = [text(16, 23), { fontFamily: font.regular, color: colors.surface.foreground }];
  const secondary = [text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }];
  useEffect(() => { if (active) void store.load().catch(() => {}); }, [active, directory, store]);
  useEffect(() => { if (active && providerID) void store.loadSource(providerID).catch(() => {}); }, [active, directory, providerID, store]);
  useEffect(() => { setAuthorization(null); setCode(''); }, [directory]);
  useEffect(() => {
    const owner = request;
    return () => { owner.current++; if (page === 'provider-auth') store.cancelOAuth(); };
  }, [directory, page, store]);
  useEffect(() => {
    setShowBusy(false);
    if (!state.mutation) return;
    const timer = setTimeout(() => setShowBusy(true), 500);
    return () => clearTimeout(timer);
  }, [state.mutation]);
  const perform = <T,>(operation: () => Promise<T>) => { setLocalError(null); void operation().catch(() => {}); };
  const failed = state.error && (state.error.providerID === null || state.error.providerID === providerID);
  const failureKeys = {
    key: 'settings.providers.page.toast.apiKeySaveFailed', remove: 'settings.providers.page.toast.providerDisconnectFailed',
    authorize: 'settings.providers.page.toast.oauthStartFailed', callback: 'settings.providers.page.toast.oauthCompleteFailed',
    apply: 'settings.view.pendingRestart.applyFailed',
    config: 'mobile.native.customProvider.saveFailed',
  } satisfies { [operation in ProviderOperation]: MessageKey };
  const feedback = <>
    {showBusy && <Text accessibilityLiveRegion="polite" style={[secondary, styles.notice]}>{t(state.mutation?.kind === 'callback' ? 'settings.providers.page.auth.oauth.waiting' : state.mutation?.kind === 'apply' ? 'settings.view.pendingRestart.applying' : 'settings.common.actions.saving')}</Text>}
    {(localError || failed) && <Text accessibilityRole="alert" style={[secondary, styles.notice, { color: colors.status.error }]}>{localError ?? (state.error ? t(failureKeys[state.error.operation] ?? 'mobile.native.actionFailed') : '')}</Text>}
  </>;
  const apply = () => {
    if (state.applyState === 'manual') { perform(() => store.confirmManualRestart()); return; }
    if (state.applyState === 'refresh') { perform(() => store.apply()); return; }
    Alert.alert(t('settings.view.pendingRestart.confirm.title'), t('settings.view.pendingRestart.confirm.description'), [
      { text: t('settings.providers.page.actions.cancel'), style: 'cancel' },
      { text: t('settings.view.actions.applyAndRestartOpenCode'), onPress: () => perform(() => store.apply()) },
    ]);
  };
  const pending = state.applyState !== 'idle' && !compactSearch && <View style={styles.notice}>
    <Text style={secondary}>{t(state.applyState === 'manual' ? 'settings.view.pendingRestart.manualRestartRequired' : state.applyState === 'refresh' ? 'settings.providers.page.state.unableToLoadProviderList' : 'settings.view.pendingRestart.saved')}</Text>
    <Button variant="setting" icon="restart" label={t(state.applyState === 'manual' ? 'mobile.native.providers.restarted' : state.applyState === 'refresh' ? 'settings.common.actions.retry' : 'settings.view.actions.applyAndRestartOpenCode')} disabled={busy} onPress={apply} testID="providers-apply" />
  </View>;
  const search = <View style={[styles.search, compactSearch && styles.compactSearch, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }]}>
    {compactSearch && <Button icon="arrow-left" label={t('settings.view.actions.back')} onPress={() => { input.current?.blur(); Keyboard.dismiss(); onSearchFocus(false); }} testID="providers-search-dismiss" animateIcon={false} />}
    <Icon name="search" size={19} color={colors.surface.mutedForeground} />
    <TextInput ref={input} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} disableFullscreenUI onFocus={() => { onSearchFocus(true); list.current?.scrollToOffset({ offset: 0, animated: false }); }} onBlur={() => onSearchFocus(false)} onSubmitEditing={() => { Keyboard.dismiss(); onSearchFocus(false); }} returnKeyType="search" accessibilityLabel={t('settings.providers.page.connect.searchProvidersPlaceholder')} placeholder={t('settings.providers.page.connect.searchProvidersPlaceholder')} placeholderTextColor={colors.surface.mutedForeground} style={[styles.searchInput, compactSearch && styles.compactInput, text(16, 22), { fontFamily: font.regular, color: colors.surface.foreground }]} testID="providers-search" />
    {query && <Button icon="close" label={t('settings.view.search.clear')} onPress={() => setQuery('')} testID="providers-search-clear" animateIcon={false} />}
  </View>;
  if (page === 'providers') {
    const connected = new Set(state.catalog.value?.connected);
    const normalized = query.trim().toLocaleLowerCase();
    const providers = availableProviders.filter(item => `${item.name} ${item.id}`.toLocaleLowerCase().includes(normalized)).sort((a, b) => Number(connected.has(b.id)) - Number(connected.has(a.id)) || a.name.localeCompare(b.name));
    return <FlatList ref={list} data={providers} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} contentOffset={{ x: 0, y: offset }} onScroll={event => onScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} contentContainerStyle={styles.content} testID="settings-page-providers"
      ListHeaderComponent={<>{search}{!compactSearch && <SettingsSection><SettingsRow title={t('mobile.native.settingsProject')} value={projectLabel} icon="folder-3" onPress={openProject} disabled={operationBusy} testID="providers-settings-project" /></SettingsSection>}{feedback}{pending}{directory === null ? <Text accessibilityLiveRegion="polite" style={[secondary, styles.notice]}>{t('common.unavailable')}</Text> : <>{state.catalog.loading && <Text style={[secondary, styles.notice]}>{t('common.loading')}</Text>}{state.catalog.error && <View style={styles.notice}><Text accessibilityRole="alert" style={secondary}>{t('settings.providers.page.state.unableToLoadProviderList')}</Text><Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} onPress={() => perform(() => store.load())} disabled={busy || state.catalog.loading} testID="providers-load-retry" /></View>}</>}</>}
      ListEmptyComponent={directory !== null && !state.catalog.loading && state.catalog.value ? <Text style={[secondary, styles.notice]}>{t('settings.providers.page.connect.noProvidersFound')}</Text> : null}
      ListFooterComponent={<SettingsSection><SettingsRow title={t('settings.providers.page.custom.optionLabel')} icon="add" onPress={() => openCustom()} disabled={busy} testID="provider-custom-create" /></SettingsSection>}
      renderItem={({ item }) => <SettingsRow title={item.name} value={compactSearch ? undefined : state.pendingRestart.includes(item.id) ? t('settings.view.pendingRestart.saved') : connected.has(item.id) ? t('settings.providers.page.auth.connected') : undefined} icon="robot" onPress={() => go('provider-detail', item.id)} testID={`provider-${item.id}`} />} />;
  }
  if (directory === null) return <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={secondary}>{t('common.unavailable')}</Text></View>;
  if (!provider || !providerID) return <View style={styles.notice}><Text style={secondary}>{t(state.catalog.loading ? 'common.loading' : 'settings.providers.page.state.unableToLoadProviderList')}</Text><Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} onPress={() => perform(() => store.load())} disabled={busy || state.catalog.loading} testID="provider-load-retry" /></View>;
  if (page === 'provider-detail') {
    const models = Object.values(provider.models);
    const modelKeys = models.map(item => `${providerID}/${item.id}`);
    const sourceLabels = source?.value ? [
      source.value.auth.exists ? t('settings.providers.page.connectionDetails.source.authCredentials') : null,
      source.value.user.exists ? t('settings.providers.page.connectionDetails.source.userConfig') : null,
      source.value.project.exists ? t('settings.providers.page.connectionDetails.source.projectConfig') : null,
      source.value.custom.exists ? t('settings.providers.page.connectionDetails.source.customConfig') : null,
    ].filter(Boolean) : [];
    return <FlatList contentOffset={{ x: 0, y: offset }} onScroll={event => onScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} data={models} keyExtractor={item => item.id} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={5} contentContainerStyle={styles.content} testID="settings-page-provider-detail"
      ListHeaderComponent={<>{feedback}{pending}
        <SettingsSection title={t('settings.providers.page.auth.title')}>
          {state.catalog.value?.connected.includes(providerID) && <Text style={[secondary, styles.inset]}>{t('settings.providers.page.auth.connected')}</Text>}
          {state.methods.loading && <Text style={[secondary, styles.notice]}>{t('settings.providers.page.auth.loadingMethods')}</Text>}
          {state.methods.error ? <View style={styles.notice}><Text accessibilityRole="alert" style={secondary}>{t('settings.providers.page.toast.authMethodsLoadFailed')}</Text><Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} onPress={() => perform(() => store.load())} disabled={busy || state.methods.loading} testID="provider-methods-retry" /></View> : methods.map((choice, index) => <SettingsRow key={index} title={choice.label || t(choice.type === 'api' ? 'settings.providers.page.auth.apiKeyLabel' : 'settings.providers.page.auth.oauthMethodFallback', { index: index + 1 })} icon={choice.type === 'api' ? 'shield' : 'global'} disabled={busy || state.methods.loading || !state.methods.value} onPress={() => go('provider-auth', providerID, index)} testID={`provider-method-${index}`} />)}
          {state.methods.value && !state.methods.loading && !state.methods.error && methods.length === 0 && <Text style={[secondary, styles.notice]}>{t('common.unavailable')}</Text>}
        </SettingsSection>
        <SettingsSection title={t('settings.providers.page.connectionDetails.title')}>
          {source?.loading && <Text style={[secondary, styles.notice]}>{t('common.loading')}</Text>}
          {source?.error && <View style={styles.notice}><Text accessibilityRole="alert" style={secondary}>{t('settings.providers.page.toast.providerSourcesLoadFailed')}</Text><Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} onPress={() => perform(() => store.loadSource(providerID))} disabled={busy || source.loading} testID="provider-source-retry" /></View>}
          {source?.value && <Text style={[secondary, styles.inset]}>{sourceLabels.length ? sourceLabels.join('\n') : t('settings.providers.page.connectionDetails.noActiveSource')}</Text>}
          {source?.value && (source.value.user.exists || source.value.project.exists || source.value.custom.exists) && <SettingsRow title={t('mobile.native.customProvider.edit')} icon="settings-3" onPress={() => openCustom(providerID)} disabled={busy || source.error || source.loading} testID="provider-custom-edit" />}
          {providerID !== 'claude-code' && source?.value?.auth.exists && <Button variant="setting" icon="delete-bin" label={t('mobile.native.providers.removeCredentials')} disabled={busy || source.error || source.loading} onPress={() => Alert.alert(t('mobile.native.providers.removeCredentials'), t('mobile.native.providers.removeCredentialsDetail'), [{ text: t('settings.providers.page.actions.cancel'), style: 'cancel' }, { text: t('mobile.native.providers.removeCredentials'), style: 'destructive', onPress: () => perform(() => store.removeStoredAuth(providerID)) }])} testID="provider-remove" />}
        </SettingsSection>
        <SettingsSection title={t('settings.providers.page.custom.models.title')}>
          {visibility.error === 'load' && <View style={styles.notice}><Text accessibilityRole="alert" style={secondary}>{t('mobile.native.providers.visibilityLoadFailed')}</Text><Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} onPress={() => perform(() => modelVisibility.load())} testID="provider-visibility-retry" /></View>}
          {models.length === 0 ? <Text style={[secondary, styles.inset]}>{t('chat.modelControls.noProvidersOrModelsFound')}</Text> : <View style={styles.modelActions}>
            <Button variant="setting" label={t('settings.providers.page.actions.showAll')} disabled={busy || !visibility.ready || !modelKeys.some(id => hidden.has(id))} onPress={() => save(() => modelVisibility.setProviderHidden(modelKeys, false))} testID="provider-models-show-all" />
            <Button variant="setting" label={t('settings.providers.page.actions.hideAll')} disabled={busy || !visibility.ready || modelKeys.every(id => hidden.has(id))} onPress={() => save(() => modelVisibility.setProviderHidden(modelKeys, true))} testID="provider-models-hide-all" />
          </View>}
        </SettingsSection>
      </>}
      renderItem={({ item }) => <SettingsToggle title={item.name} checked={!hidden.has(`${providerID}/${item.id}`)} disabled={busy || !visibility.ready} onPress={() => save(() => modelVisibility.setHidden(`${providerID}/${item.id}`, !hidden.has(`${providerID}/${item.id}`)))} testID={`provider-model-${item.id}`} />} />;
  }
  const complete = async (selectedCode?: string) => {
    const revision = request.current;
    if (methodIndex === null) return;
    try { if (await store.completeOAuth(providerID, methodIndex, selectedCode) && revision === request.current) { setCode(''); setAuthorization(null); go('provider-detail', providerID); } } catch { /* Safe operation errors come from the store. */ }
  };
  const submit = async () => {
    setLocalError(null); Keyboard.dismiss();
    const revision = request.current;
    if (!method || methodIndex === null) return;
    try {
      if (method.type === 'api') {
        await store.saveApiKey(providerID, key);
        if (revision === request.current) { setKey(''); go('provider-detail', providerID); }
      } else {
        const inputs = collectPromptInputs(prompts, answers);
        const result = await store.authorize(providerID, methodIndex, inputs);
        if (revision !== request.current || !result) return;
        setAnswers(defaultPromptValues(prompts)); setAuthorization(result);
        if (result.method === 'auto') void complete();
      }
    } catch (error) {
      if (revision === request.current && error instanceof ProviderOperationError && error.field) setLocalError(t('settings.providers.page.auth.oauth.promptRequired', { field: prompts.find(prompt => prompt.key === error.field)?.message ?? error.field }));
    }
  };
  return <SettingsForm compactEditing={compactAuth} contentContainerStyle={styles.content} testID="settings-page-provider-auth">
    {feedback}
    {method?.type === 'api' ? <SettingsSection>
      <SettingsInput label={t('settings.providers.page.auth.apiKeyLabel')} value={key} onChangeText={setKey} secureTextEntry autoComplete="off" importantForAutofill="no" editable={!busy} placeholder={t('settings.providers.page.auth.apiKeyPlaceholder')} testID="provider-key-input" />
      <Button variant="action" label={t('settings.providers.page.actions.saveKey')} disabled={busy || !key.trim()} onPress={() => { void submit(); }} style={styles.action} testID="provider-key-save" />
    </SettingsSection> : method?.type === 'oauth' ? authorization ? <SettingsSection>
      {authorization.instructions && <Text selectable style={[primary, styles.notice]}>{authorization.instructions}</Text>}
      <Text style={[secondary, styles.notice]}>{t(authorization.method === 'auto' ? 'settings.providers.page.auth.oauth.waitingHint' : 'settings.providers.page.auth.oauth.codeHint')}</Text>
      {shouldOpenOAuthUrl(providerID, authorization) && <Button variant="setting" icon="global" label={t('settings.providers.page.actions.open')} onPress={() => { void Linking.openURL(authorization.url).catch(() => setLocalError(t('settings.providers.page.toast.oauthStartFailed'))); }} testID="provider-oauth-open" />}
      {authorization.method === 'code' && <><SettingsInput label={t('settings.providers.page.auth.pasteAuthorizationCodePlaceholder')} value={code} onChangeText={setCode} secureTextEntry autoComplete="off" importantForAutofill="no" editable={!busy} testID="provider-oauth-code" /><Button variant="action" label={t('settings.providers.page.actions.complete')} disabled={busy || !code.trim()} onPress={() => { Keyboard.dismiss(); void complete(code); }} style={styles.action} testID="provider-oauth-complete" /></>}
      {authorization.method === 'auto' && !busy && <Button variant="setting" icon="restart" label={t('settings.providers.page.actions.tryAgain')} onPress={() => { void complete(); }} testID="provider-oauth-retry" />}
      <Button variant="setting" label={t('settings.providers.page.actions.cancel')} onPress={() => { request.current++; store.cancelOAuth(); setAuthorization(null); setCode(''); setLocalError(null); }} testID="provider-oauth-cancel" />
    </SettingsSection> : <SettingsSection title={method.label}>
      {visiblePrompts(prompts, answers).map(prompt => prompt.type === 'select' ? <SettingsSection key={prompt.key} title={prompt.message}>{prompt.options.map(option => <Button key={option.value} variant="setting" showSelection selected={answers[prompt.key] === option.value} label={option.label} disabled={busy} onPress={() => setAnswers(previous => ({ ...previous, [prompt.key]: option.value }))} testID={`provider-prompt-${prompt.key}-${option.value}`} />)}</SettingsSection> : <SettingsInput key={prompt.key} label={prompt.message} value={answers[prompt.key] ?? ''} onChangeText={value => setAnswers(previous => ({ ...previous, [prompt.key]: value }))} placeholder={prompt.placeholder} editable={!busy} autoComplete="off" importantForAutofill="no" testID={`provider-prompt-${prompt.key}`} />)}
      <Button variant="action" label={t('settings.providers.page.actions.continue')} disabled={busy} onPress={() => { void submit(); }} style={styles.action} testID="provider-oauth-start" />
    </SettingsSection> : <Text style={[secondary, styles.notice]}>{t('common.unavailable')}</Text>}
  </SettingsForm>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32 },
  notice: { paddingHorizontal: 12, paddingVertical: 12 }, inset: { paddingHorizontal: 12 },
  action: { marginHorizontal: 12, marginVertical: 12, maxWidth: 480 }, modelActions: { flexDirection: 'row', flexWrap: 'wrap' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14, paddingRight: 4, marginTop: 12 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, includeFontPadding: false },
  compactSearch: { marginTop: 0, paddingLeft: 0 }, compactInput: { paddingVertical: 4 },
});
