import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, BackHandler, FlatList, Keyboard, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardChatScrollView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import { ChatController, emptyDraft } from '../runtime/chat';
import { chatCatalogDirectory } from '../runtime/model-refresh';
import type { SessionMutationResult } from '../runtime/session-mutations';
import { SessionDefaultsStore, resolveSessionDefaults, sessionDefaultsSchema } from '../runtime/session-defaults';
import type { NativeRuntime } from '../runtime/connection';
import type { Message, ModelChoice, ModelSelection, SessionStatus } from '../runtime/schema';
import { movement } from '../motion';
import { Button, Icon } from './ui';
import { Composer } from './Composer';
import { Overlay } from './Overlay';
import { Sidebar } from './Sidebar';
import { ModelPicker } from './ModelPicker';
import { CatalogStatus } from './CatalogStatus';
import { MessageRow } from './MessageRow';
import { PermissionCard, QuestionCard } from './Approvals';
import { Workspace } from './Workspace';
import { ImagePreview } from './ImagePreview';
import { SettingsScreen } from './SettingsScreen';
import { createProvidersStore } from '../runtime/providers';
import { createCustomProvidersStore } from '../runtime/custom-providers';
import { createSettingsProjectsStore } from '../runtime/settings-projects';
import { projectDirectoryKey, projectTitle } from '../runtime/sidebar-projects';
import type { ModelVisibilityStore } from '../runtime/model-visibility';
import type { PreviewImage } from './ImageAttachment';

type Sheet = 'models' | 'actions' | 'agents' | 'rename';
type SessionActionIntent = { type: 'rename'; title: string } | { type: 'archive'; archived: boolean };
type SessionActionFailure = { result: Exclude<SessionMutationResult, 'saved'>; intent: SessionActionIntent };
const errorKeys = { load: 'chat.container.sessionLoadError.description', send: 'mobile.native.sendFailed', uncertain: 'mobile.native.sendUncertain', stop: 'mobile.native.stopFailed', attachment: 'chat.chatInput.toast.attachFileFailed', storage: 'mobile.native.saveFailed', action: 'mobile.native.actionFailed', sessionMissing: 'mobile.native.session.missing' } satisfies { [key: string]: MessageKey };

