import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, FadeOut, ReduceMotion, useReducedMotion } from 'react-native-reanimated';
import { KeyboardController, useKeyboardController } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { localeKeys, useI18n, type MessageKey } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import type { AppearancePreferences } from '../runtime/appearance';
import type { SessionDefaultsStore } from '../runtime/session-defaults';
import type { ModelChoice } from '../runtime/schema';
import { Button, Icon, type IconName } from './ui';
import { SettingsHeader, SettingsRow, SettingsSection } from './SettingsControls';
import { SessionDefaultsPage } from './SessionDefaultsPage';
import { ChatDisplayPage, type ChatDisplayTarget } from './ChatDisplayPage';
import { useChatDisplay } from '../chat-display';
import { ProviderSettings, type ProviderPage } from './ProviderSettings';
import type { ProvidersStore } from '../runtime/providers';
import type { ModelVisibilityStore } from '../runtime/model-visibility';
import type { CustomProvidersStore } from '../runtime/custom-providers';
import { CustomProviderSettings, type CustomProviderNavigation } from './CustomProviderSettings';
import { getSettingsParent, isSettingsDestinationAvailable, reconcileSettingsMode, settingsSearchPath, type SettingsPage as Page, type SettingsDestination as DestinationId } from '../runtime/settings-navigation';
import type { SettingsProjectsStore } from '../runtime/settings-projects';
import { SettingsProjectPage } from './SettingsProjectPage';
import type { CatalogAvailability } from '../runtime/model-refresh';

type Destination = { page: DestinationId; title: MessageKey; icon: IconName; parent: 'home' | 'general' | 'appearance' | 'sessions' | 'chat' | 'providers' | 'advanced'; searchKeys?: MessageKey[]; chatTarget?: ChatDisplayTarget };
const destinations: Destination[] = [
  { page: 'general', title: 'settings.page.general.title', icon: 'settings-3', parent: 'home' },
  { page: 'appearance', title: 'settings.page.appearance.title', icon: 'palette', parent: 'home' },
  { page: 'chat', title: 'settings.page.chat.title', icon: 'chat-3', parent: 'home' },
  { page: 'sessions', title: 'settings.page.sessions.title', icon: 'chat-3', parent: 'home' },
  { page: 'language', title: 'settings.appearance.language.label', icon: 'global', parent: 'home' },
  { page: 'default-model', title: 'settings.openchamber.defaults.field.defaultModel', icon: 'robot', parent: 'sessions' },
  { page: 'default-effort', title: 'settings.openchamber.defaults.field.defaultThinking', icon: 'equalizer-2', parent: 'sessions' },
  { page: 'default-agent', title: 'settings.openchamber.defaults.field.defaultAgent', icon: 'chat-3', parent: 'sessions' },
  { page: 'mode', title: 'sessions.sidebar.header.productMode.label', icon: 'chat-3', parent: 'general', searchKeys: ['sessions.sidebar.header.productMode.work', 'sessions.sidebar.header.productMode.developer'] },
  { page: 'theme', title: 'settings.openchamber.visual.section.colorMode', icon: 'palette', parent: 'appearance', searchKeys: ['settings.openchamber.visual.section.colorModeAndTheme', 'settings.openchamber.visual.option.themeMode.system', 'settings.openchamber.visual.option.themeMode.light', 'settings.openchamber.visual.option.themeMode.dark'] },
  { page: 'font', title: 'settings.openchamber.visual.field.interfaceFont', icon: 'text', parent: 'appearance' },
  { page: 'text-size', title: 'settings.openchamber.visual.field.interfaceFontSize', icon: 'text', parent: 'appearance' },
  { page: 'density', title: 'settings.openchamber.visual.field.spacingDensity', icon: 'equalizer-2', parent: 'appearance' },
  { page: 'connections', title: 'mobile.connect.saved.title', icon: 'computer', parent: 'home' },
  { page: 'settings-project', title: 'mobile.native.settingsProject', icon: 'folder-3', parent: 'home', searchKeys: ['mobile.native.settingsProjectDescription'] },
  { page: 'advanced', title: 'settings.view.nav.group.advanced', icon: 'equalizer-2', parent: 'home' },
  { page: 'providers', title: 'settings.page.providers.title', icon: 'robot', parent: 'home', searchKeys: ['settings.providers.page.auth.title', 'settings.providers.page.auth.apiKeyLabel'] },
  { page: 'provider-custom', title: 'settings.providers.page.custom.title', icon: 'add', parent: 'providers', searchKeys: ['settings.providers.page.custom.field.baseURL.label', 'settings.providers.page.custom.field.protocol.label', 'settings.providers.page.custom.headers.title'] },
];
const schemeLabels = {
  system: 'settings.openchamber.visual.option.themeMode.system',
  light: 'settings.openchamber.visual.option.themeMode.light',
  dark: 'settings.openchamber.visual.option.themeMode.dark',
} satisfies { [key in AppearancePreferences['scheme']]: MessageKey };
const chatDisplaySearchItems: { target: ChatDisplayTarget; title: MessageKey; requiresReasoning?: boolean }[] = [
  { target: 'reasoning', title: 'settings.openchamber.visual.field.showReasoningTraces' },
  { target: 'reasoning', title: 'settings.openchamber.visual.field.collapsibleThinkingBlocks', requiresReasoning: true },
  { target: 'tools', title: 'settings.openchamber.visual.section.showToolsOpenedByDefault' },
  { target: 'tools', title: 'settings.openchamber.visual.field.bash' },
  { target: 'tools', title: 'settings.openchamber.visual.field.editTools' },
  { target: 'code', title: 'settings.openchamber.visual.field.codeBlockLineWrap' },
  { target: 'user', title: 'settings.openchamber.visual.section.userMessageRendering' },
];

