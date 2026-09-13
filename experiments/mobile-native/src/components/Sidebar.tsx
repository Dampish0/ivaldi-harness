import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import type { Session } from '../runtime/schema';
import { isManagedChat } from '../runtime/conversations';
import { initialSidebarDisclosure, sidebarDisclosure } from '../runtime/sidebar-disclosure';
import { Button, Icon } from './ui';
import { Folder } from './Folder';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { movement } from '../motion';

export function Sidebar({ open, sessions, activeId, select, newChat, mode, openMode, close, connection, newProjectChat }: {
  open: boolean;
  sessions: Session[]; activeId: string | null; select: (id: string) => void; newChat: () => void;
  mode: 'work' | 'developer'; openMode: () => void; close: () => void; connection: string; newProjectChat: (directory: string) => void;
}) {
  const { colors, appearance } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n(); const safe = useSafeAreaInsets();
  const [searching, setSearching] = useState(false); const [query, setQuery] = useState('');
  const [disclosure, updateDisclosure] = useReducer(sidebarDisclosure, undefined, initialSidebarDisclosure);
  const selectedChat = sessions.find(chat => chat.id === activeId);
  useEffect(() => { updateDisclosure({ type: 'select', activeId, session: selectedChat, managed: selectedChat !== undefined && isManagedChat(selectedChat.directory) }); }, [activeId, selectedChat]);
  const folderDisclosure = (folder: string) => ({ open: disclosure.openFolders.has(folder), toggle: () => updateDisclosure({ type: 'toggle', folder }) });
  const { fontScale } = useWindowDimensions();
  const searchHeight = Math.max(46, fontScale * 22 * appearance.textScale / 100 + 16);
  const searchInput = useRef<TextInput>(null); const progress = useSharedValue(0);
  const searchStyle = useAnimatedStyle(() => ({ height: progress.value * (searchHeight + 12), opacity: progress.value }));
  useEffect(() => { if (!open) { searchInput.current?.blur(); setSearching(false); setQuery(''); progress.value = withTiming(0, movement); } }, [open, progress]);
  const toggleSearch = () => { setSearching(!searching); progress.value = withTiming(searching ? 0 : 1, movement); if (searching) { searchInput.current?.blur(); setQuery(''); } else searchInput.current?.focus(); };
  const row = (chat: Session) => <Button key={chat.id} testID={'chat-' + chat.id} variant="row" labelLines={1} label={chat.title} selected={chat.id === activeId} onPress={() => select(chat.id)} />;
  const matches = sessions.filter(chat => chat.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const chats = sessions.filter(chat => isManagedChat(chat.directory) && !chat.time.archived);
  const groups = useMemo(() => {
    const result = new Map<string, Session[]>();
    for (const session of sessions) { if (isManagedChat(session.directory)) continue; const group = result.get(session.directory) ?? []; group.push(session); result.set(session.directory, group); }
    return [...result.entries()];
  }, [sessions]);
  return <View style={[styles.page, { paddingTop: safe.top, paddingBottom: safe.bottom + 8, paddingLeft: safe.left }]}>
    <View style={styles.header}><Button icon="menu-2" label={t('mobile.surface.closeAria')} onPress={close} /><Text style={[styles.brand, typography.text(18, 24), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.foreground }]}>Ivaldi</Text><Button icon="search" label={t('mobile.sessions.search.placeholder')} onPress={toggleSearch} testID="sidebar-search" /><Button icon="edit-box" label={t('mobile.sessions.newChat')} onPress={newChat} testID="sidebar-new-chat" /></View>
    <Animated.View style={[{ overflow: 'hidden' }, searchStyle]} pointerEvents={searching ? 'auto' : 'none'} accessibilityElementsHidden={!searching} importantForAccessibility={searching ? 'auto' : 'no-hide-descendants'}><View style={[styles.search, { backgroundColor: colors.surface.elevated }]}><Icon name="search" size={18} /><TextInput disableFullscreenUI ref={searchInput} value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" placeholder={t('mobile.sessions.search.placeholder')} placeholderTextColor={colors.surface.mutedForeground} style={[styles.searchInput, typography.text(16, 22), { fontFamily: font.regular }, { height: searchHeight, color: colors.surface.foreground }]} testID="sidebar-search-input" /></View></Animated.View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      {query.trim() ? matches.length ? matches.map(row) : <Text style={[styles.empty, typography.text(15, 22), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{t('mobile.sessions.empty.searchTitle')}</Text> : <>
        {chats.length > 0 && <Text style={[styles.section, { paddingTop: 24 * appearance.density / 100, paddingBottom: 10 * appearance.density / 100 }, typography.text(13, 18), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.mutedForeground }]}>{t('sessions.sidebar.activity.chatsTitle')}</Text>}
        {chats.map(row)}
        {groups.length > 0 && <Text style={[styles.section, { paddingTop: 24 * appearance.density / 100, paddingBottom: 10 * appearance.density / 100 }, typography.text(13, 18), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.mutedForeground }]}>{t('mobile.sessions.section.projects')}</Text>}
        {sessions.length === 0 && <Text style={[styles.empty, typography.text(15, 22), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{t('mobile.sessions.empty.noSessionsDescription')}</Text>}
        {groups.map(([directory, chats], index) => <Folder key={directory} disclosure={folderDisclosure(`project:${directory}`)} title={directory.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? directory} testID={'project-' + index} action={<Button icon="edit-box" iconSize={18} label={t('mobile.sessions.newChat')} onPress={() => newProjectChat(directory)} testID={'project-new-chat-' + index} />}>
          {chats.filter(chat => !chat.time.archived).map(row)}
          {chats.some(chat => chat.time.archived) && <Folder disclosure={folderDisclosure(`project-archive:${directory}`)} title={t('sessions.sidebar.nav.archive')} testID={'nested-project-' + index}>{chats.filter(chat => chat.time.archived).map(row)}</Folder>}
        </Folder>)}
        {sessions.some(chat => isManagedChat(chat.directory) && chat.time.archived) && <Folder disclosure={folderDisclosure('chat-archive')} title={t('sessions.sidebar.nav.archive')} testID="chat-archive">{sessions.filter(chat => isManagedChat(chat.directory) && chat.time.archived).map(row)}</Folder>}
      </>}
    </ScrollView>
    <View style={[styles.footer, { borderTopColor: colors.interactive.border }]}><Button variant="row" label={t('mobile.nav.settings')} icon="settings-3" iconSize={20} onPress={openMode} testID="mode-menu"><View style={{ flex: 1, gap: 3 }}><Text style={[typography.text(16, 22), { fontFamily: font.regular }, { color: colors.surface.foreground }]}>{t('mobile.nav.settings')}</Text><Text numberOfLines={1} style={[typography.text(12, 18), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{connection} · {t(mode === 'work' ? 'sessions.sidebar.header.productMode.work' : 'sessions.sidebar.header.productMode.developer')}</Text></View><Icon name="arrow-right-s" size={18} color={colors.surface.mutedForeground} /></Button></View>
  </View>;
}
const styles = StyleSheet.create({ page: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: 12 }, brand: { flex: 1, paddingLeft: 8 }, empty: { padding: 24, }, content: { paddingHorizontal: 12, paddingBottom: 24 }, section: { paddingHorizontal: 12, paddingTop: 24, paddingBottom: 10 }, footer: { marginHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth }, search: { marginHorizontal: 24, marginVertical: 6, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }, searchInput: { flex: 1, height: 46, } });