export function ChatScreen({ runtime, foreground, openConnections, modelVisibility }: { runtime: NativeRuntime; foreground: boolean; openConnections: () => void; modelVisibility: ModelVisibilityStore }) {
  const controller = useMemo(() => new ChatController(runtime), [runtime]);
  const directory = useCallback(() => {
    const current = controller.getSnapshot();
    return current.preferencesReady ? chatCatalogDirectory(current) : null;
  }, [controller]);
  const settingsProjects = useMemo(() => createSettingsProjectsStore(runtime, { currentDirectory: directory }), [runtime, directory]);
  const providers = useMemo(() => createProvidersStore(runtime, { directory: settingsProjects.getDirectory, refreshModels: controller.refreshModels }), [runtime, controller, settingsProjects]);
  const customProviders = useMemo(() => createCustomProvidersStore(runtime, providers, { directory: settingsProjects.getDirectory }), [runtime, providers, settingsProjects]);
  useEffect(() => () => settingsProjects.dispose(), [settingsProjects]);
  useEffect(() => () => providers.dispose(), [providers]);
  useEffect(() => () => customProviders.dispose(), [customProviders]);
  const defaults = useMemo(() => new SessionDefaultsStore({
    read: () => runtime.json('/api/config/settings', sessionDefaultsSchema),
    write: patch => runtime.json('/api/config/settings', sessionDefaultsSchema, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }),
  }), [runtime]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const registry = useSyncExternalStore(settingsProjects.subscribe, settingsProjects.getSnapshot);
  useEffect(() => { if (state.activeId === null && state.draftDirectory) void settingsProjects.load().catch(() => {}); }, [state.activeId, state.draftDirectory, settingsProjects]);
  const draftProjectPath = state.activeId === null ? state.draftDirectory : null;
  const draftProject = draftProjectPath ? projectTitle(draftProjectPath, registry.projects.find(project => projectDirectoryKey(project.path) === projectDirectoryKey(draftProjectPath))?.label) : null;
  const visibility = useSyncExternalStore(modelVisibility.subscribe, modelVisibility.getSnapshot);
  const availableModels = state.modelCatalog.available ? state.models : [];
  const availableAgents = state.agentCatalog.available ? state.agents : [];
  const unavailableAgent = state.agentCatalog.available && state.agent !== '' && !state.agents.includes(state.agent);
  const refreshCatalog = () => { void controller.refreshModels().catch(() => {}); };
  const [newChatState, setNewChatState] = useState<'loading' | 'failed' | null>(null);
  const [showNewChatProgress, setShowNewChatProgress] = useState(false);
  const newChatRequest = useRef({ revision: 0 });
  const newChatIntent = useRef<{ directory?: string; startup: boolean }>({ startup: false });
  const [drawer, setDrawer] = useState(false); const [sheet, setSheet] = useState<Sheet | null>(null); const [lastSheet, setLastSheet] = useState<Sheet>('models');
  const [modelEffort, setModelEffort] = useState<ModelChoice | null>(null);
  const [rename, setRename] = useState(''); const [workspace, setWorkspace] = useState(false);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [actionOrigin, setActionOrigin] = useState<'chat' | 'sidebar'>('chat');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<SessionActionFailure | null>(null);
  const actionRequest = useRef<Promise<SessionMutationResult> | null>(null);
  const renameInput = useRef<TextInput>(null);
  const [renameEditing, setRenameEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [endVisible, setEndVisible] = useState(true);
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const obscured = drawer || sheet !== null || workspace || preview !== null || settingsOpen || !foreground;
  const { font, text, semiboldWeight } = useTypography();
  const { colors, dark, appearance } = useTheme();
  const reduceMotion = useReducedMotion();
  const newDirectory = state.draftDirectory ?? undefined;
  const input = useRef<TextInput>(null); const scroll = useRef<FlatList<Message>>(null); const atEnd = useRef(true); const initialScroll = useRef<string | null>(null); const positions = useRef(new Map<string, number>());
  const refocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const shouldRefocus = useRef(false); const extraPadding = useSharedValue(92); const mainHeight = useSharedValue(0);
  const readingHistory = useRef(false); const viewportHeight = useRef(0); const contentHeight = useRef(0); const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const { width, height, fontScale } = useWindowDimensions();
  const headerHeight = Math.max(64, 42 * fontScale * appearance.textScale / 100 + 16);
  const headerMotion = useAnimatedStyle(() => {
    const visibility = width > height ? 1 - keyboardProgress.value : 1;
    return { height: visibility * headerHeight, minHeight: 0, opacity: visibility, overflow: 'hidden' };
  });
  const recoverySpace = useAnimatedStyle(() => ({ marginBottom: extraPadding.value + Math.abs(keyboardHeight.value) }));
  const safe = useSafeAreaInsets(); const { t } = useI18n();
  const active = state.sessions.find(chat => chat.id === state.activeId); const messages = state.activeId ? state.messages.get(state.activeId) ?? [] : [];
  const actionTarget = state.sessions.find(chat => chat.id === actionTargetId);
  const compactRename = lastSheet === 'rename' && width > height && renameEditing;
  const draft = state.drafts[state.activeId ?? 'new'] ?? emptyDraft;
  const model = state.models.find(item => item.id === state.model?.modelID && item.providerID === state.model.providerID);
  const modelName = model?.name ?? t(state.modelCatalog.status === 'loading' ? 'common.loading' : 'common.unavailable');
  const permissions = state.permissions.filter(item => item.sessionID === state.activeId);
  const questions = state.questions.filter(item => item.sessionID === state.activeId);
  const status = state.activeId ? state.statuses.get(state.activeId) : undefined; const pending = status?.type === 'busy' || status?.type === 'retry';
  useEffect(() => {
    setShowNewChatProgress(false);
    if (newChatState !== 'loading') return;
    const timer = setTimeout(() => setShowNewChatProgress(true), 400);
    return () => clearTimeout(timer);
  }, [newChatState]);
  useEffect(() => { setEndVisible(true); }, [state.activeId]);
  const jumpToLatest = () => {
    readingHistory.current = false;
    scroll.current?.scrollToOffset({ offset: Math.max(0, contentHeight.current + extraPadding.value + Math.abs(keyboardHeight.value) - viewportHeight.current), animated: !reduceMotion });
  };
  const closeWorkspace = useCallback(() => { Keyboard.dismiss(); setWorkspace(false); void controller.retry(); }, [controller]);
  const closeSheet = useCallback(() => { if (actionRequest.current) return; renameInput.current?.blur(); Keyboard.dismiss(); setSheet(null); }, []);
  const backToActions = useCallback(() => { if (actionRequest.current) return; renameInput.current?.blur(); Keyboard.dismiss(); setLastSheet('actions'); setSheet('actions'); setActionError(null); }, []);
  useEffect(() => {
    if (sheet !== 'rename') { renameInput.current?.blur(); setRenameEditing(false); return; }
    const shown = Keyboard.addListener('keyboardDidShow', () => { if (renameInput.current?.isFocused()) setRenameEditing(true); });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setRenameEditing(false));
    return () => { shown.remove(); hidden.remove(); };
  }, [sheet]);
  const prepareNewChat = useCallback(async (directory?: string, startup = false) => {
    const request = ++newChatRequest.current.revision;
    const revision = controller.getChatSelectionRevision();
    newChatIntent.current = { directory, startup };
    setNewChatState('loading');
    try {
      const [saved, catalog] = await Promise.all([defaults.load(), startup ? Promise.resolve(null) : controller.catalogForDirectory(directory)]);
      if (request !== newChatRequest.current.revision) return;
      const current = controller.getSnapshot();
      if (revision === controller.getChatSelectionRevision()) {
        const resolved = resolveSessionDefaults(saved, catalog?.models ?? current.models, catalog?.agents ?? current.agents, current.model, current.agent);
        if (startup) controller.applyNewChatDefaults(resolved, revision);
        else if (catalog && controller.startNewChat(directory, resolved, catalog)) { initialScroll.current = null; readingHistory.current = false; }
      }
      setNewChatState(null);
    } catch { if (request === newChatRequest.current.revision) setNewChatState('failed'); }
  }, [controller, defaults]);
  useEffect(() => {
    let active = true;
    const requestOwner = newChatRequest.current;
    requestOwner.revision++;
    setNewChatState(null);
    const revision = controller.getChatSelectionRevision();
    void controller.start().then(() => { if (active && controller.getSnapshot().activeId === null && revision === controller.getChatSelectionRevision()) void prepareNewChat(undefined, true); });
    const listener = AppState.addEventListener('change', status => { if (status === 'active') void controller.resume(); else controller.pause(); });
    return () => { active = false; requestOwner.revision++; actionRequest.current = null; listener.remove(); controller.dispose(); if (refocusTimer.current) clearTimeout(refocusTimer.current); };
  }, [controller, prepareNewChat]);
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', () => { if (actionRequest.current && sheet) return true; if (workspace) { closeWorkspace(); return true; } if (sheet === 'models' && modelEffort) { setModelEffort(null); return true; } if (sheet === 'agents' || sheet === 'rename') { backToActions(); return true; } if (sheet) { closeSheet(); return true; } if (drawer) { setDrawer(false); return true; } return false; }); return () => listener.remove(); }, [drawer, sheet, modelEffort, closeSheet, backToActions, workspace, closeWorkspace]);
  const dismissInput = useCallback(() => { if (refocusTimer.current) clearTimeout(refocusTimer.current); input.current?.blur(); Keyboard.dismiss(); }, []);
  useEffect(() => { if (!foreground) { actionRequest.current = null; setActionBusy(false); renameInput.current?.blur(); dismissInput(); setDrawer(false); setSheet(null); setPreview(null); setWorkspace(false); } }, [foreground, dismissInput]);
  const previewImage = useCallback((image: PreviewImage) => { dismissInput(); setPreview(image); }, [dismissInput]);
  useEffect(() => { setPreview(null); }, [state.activeId]);
  const openSheet = (kind: Sheet) => { shouldRefocus.current = input.current?.isFocused() ?? false; dismissInput(); setDrawer(false); if (kind === 'models') setModelEffort(null); setLastSheet(kind); setSheet(kind); };
  const openActions = (id: string | null, origin: 'chat' | 'sidebar') => {
    if (actionRequest.current) return;
    dismissInput();
    if (origin === 'chat') setDrawer(false);
    setActionTargetId(id); setActionOrigin(origin); setRename(state.sessions.find(chat => chat.id === id)?.title ?? ''); setActionError(null);
    setLastSheet('actions'); setSheet('actions');
  };
  const mutateSession = async (intent: SessionActionIntent) => {
    if (!actionTarget || actionRequest.current) return;
    renameInput.current?.blur(); Keyboard.dismiss(); setActionError(null); setActionBusy(true);
    const request = intent.type === 'rename' ? controller.rename(actionTarget.id, intent.title) : controller.archive(actionTarget.id, intent.archived);
    actionRequest.current = request;
    const result = await request;
    if (actionRequest.current !== request) return;
    actionRequest.current = null; setActionBusy(false);
    if (result === 'saved') closeSheet(); else setActionError({ result, intent });
  };
  const openWorkspace = () => { dismissInput(); closeSheet(); setDrawer(false); setWorkspace(true); };
  const cancelNewChat = () => { newChatRequest.current.revision++; setNewChatState(null); };
  const newChat = (directory?: string) => { dismissInput(); setDrawer(false); void prepareNewChat(directory); };
  const selectChat = (id: string) => { cancelNewChat(); dismissInput(); setDrawer(false); initialScroll.current = null; readingHistory.current = positions.current.has(id); controller.select(id); };
  const selectModel = (selection: ModelSelection) => { cancelNewChat(); controller.setModel(selection); closeSheet(); if (shouldRefocus.current) refocusTimer.current = setTimeout(() => input.current?.focus(), 240); };
  const attach = async () => {
    const owner = state.activeId;
    if (refocusTimer.current) clearTimeout(refocusTimer.current);
    try { const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true }); if (result.canceled || controller.getSnapshot().activeId !== owner) return; const current = controller.getSnapshot().drafts[owner ?? 'new'] ?? emptyDraft; controller.setDraft({ ...current, attachments: [...current.attachments, ...result.assets.map(file => ({ uri: file.uri, name: file.name, mime: file.mimeType ?? 'application/octet-stream', size: file.size ?? 0 }))] }); } catch { controller.reportAttachmentError(); }
  };
  const header = (title: string) => <View style={styles.sheetHeader}>
    {(lastSheet === 'agents' || lastSheet === 'rename') && <Button icon="arrow-left" label={t('mobile.header.actions')} disabled={actionBusy} onPress={backToActions} testID="sheet-back" />}
    <Text numberOfLines={2} style={[text(18, 24), { fontFamily: font.semibold, fontWeight: semiboldWeight, color: colors.surface.foreground, flex: 1 }]}>{title}</Text><Button icon="close" label={t('mobile.surface.closeAria')} disabled={actionBusy} onPress={closeSheet} testID="sheet-close" />
  </View>;
  return <View style={[styles.root, { backgroundColor: colors.surface.background }]}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
    <View onLayout={event => { mainHeight.value = event.nativeEvent.layout.height; }} style={[styles.main, { paddingTop: safe.top, paddingLeft: safe.left, paddingRight: safe.right }]} accessibilityElementsHidden={obscured} importantForAccessibility={obscured ? 'no-hide-descendants' : 'auto'}>
      <Animated.View style={[styles.header, headerMotion]}><Button icon="menu-2" label={t('sessions.sidebar.activity.chatsTitle')} onPress={() => { dismissInput(); setDrawer(true); }} testID="open-sidebar" />
        <Animated.View key={active?.id ?? 'new'} entering={reduceMotion ? undefined : FadeIn.duration(180)} style={{ flex: 1, minWidth: 0 }}><Button variant="compact" label={t('chat.modelControls.selectModel') + ': ' + modelName} onPress={() => openSheet('models')} testID="model-picker-trigger"><View style={styles.headerTitle}><Text numberOfLines={1} testID="chat-title" style={[text(18, 24), { fontFamily: font.semibold, fontWeight: semiboldWeight, color: colors.surface.foreground }]}>{active?.title ?? draftProject ?? 'Ivaldi'}</Text><View style={styles.headerModel}><Text numberOfLines={1} style={[styles.modelName, text(13, 18), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{modelName}</Text><Icon name="arrow-down-s" size={14} color={colors.surface.mutedForeground} /></View></View></Button></Animated.View>
        <Button icon="more" label={t('mobile.header.actions')} onPress={() => openActions(state.activeId, 'chat')} testID="chat-actions" />
      </Animated.View>
      {state.stream !== 'live' && <Text accessibilityLiveRegion="polite" style={[styles.connection, text(12, 18), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{t(state.stream === 'connecting' ? 'mobile.connect.connecting' : 'mobile.connect.recovery.description')}</Text>}
      {(newChatState === 'failed' || newChatState === 'loading' && showNewChatProgress) && <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(140)} exiting={reduceMotion ? undefined : FadeOut.duration(100)} style={styles.notice}>
        <Text accessibilityLiveRegion="polite" style={[text(14, 21), { fontFamily: font.regular, color: newChatState === 'failed' ? colors.status.error : colors.surface.mutedForeground }]}>{t(newChatState === 'failed' ? 'mobile.native.defaults.loadFailed' : 'common.loading')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{newChatState === 'failed' && <Button variant="compact" label={t('settings.common.actions.retry')} onPress={() => { void prepareNewChat(newChatIntent.current.directory, newChatIntent.current.startup); }} testID="new-chat-retry"><Text style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.foreground }]}>{t('settings.common.actions.retry')}</Text></Button>}<Button variant="compact" label={t('settings.common.actions.cancel')} onPress={cancelNewChat} testID="new-chat-cancel"><Text style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.foreground }]}>{t('settings.common.actions.cancel')}</Text></Button></View>
      </Animated.View>}
      {state.error && !(state.sessionRecovery && (state.error === 'sessionMissing' || state.error === 'load' || state.error === 'action')) && <View style={styles.notice}><Text accessibilityRole="alert" style={[text(14, 21), { fontFamily: font.regular, color: colors.status.error }]}>{t(errorKeys[state.error])}</Text><Button variant="row" label={t('chat.container.sessionLoadError.retry')} onPress={() => { void controller.retry(); }} /></View>}
      {unavailableAgent && <View style={styles.notice}><Text accessibilityRole="alert" style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{state.agent}: {t('common.unavailable')}</Text><Button variant="row" icon="chat-3" label={t('chat.modelControls.selectAgent')} onPress={() => openSheet('agents')} testID="select-available-agent" /></View>}
      {state.loading || active && state.loadingHistory === active.id && !messages.length ? <View style={styles.empty}><ActivityIndicator color={colors.surface.foreground} /></View> : state.sessionRecovery ? <Animated.View style={[styles.recoveryViewport, recoverySpace]}><ScrollView contentContainerStyle={styles.recovery} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" testID="session-recovery">
        <Text accessibilityRole="alert" style={[text(16, 24), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{t(state.sessionRecovery.reason === 'missing' ? 'mobile.native.session.missing' : 'mobile.native.session.unavailable')}</Text>
        {state.error === 'action' && <Text accessibilityRole="alert" style={[text(14, 21), { fontFamily: font.regular, color: colors.status.error }]}>{t('mobile.native.actionFailed')}</Text>}
        <Button variant="action" label={t(state.recoveringDraft ? 'common.loading' : 'mobile.native.session.recover')} disabled={state.recoveringDraft || newChatState === 'loading'} onPress={() => { cancelNewChat(); dismissInput(); void controller.recoverSessionDraft(newDirectory); }} testID="recover-session-draft" />
        <Button variant="setting" icon="restart" label={t('settings.common.actions.retry')} disabled={state.recoveringDraft} onPress={() => { void controller.retry(); }} testID="recover-session-retry" />
      </ScrollView></Animated.View> : messages.length === 0 && permissions.length === 0 && questions.length === 0 && !pending ? <Welcome project={draftProject} mode={state.mode} keyboardHeight={keyboardHeight} /> : <FlatList ref={scroll} key={active?.id} data={messages} keyExtractor={item => item.info.id} testID="conversation" renderItem={({ item }) => <MessageRow message={item} previewImage={previewImage} />} initialNumToRender={12} maxToRenderPerBatch={8} windowSize={7} removeClippedSubviews={false}
        renderScrollComponent={props => <KeyboardChatScrollView {...props} keyboardLiftBehavior="whenAtEnd" extraContentPadding={extraPadding} freeze={obscured} onEndVisible={value => { atEnd.current = value; setEndVisible(value); if (value) readingHistory.current = false; }} />}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.messages, { gap: 24 * appearance.density / 100 }]} scrollEventThrottle={32}
        onScroll={event => { if (active) positions.current.set(active.id, event.nativeEvent.contentOffset.y); }}
        onScrollBeginDrag={() => { readingHistory.current = true; }} onScrollEndDrag={() => { if (atEnd.current) readingHistory.current = false; }}
        onLayout={event => { viewportHeight.current = event.nativeEvent.layout.height; }}
        onContentSizeChange={(_width, height) => { contentHeight.current = height; const follow = () => scroll.current?.scrollToOffset({ offset: Math.max(0, height + extraPadding.value + Math.abs(keyboardHeight.value) - viewportHeight.current), animated: false }); if (!active) return; if (initialScroll.current !== active.id) { initialScroll.current = active.id; const offset = positions.current.get(active.id); if (offset !== undefined) scroll.current?.scrollToOffset({ offset, animated: false }); else follow(); } else if (!readingHistory.current) follow(); }}
        ListHeaderComponent={active && state.hasMoreHistory.get(active.id) ? <Button variant="row" label={t('mobile.native.loadEarlier')} onPress={() => { readingHistory.current = true; if (active) void controller.loadHistory(active.id, messages.length + 100); }} /> : null}
        ListFooterComponent={<View>{permissions.map(permission => <PermissionCard key={permission.id} permission={permission} controller={controller} />)}{questions.map(question => <QuestionCard key={question.id} question={question} controller={controller} />)}{status && status.type !== 'idle' && state.stream === 'live' && permissions.length === 0 && questions.length === 0 && <ResponseActivity status={status} animate={endVisible && !obscured} />}</View>} />}
      <Composer editable={newChatState !== 'loading'} previewImage={previewImage} obscured={obscured} inputRef={input} draft={draft.text} setDraft={text => controller.setDraft({ ...draft, text })} pending={pending || state.submission?.sessionId === state.activeId && state.submission?.state === 'uncertain'} disabled={state.loading || !model || !state.modelCatalog.available || !state.agentCatalog.available || unavailableAgent || state.submission !== null || state.stream !== 'live' || state.sessionRecovery !== null || newChatState === 'loading'} send={() => { readingHistory.current = false; atEnd.current = true; void controller.send(newDirectory); }} stop={() => { void controller.stop(); }} attachments={draft.attachments} addAttachment={() => { void attach(); }} removeAttachment={uri => controller.setDraft({ ...draft, attachments: draft.attachments.filter(file => file.uri !== uri) })} extraPadding={extraPadding} />
      <LatestButton visible={!endVisible && messages.length > 0 && !obscured && !state.loading} onPress={jumpToLatest} extraPadding={extraPadding} keyboardHeight={keyboardHeight} keyboardProgress={keyboardProgress} mainHeight={mainHeight} />
    </View>
    {preview && <ImagePreview image={preview} close={() => setPreview(null)} />}
    <Overlay open={drawer} foreground={sheet === null} kind="drawer" onClose={() => { dismissInput(); setDrawer(false); }}><Sidebar open={drawer} sessions={state.sessions} projects={settingsProjects} activeId={state.activeId} select={selectChat} actions={id => openActions(id, 'sidebar')} newChat={() => newChat()} mode={state.mode} openSettings={() => { dismissInput(); setDrawer(false); setSettingsOpen(true); }} openConnections={() => { dismissInput(); setDrawer(false); openConnections(); }} connection={runtime.connection.label} newProjectChat={newChat} /></Overlay>
    <Overlay open={sheet !== null} kind="sheet" dismissible={!actionBusy} fitContent={lastSheet === 'actions' || lastSheet === 'rename'} onClose={closeSheet}>
      {lastSheet === 'models' ? <ModelPicker hiddenModels={visibility.hidden} open={sheet === 'models'} models={availableModels} model={state.model} variants={modelEffort} setVariants={setModelEffort} select={selectModel} close={() => closeSheet()} favorites={state.favorites} favorite={key => controller.favorite(key)} availability={state.modelCatalog} retry={refreshCatalog} /> : lastSheet === 'agents' ? <>
        {header(t('chat.modelControls.selectAgent'))}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled"><CatalogStatus availability={state.agentCatalog} retry={refreshCatalog} />{availableAgents.map(agent => <Button key={agent} variant="row" showSelection label={agent} selected={agent === state.agent} onPress={() => { cancelNewChat(); controller.setAgent(agent); closeSheet(); }} />)}</ScrollView>
      </> : <>
        {!compactRename && header(lastSheet === 'actions' && actionOrigin === 'sidebar' ? actionTarget?.title ?? t('common.unavailable') : t(lastSheet === 'actions' ? 'mobile.header.actions' : 'sessions.sidebar.session.menu.rename'))}
        <View style={{ paddingHorizontal: 12, paddingBottom: 16 }}>
        {(lastSheet === 'actions' || lastSheet === 'rename') && <>
          {actionBusy && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 12 }}><ActivityIndicator color={colors.surface.foreground} /><Text accessibilityLiveRegion="polite" style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{t('common.loading')}</Text></View>}
          {(actionError || actionTargetId && !actionTarget) && <Text accessibilityRole="alert" testID="session-action-error" style={[text(14, 21), { fontFamily: font.regular, color: colors.status.error, paddingHorizontal: 12, paddingBottom: 12 }]}>{t(!actionTarget ? 'mobile.native.session.missing' : actionError?.result === 'unavailable' ? 'common.unavailable' : actionError?.result === 'busy' ? 'common.loading' : 'mobile.native.actionFailed')}</Text>}
        </>}
        {lastSheet === 'rename' && <View style={{ paddingHorizontal: compactRename ? 0 : 12, paddingTop: compactRename ? 0 : 8, gap: compactRename ? 8 : 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {compactRename && <Button icon="arrow-left" label={t('mobile.sessions.doneEditing')} disabled={actionBusy} onPress={() => { renameInput.current?.blur(); Keyboard.dismiss(); }} testID="rename-dismiss" />}
            <TextInput disableFullscreenUI ref={renameInput} value={rename} onChangeText={setRename} selectTextOnFocus selection={renameEditing ? undefined : { start: 0, end: 0 }} editable={!actionBusy && Boolean(actionTarget)} onFocus={() => setRenameEditing(true)} onBlur={() => setRenameEditing(false)} returnKeyType="done" onSubmitEditing={() => { if (rename.trim()) void mutateSession({ type: 'rename', title: rename }); }} accessibilityLabel={t('sessions.sidebar.session.menu.rename')} style={[styles.rename, text(16, 22), { flex: 1, paddingVertical: compactRename ? 4 : 12, fontFamily: font.regular, color: colors.surface.foreground, borderColor: colors.interactive.border, backgroundColor: colors.surface.elevated }]} testID="rename-input" />
          </View>
          <Button variant="action" disabled={!rename.trim() || actionBusy || !actionTarget} label={t('sessions.sidebar.session.rename.save')} onPress={() => { void mutateSession({ type: 'rename', title: rename }); }} testID="save-rename" />
        </View>}
        {lastSheet === 'actions' && <>
          {actionOrigin === 'chat' && <>
            <Button variant="row" icon="edit-box" label={t('mobile.sessions.newChat')} disabled={actionBusy} onPress={() => { closeSheet(); newChat(); }} testID="new-chat" />
            <Button variant="row" icon="folder-3" label={t('mobile.header.workspace')} disabled={actionBusy || !runtime.supportsWorkspace} onPress={openWorkspace} testID="open-workspace" />
            <Button variant="row" icon="chat-3" label={t('chat.modelControls.selectAgent')} disabled={actionBusy} onPress={() => openSheet('agents')} />
          </>}
          {actionTargetId && <>
            <Button variant="row" icon="edit-box" label={t('sessions.sidebar.session.menu.rename')} disabled={actionBusy || !actionTarget} onPress={() => { setLastSheet('rename'); setSheet('rename'); setActionError(null); }} testID="rename-chat" />
            <Button variant="row" icon={actionError?.intent.type === 'archive' ? 'restart' : 'archive'} label={t(actionError?.intent.type === 'archive' ? 'settings.common.actions.retry' : actionTarget?.time.archived ? 'sessions.sidebar.bulkActions.restore' : 'sessions.sidebar.nav.archive')} disabled={actionBusy || !actionTarget} onPress={() => { void mutateSession(actionError?.intent.type === 'archive' ? actionError.intent : { type: 'archive', archived: !actionTarget?.time.archived }); }} testID="archive-chat" />
          </>}
        </>}
      </View></>}
    </Overlay>
    <SettingsScreen open={settingsOpen} foreground={foreground} close={() => setSettingsOpen(false)} openConnections={openConnections} server={{ connection: runtime.connection.label, mode: state.mode, modeReady: state.preferencesReady, setMode: mode => controller.setMode(mode), defaults, models: availableModels, agents: availableAgents, providers, customProviders, modelVisibility, settingsProjects, currentProjectAvailable: state.preferencesReady && (state.activeId === null || active !== undefined), modelCatalog: state.modelCatalog, agentCatalog: state.agentCatalog, refreshCatalog }} />
    {workspace && <Workspace runtime={runtime} sessionId={state.activeId} mode={state.mode} close={closeWorkspace} />}
  </View>;
}
function LatestButton({ visible, onPress, extraPadding, keyboardHeight, keyboardProgress, mainHeight }: { visible: boolean; onPress: () => void; extraPadding: SharedValue<number>; keyboardHeight: SharedValue<number>; keyboardProgress: SharedValue<number>; mainHeight: SharedValue<number> }) {
  const { t } = useI18n(); const { colors } = useTheme(); const safe = useSafeAreaInsets();
  const progress = useSharedValue(0);
  useEffect(() => { progress.value = withTiming(visible ? 1 : 0, { ...movement, duration: 180 }); }, [visible, progress]);
  const position = useAnimatedStyle(() => {
    const offset = extraPadding.value - 16 + Math.abs(keyboardHeight.value) - safe.bottom * keyboardProgress.value;
    return { display: mainHeight.value - offset - 46 < safe.top + 8 ? 'none' : 'flex', opacity: progress.value, transform: [{ translateY: -offset + (1 - progress.value) * 8 }] };
  });
  return <Animated.View pointerEvents={visible ? 'box-none' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[styles.latest, position]}>
    <Button variant="surface" icon="arrow-down" iconSize={20} label={t('chat.scrollToBottom.aria')} onPress={onPress} testID="scroll-to-latest" style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.interactive.border, borderRadius: 24 }} />
  </Animated.View>;
}
function ResponseActivity({ status, animate }: { status: Exclude<SessionStatus, { type: 'idle' }>; animate: boolean }) {
  const { t } = useI18n(); const { colors } = useTheme(); const { font, text } = useTypography(); const pulse = useSharedValue(1); const reduceMotion = useReducedMotion();
  useEffect(() => { pulse.value = animate ? withRepeat(withTiming(0.35, { ...movement, duration: 800 }), -1, true) : 1; return () => cancelAnimation(pulse); }, [pulse, animate]);
  const animation = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 0.8 + pulse.value * 0.2 }] }));
  return <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} exiting={reduceMotion ? undefined : FadeOut.duration(140)} style={styles.activity} testID="response-activity">
    <View style={styles.activityTitle}><Animated.View style={[styles.activityDot, { backgroundColor: status.type === 'retry' ? colors.status.warning : colors.surface.mutedForeground }, animation]} /><Text accessibilityLiveRegion="polite" style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{t(status.type === 'retry' ? 'startup.initRecovery.retrying' : 'chat.btw.working')}</Text></View>
    {status.type === 'retry' && <Text style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{status.message}</Text>}
  </Animated.View>;
}
function Welcome({ project, mode, keyboardHeight }: { project: string | null; mode: 'work' | 'developer'; keyboardHeight: SharedValue<number> }) {
  const { colors } = useTheme(); const { font, text } = useTypography(); const { t } = useI18n(); const { height } = useWindowDimensions();
  const position = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (height - Math.abs(keyboardHeight.value) - 230) / 100)), transform: [{ translateY: keyboardHeight.value / 2 }] }));
  return <View style={styles.empty}><Animated.View style={[styles.welcome, position]}><Text textBreakStrategy="balanced" style={[styles.welcomeTitle, text(26, 34), { fontFamily: font.regular, color: colors.surface.foreground }]}>{t(mode === 'work' ? 'chat.emptyState.workDraftTitle' : 'chat.emptyState.draftTitle')}</Text>{project && <Text numberOfLines={2} style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground, textAlign: 'center' }]}>{project}</Text>}</Animated.View></View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, main: { flex: 1 },
  latest: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  activity: { paddingTop: 8, paddingBottom: 16, gap: 8 }, activityTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 }, activityDot: { width: 7, height: 7, borderRadius: 4 },
  header: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  headerModel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modelName: { includeFontPadding: false, flexShrink: 1 },
  messages: { paddingHorizontal: 20, paddingTop: 20, gap: 24 }, empty: { flex: 1, justifyContent: 'center' },
  welcome: { alignItems: 'center', paddingBottom: 96, paddingHorizontal: 52 },
  welcomeTitle: { textAlign: 'center', marginBottom: 12, maxWidth: 260, includeFontPadding: false },
  connection: { textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  notice: { paddingHorizontal: 20, paddingBottom: 8 },
  recoveryViewport: { flex: 1, minHeight: 0 },
  recovery: { flexGrow: 1, alignSelf: 'center', width: '100%', maxWidth: 600, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 24, gap: 16 },
  sheetHeader: { paddingLeft: 24, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rename: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12 },
});