type ConnectedSettings = {
  connection: string; mode: 'work' | 'developer'; modeReady: boolean;
  setMode: (mode: 'work' | 'developer') => Promise<void>;
  defaults: SessionDefaultsStore; models: ModelChoice[]; agents: string[];
  providers: ProvidersStore;
  customProviders: CustomProvidersStore;
  modelVisibility: ModelVisibilityStore;
  settingsProjects: SettingsProjectsStore;
  currentProjectAvailable: boolean;
  modelCatalog: CatalogAvailability; agentCatalog: CatalogAvailability; refreshCatalog: () => void;
};

const subscribeDisconnected = () => () => {};
const disconnectedSnapshot = () => null;

export function SettingsScreen({ open, foreground, close, openConnections, server }: {
  open: boolean; foreground: boolean; close: () => void; openConnections: () => void;
  server: ConnectedSettings | null;
}) {
  const { t, locale, label, setLocale } = useI18n();
  const { preferences: chatDisplay } = useChatDisplay();
  const { colors, dark, appearance, appearanceReady, storageError, setAppearance } = useTheme();
  const { font, text } = useTypography();
  const safe = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { enabled: keyboardEnabled, setEnabled: setKeyboardEnabled } = useKeyboardController();
  const previousKeyboardEnabled = useRef(keyboardEnabled);
  const searchInput = useRef<TextInput>(null);
  const afterSearchBlur = useRef<(() => void) | null>(null);
  const pageScroll = useRef<ScrollView>(null);
  const { width, height } = useWindowDimensions();
  const visible = open && foreground;
  const [stack, setStack] = useState<Page[]>(['home']);
  const [direction, setDirection] = useState(0);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [providerSelection, setProviderSelection] = useState<{ id: string | null; method: number | null }>({ id: null, method: null });
  const [providerQuery, setProviderQuery] = useState('');
  const [customProviderID, setCustomProviderID] = useState<string | null>(null);
  const customNavigation = useRef<CustomProviderNavigation>(null);
  // Disconnected Settings subscribes only to device preferences. Null is not a
  // successful empty provider catalog or project registry.
  const providerState = useSyncExternalStore(server?.providers.subscribe ?? subscribeDisconnected, server?.providers.getSnapshot ?? disconnectedSnapshot);
  const projectState = useSyncExternalStore(server?.settingsProjects.subscribe ?? subscribeDisconnected, server?.settingsProjects.getSnapshot ?? disconnectedSnapshot);
  const settingsDirectory = server && open ? server.settingsProjects.getDirectory() : null;
  const visibility = useSyncExternalStore(server?.modelVisibility.subscribe ?? subscribeDisconnected, server?.modelVisibility.getSnapshot ?? disconnectedSnapshot);
  const mode = server?.mode ?? 'work';
  const modeReady = server?.modeReady ?? false;
  const defaults = server?.defaults;
  const availableDestinations = destinations.filter(item => isSettingsDestinationAvailable(item.page, server !== null, mode));
  const [chatTarget, setChatTarget] = useState<ChatDisplayTarget>();
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const retry = useRef<(() => Promise<void>) | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const positions = useRef(new Map<string, number>());
  const page = stack[stack.length - 1];
  const title = page === 'provider-detail' || page === 'provider-auth' ? providerState?.catalog.value?.all.find(item => item.id === providerSelection.id)?.name ?? providerSelection.id ?? t('settings.page.providers.title') : t(destinations.find(item => item.page === page)?.title ?? 'mobile.nav.settings');
  const density = appearance.density / 100;
  const compactSearch = width > height && searchFocused && (page === 'home' || page === 'default-model' || page === 'providers' || page === 'settings-project');
  const compactAuth = width > height && keyboardVisible && (page === 'provider-auth' || page === 'provider-custom');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    if (open) { setStack(['home']); setQuery(''); setProviderQuery(''); setProviderSelection({ id: null, method: null }); setSearchFocused(false); setDirection(0); positions.current.clear(); Keyboard.dismiss(); }
  }, [open]);
  useLayoutEffect(() => { if (modeReady) setStack(previous => reconcileSettingsMode(previous, mode)); }, [mode, modeReady]);
  useLayoutEffect(() => { if (!visible) { afterSearchBlur.current = null; searchInput.current?.blur(); setSearchFocused(false); setKeyboardVisible(false); Keyboard.dismiss(); } }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const shown = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', event => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(true);
      if (page === 'home' || page === 'default-model' || page === 'providers' || page === 'settings-project') setSearchFocused(true);
    });
    const hidden = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', event => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(false);
      setSearchFocused(false);
    });
    return () => { shown.remove(); hidden.remove(); };
  }, [visible, page]);
  useEffect(() => { if (visible && defaults) void defaults.load().catch(() => {}); }, [visible, defaults]);
  useEffect(() => { previousKeyboardEnabled.current = keyboardEnabled; }, [keyboardEnabled]);
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const restoreEnabled = previousKeyboardEnabled.current;
    let active = true;
    // Settings owns a native dialog and its keyboard. The controller's status
    // bar override only updates the Activity; RN's fallback also updates dialogs.
    // Finish the composer's dismissal before suspending its animation callbacks.
    void KeyboardController.dismiss().then(() => { if (active) setKeyboardEnabled(false); });
    return () => { active = false; setKeyboardEnabled(restoreEnabled); };
  }, [visible, setKeyboardEnabled]);

  const save = async (operation: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    retry.current = operation;
    setBusy(true);
    setSaveState('idle');
    const delay = setTimeout(() => { if (alive.current) setSaveState('saving'); }, 500);
    try { await operation(); if (alive.current) setSaveState('idle'); retry.current = null; }
    catch { if (alive.current) setSaveState('failed'); }
    finally { clearTimeout(delay); pending.current = false; if (alive.current) setBusy(false); }
  };
  const update = (patch: Partial<AppearancePreferences>) => { void save(() => setAppearance(patch)); };
  const go = (target: DestinationId, fromSearch = false, control?: ChatDisplayTarget) => {
    if (afterSearchBlur.current || !isSettingsDestinationAvailable(target, server !== null, mode)) return;
    const navigate = () => {
      Keyboard.dismiss();
      setSearchFocused(false);
      setChatTarget(control);
      if (target === 'connections') { openConnections(); return; }
      if (target === 'provider-custom') setCustomProviderID(null);
      setDirection(1);
      setStack(previous => fromSearch ? settingsSearchPath(target, mode) : [...previous, target]);
    };
    // Wait for Android to release the outgoing input before mounting a new one.
    // Removing it in the blur command's commit transfers focus to the next page.
    if (searchInput.current?.isFocused()) {
      afterSearchBlur.current = navigate;
      searchInput.current.blur();
    } else navigate();
  };
  const popPage = () => {
    afterSearchBlur.current = null;
    Keyboard.dismiss();
    setSearchFocused(false);
    if (stack.length === 1) close();
    else { setDirection(-1); setStack(previous => previous.slice(0, -1)); }
  };
  const back = () => { if (page === 'provider-custom') customNavigation.current?.back(); else popPage(); };
  const chooseProject = (projectID: string | null) => {
    if (!server || providerState?.mutation || !server.settingsProjects.select(projectID)) return;
    setProviderQuery(''); setProviderSelection({ id: null, method: null }); positions.current.clear();
    void server.providers.load().catch(() => {});
    popPage();
  };
  const openCustom = (providerID?: string) => {
    Keyboard.dismiss(); setSearchFocused(false); setCustomProviderID(providerID ?? null); setDirection(1);
    setStack(previous => [...previous, 'provider-custom']);
  };
  const customRemoved = () => {
    Keyboard.dismiss(); setDirection(-1); setProviderSelection({ id: null, method: null });
    setStack(previous => previous.slice(0, previous.lastIndexOf('providers') + 1));
  };
  const goProvider = (target: ProviderPage, providerID?: string, methodIndex?: number) => {
    Keyboard.dismiss(); setSearchFocused(false);
    setProviderSelection(previous => ({ id: providerID ?? previous.id, method: methodIndex ?? null }));
    if (target === 'provider-detail' && page === 'provider-custom') { setDirection(-1); setStack(previous => previous.at(-2) === target ? previous.slice(0, -1) : [...previous.slice(0, -1), target]); }
    else if (target === 'provider-detail' && page === 'provider-auth') { setDirection(-1); setStack(previous => previous.slice(0, -1)); }
    else { setDirection(1); setStack(previous => [...previous, target]); }
  };
  const value = (target: Page | 'connections') => {
    if (target === 'general' || target === 'mode') return t(mode === 'work' ? 'sessions.sidebar.header.productMode.work' : 'sessions.sidebar.header.productMode.developer');
    if (target === 'appearance' || target === 'theme') return t(schemeLabels[appearance.scheme]);
    if (target === 'font') return appearance.fontFamily === 'selawik' ? 'Selawik' : t('mobile.native.systemFont');
    if (target === 'text-size') return `${appearance.textScale}%`;
    if (target === 'density') return `${appearance.density}%`;
    if (target === 'language') return label(locale);
    if (target === 'sessions') return t('settings.page.work.ai.defaultsTitle');
    if (target === 'connections') return server?.connection;
    if (target === 'settings-project') {
      if (settingsDirectory === null) return t('common.unavailable');
      const project = projectState?.projects.find(item => item.id === projectState.selectedId);
      return project ? project.label || project.path.split(/[\\/]/).filter(Boolean).at(-1) || project.path : t('mobile.native.settingsProjectCurrent');
    }
    return undefined;
  };
  const parentTitles = { home: 'mobile.nav.settings', general: 'settings.page.general.title', sessions: 'settings.page.sessions.title', chat: 'settings.page.chat.title', appearance: 'settings.page.appearance.title', providers: 'settings.page.providers.title', advanced: 'settings.view.nav.group.advanced' } satisfies { [parent in Destination['parent']]: MessageKey };
  const row = (item: Destination, search = false) => <SettingsRow key={item.title} title={t(item.title)} value={search && compactSearch ? undefined : search ? t(parentTitles[item.chatTarget ? 'chat' : getSettingsParent(item.page, mode)]) : value(item.page)} icon={item.icon} disabled={item.page === 'settings-project' && Boolean(providerState?.mutation)} onPress={() => go(item.page, search, item.chatTarget)} testID={`settings-${item.page}${item.chatTarget ? '-' + item.title.split('.').at(-1) : ''}`} />;
  const searchable: Destination[] = [...availableDestinations, ...chatDisplaySearchItems.filter(item => !item.requiresReasoning || chatDisplay.showReasoningTraces).map(item => ({ page: 'chat' as const, parent: 'chat' as const, icon: 'chat-3' as const, title: item.title, chatTarget: item.target }))];
  const results = searchable.filter(item => [t(item.title), ...(item.searchKeys ?? []).map(key => t(key)), value(item.page) ?? ''].join(' ').toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  const unresolvedSave = busy || saveState === 'failed';
  const selectionDisabled = unresolvedSave || !appearanceReady;
  const preview = <View style={[styles.preview, { gap: 16 * density, paddingVertical: 32 * density }]}>
    <Text accessibilityElementsHidden importantForAccessibility="no" style={[text(40, 48), { fontFamily: font.regular, color: colors.surface.foreground }]}>Aa</Text>
    <Text style={[text(17, 26), { fontFamily: font.regular, color: colors.surface.foreground }]}>{t('mobile.native.appearancePreview')}</Text>
  </View>;

  return <Modal visible={visible} animationType={reducedMotion ? 'none' : 'slide'} presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape']} statusBarTranslucent navigationBarTranslucent onRequestClose={back}>
    <KeyboardAvoidingView behavior="padding" enabled={visible} style={[styles.screen, { backgroundColor: colors.surface.background }]}>
    <View style={[styles.screen, { backgroundColor: colors.surface.background, paddingTop: safe.top, paddingBottom: safe.bottom, paddingLeft: safe.left, paddingRight: safe.right }]} testID="settings-screen">
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <Animated.View key={page} entering={reducedMotion || direction === 0 ? undefined : (direction > 0 ? FadeInRight : FadeInLeft).duration(220).reduceMotion(ReduceMotion.System)} exiting={reducedMotion ? undefined : FadeOut.duration(100).reduceMotion(ReduceMotion.System)} style={styles.page}>
        {server && page === 'provider-custom' ? <CustomProviderSettings active={visible} ref={customNavigation} store={server.customProviders} providers={server.providers} directory={settingsDirectory} providerID={customProviderID} compactEditing={compactAuth} back={popPage} close={close} saved={id => goProvider('provider-detail', id)} removed={customRemoved} /> : <>
        <SettingsHeader title={title} back={page === 'home' ? undefined : back} close={close} hidden={compactSearch || compactAuth} />
        {(saveState !== 'idle' || storageError && !appearanceReady) && <View style={[styles.status, { borderColor: colors.interactive.border }]}>
          <Text accessibilityLiveRegion="polite" style={[text(14, 20), { flex: 1, fontFamily: font.regular, color: saveState === 'saving' ? colors.surface.mutedForeground : colors.status.error }]}>{t(saveState === 'saving' ? 'settings.common.actions.saving' : 'settings.common.status.saveFailed')}</Text>
          {saveState !== 'saving' && <Button variant="compact" label={t('settings.common.actions.retry')} disabled={busy} onPress={() => { void save(retry.current ?? (() => setAppearance({}))); }} testID="settings-save-retry"><Text style={[text(14, 20), { fontFamily: font.semibold, color: colors.surface.foreground }]}>{t('settings.common.actions.retry')}</Text></Button>}
          {saveState === 'failed' && <Button icon="close" label={t('sessions.sidebar.dialogs.cancel')} onPress={() => { retry.current = null; setSaveState('idle'); }} animateIcon={false} testID="settings-save-cancel" />}
        </View>}
        {server && page === 'settings-project' ? <SettingsProjectPage active={visible} store={server.settingsProjects} choose={chooseProject} currentProjectAvailable={server.currentProjectAvailable} busy={unresolvedSave || Boolean(providerState?.mutation)} compactSearch={compactSearch} onSearchFocus={setSearchFocused} />
        : server && (page === 'providers' || page === 'provider-detail' || page === 'provider-auth') ? <ProviderSettings active={visible} modelVisibility={server.modelVisibility} save={operation => { void save(operation); }} busy={unresolvedSave} page={page} store={server.providers} directory={settingsDirectory} providerID={providerSelection.id} methodIndex={providerSelection.method} go={goProvider} openCustom={openCustom} compactSearch={compactSearch} compactAuth={compactAuth} onSearchFocus={setSearchFocused} offset={positions.current.get(page === 'provider-detail' ? page + ':' + providerSelection.id : page) ?? 0} onScroll={offset => positions.current.set(page === 'provider-detail' ? page + ':' + providerSelection.id : page, offset)} query={providerQuery} setQuery={setProviderQuery} projectLabel={value('settings-project') ?? ''} openProject={() => go('settings-project')} />
        : page === 'chat' ? <ChatDisplayPage target={chatTarget} save={operation => { void save(operation); }} busy={unresolvedSave} offset={positions.current.get(page) ?? 0} onScroll={offset => positions.current.set(page, offset)} />
        : server && (page === 'sessions' || page === 'default-model' || page === 'default-effort' || page === 'default-agent') ? <SessionDefaultsPage hiddenModels={visibility?.hidden ?? []} page={page} store={server.defaults} models={server.models} agents={server.agents} connection={server.connection} go={go} save={operation => { void save(operation); }} busy={unresolvedSave} offset={positions.current.get(page) ?? 0} onScroll={offset => positions.current.set(page, offset)} compactSearch={compactSearch} onSearchFocus={setSearchFocused} modelCatalog={server.modelCatalog} agentCatalog={server.agentCatalog} refreshCatalog={server.refreshCatalog} />
        : <ScrollView ref={pageScroll} key={page} contentOffset={{ x: 0, y: positions.current.get(page) ?? 0 }} onScroll={event => positions.current.set(page, event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: 32 * density }]} testID={`settings-page-${page}`}>
          {page === 'home' && <>
            <View style={[styles.search, compactSearch && styles.compactSearch, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }]}>
              {compactSearch && <Button icon="arrow-left" label={t('settings.view.actions.back')} onPress={() => { searchInput.current?.blur(); Keyboard.dismiss(); setSearchFocused(false); }} testID="settings-search-dismiss" animateIcon={false} />}
              <Icon name="search" size={19} color={colors.surface.mutedForeground} />
              <TextInput ref={searchInput} value={query} onChangeText={setQuery} onFocus={() => { setSearchFocused(true); pageScroll.current?.scrollTo({ y: 0, animated: false }); }} onBlur={() => { setSearchFocused(false); const navigate = afterSearchBlur.current; afterSearchBlur.current = null; navigate?.(); }} returnKeyType="search" onSubmitEditing={() => { Keyboard.dismiss(); setSearchFocused(false); }} autoCorrect={false} autoCapitalize="none" disableFullscreenUI placeholder={t('settings.view.search.placeholder')} accessibilityLabel={t('settings.view.search.aria')} placeholderTextColor={colors.surface.mutedForeground} style={[styles.searchInput, compactSearch && styles.compactSearchInput, text(16, 22), { fontFamily: font.regular, color: colors.surface.foreground }]} testID="settings-search" />
              {query.length > 0 && <Button icon="close" iconSize={18} label={t('settings.view.search.clear')} onPress={() => setQuery('')} testID="settings-search-clear" animateIcon={false} />}
            </View>
            {query.trim() || compactSearch ? results.length ? results.map(item => row(item, true)) : <Text style={[styles.empty, text(16, 24), { color: colors.surface.mutedForeground, fontFamily: font.regular }]}>{t('settings.view.search.noResults')}</Text> : <>
              <SettingsSection title="Ivaldi">{availableDestinations.filter(item => item.parent === 'home' && !['connections', 'providers', 'settings-project', 'advanced'].includes(item.page)).map(item => row(item))}</SettingsSection>
              <SettingsSection title={t('settings.view.nav.group.projects')}>{availableDestinations.filter(item => item.page === 'connections' || item.page === 'settings-project').map(item => row(item))}</SettingsSection>
              {server && (mode === 'developer' ? <SettingsSection title={t('settings.view.nav.group.opencode')}>{availableDestinations.filter(item => item.page === 'providers').map(item => row(item))}</SettingsSection> : <SettingsSection>{availableDestinations.filter(item => item.page === 'advanced').map(item => row(item))}</SettingsSection>)}
            </>}
          </>}
          {server && page === 'general' && <SettingsSection title={server.connection}>{availableDestinations.filter(item => item.parent === 'general').map(item => row(item))}</SettingsSection>}
          {server && page === 'advanced' && <SettingsSection title={t('settings.page.work.ai.title')}>{availableDestinations.filter(item => item.page === 'providers').map(item => row(item))}</SettingsSection>}
          {page === 'appearance' && <>
            <SettingsSection>{destinations.filter(item => item.page === 'theme').map(item => row(item))}</SettingsSection>
            <SettingsSection title={t('settings.openchamber.visual.section.densityAndType')}>{destinations.filter(item => item.parent === 'appearance' && item.page !== 'theme').map(item => row(item))}</SettingsSection>
          </>}
          {server && page === 'mode' && <SettingsSection>{!modeReady && <Text style={[text(14, 20), { color: colors.surface.mutedForeground, fontFamily: font.regular }]}>{t('common.unavailable')}</Text>}{(['work', 'developer'] as const).map(option => <Button key={option} variant="setting" showSelection selected={modeReady && mode === option} label={t(option === 'work' ? 'sessions.sidebar.header.productMode.work' : 'sessions.sidebar.header.productMode.developer')} disabled={unresolvedSave || !modeReady} onPress={() => { void save(() => server.setMode(option)); }} testID={`mode-${option}`} />)}</SettingsSection>}
          {page === 'theme' && <SettingsSection>{(['system', 'light', 'dark'] as const).map(option => <Button key={option} variant="setting" showSelection selected={appearanceReady && appearance.scheme === option} label={t(schemeLabels[option])} disabled={selectionDisabled} onPress={() => update({ scheme: option })} testID={`theme-${option}`} />)}</SettingsSection>}
          {page === 'font' && <>
            <SettingsSection>{(['selawik', 'system'] as const).map(option => <Button key={option} variant="setting" showSelection selected={appearanceReady && appearance.fontFamily === option} label={option === 'selawik' ? 'Selawik' : t('mobile.native.systemFont')} disabled={selectionDisabled} onPress={() => update({ fontFamily: option })} testID={`font-${option}`} />)}</SettingsSection>
            {preview}
          </>}
          {(page === 'text-size' || page === 'density') && <>
            <SettingsSection>
              <View style={styles.stepper}>
                <Button icon="subtract" label={`${title}: ${Math.max(80, (page === 'text-size' ? appearance.textScale : appearance.density) - 5)}%`} disabled={selectionDisabled || (page === 'text-size' ? appearance.textScale : appearance.density) <= 80} onPress={() => update(page === 'text-size' ? { textScale: appearance.textScale - 5 } : { density: appearance.density - 5 })} testID="settings-decrease" animateIcon={false} />
                <Text accessibilityLiveRegion="polite" style={[text(24, 32), styles.percentage, { color: colors.surface.foreground, fontFamily: font.semibold }]}>{value(page)}</Text>
                <Button icon="add" label={`${title}: ${Math.min(page === 'text-size' ? 150 : 120, (page === 'text-size' ? appearance.textScale : appearance.density) + 5)}%`} disabled={selectionDisabled || (page === 'text-size' ? appearance.textScale : appearance.density) >= (page === 'text-size' ? 150 : 120)} onPress={() => update(page === 'text-size' ? { textScale: appearance.textScale + 5 } : { density: appearance.density + 5 })} testID="settings-increase" animateIcon={false} />
              </View>
              <View style={styles.reset}><Button variant="compact" icon="restart" label={t('settings.common.actions.reset')} disabled={selectionDisabled || (page === 'text-size' ? appearance.textScale : appearance.density) === 100} onPress={() => update(page === 'text-size' ? { textScale: 100 } : { density: 100 })} testID="settings-reset" animateIcon={false}><Text style={[text(14, 20), { color: colors.surface.mutedForeground, fontFamily: font.regular }]}>{t('settings.common.actions.reset')}</Text></Button></View>
            </SettingsSection>
            {preview}
          </>}
          {page === 'language' && <SettingsSection>{localeKeys.map(language => <Button key={language} variant="setting" showSelection selected={locale === language} label={label(language)} disabled={unresolvedSave} onPress={() => { void save(() => setLocale(language)); }} testID={`language-${language}`} />)}</SettingsSection>}
        </ScrollView>}
        </>}
      </Animated.View>
    </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, page: { flex: 1 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14, paddingRight: 4, marginTop: 12 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, includeFontPadding: false },
  compactSearch: { marginTop: 0, paddingLeft: 0 }, compactSearchInput: { paddingVertical: 4 },
  empty: { paddingHorizontal: 12, paddingVertical: 32 },
  preview: { paddingHorizontal: 24, alignItems: 'flex-start' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, paddingVertical: 20 },
  percentage: { textAlign: 'center', minWidth: 100 }, reset: { alignItems: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
});
