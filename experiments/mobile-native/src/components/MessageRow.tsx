import React, { memo } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Markdown, { type ASTNode } from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import type { Message } from '../runtime/schema';
import { visibleText } from '../runtime/conversations';
import { Folder } from './Folder';
import { Icon } from './ui';
import { CopyAction } from './CopyAction';
import { ImageAttachment, type PreviewImage } from './ImageAttachment';
import { previewableImageUri } from '../runtime/images';
import { useChatDisplay } from '../chat-display';

const bashTools = new Set(['bash', 'shell', 'cmd', 'terminal']);
const editTools = new Set(['apply_patch', 'edit', 'write', 'multiedit', 'str_replace', 'str_replace_based_edit_tool', 'create', 'file_write']);

// tokensToAST.js supplies token.info; the package's declaration omits it.
declare module 'react-native-markdown-display' {
  interface ASTNode { sourceInfo: string; }
}

export const MessageRow = memo(function MessageRow({ message, previewImage }: { message: Message; previewImage: (image: PreviewImage) => void }) {
  const { colors, appearance } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n();
  const { preferences } = useChatDisplay();
  const { width, fontScale } = useWindowDimensions(); const safe = useSafeAreaInsets();
  const user = message.info.role === 'user';
  const density = appearance.density / 100;
  const body = { color: colors.surface.foreground, fontFamily: font.regular, ...typography.text(17, 26) };
  const codeFont = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  const markdownStyle = StyleSheet.create({
    body, paragraph: { marginTop: 0, marginBottom: 16 * density },
    heading1: { ...body, fontFamily: font.semibold, fontWeight: typography.semiboldWeight, ...typography.text(25, 33), marginBottom: 14 * density, marginTop: 8 * density },
    heading2: { ...body, fontFamily: font.semibold, fontWeight: typography.semiboldWeight, ...typography.text(22, 30), marginBottom: 12 * density, marginTop: 12 * density },
    heading3: { ...body, fontFamily: font.semibold, fontWeight: typography.semiboldWeight, ...typography.text(19, 27), marginBottom: 10 * density, marginTop: 10 * density },
    heading4: { ...body, fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, heading5: { ...body, fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, heading6: { ...body, fontFamily: font.semibold, fontWeight: typography.semiboldWeight },
    strong: { fontFamily: font.semibold, fontWeight: typography.semiboldWeight },
    code_inline: { color: colors.surface.foreground, backgroundColor: colors.surface.elevated, borderWidth: 0, fontFamily: codeFont, ...typography.text(14, 22) },
    link: { color: colors.interactive.focus },
    blockquote: { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.borderHover, borderLeftWidth: 3, marginLeft: 0, paddingHorizontal: 14 * density, paddingTop: 12 * density, marginBottom: 16 * density },
    thead: { backgroundColor: colors.surface.elevated, fontFamily: font.semibold, fontWeight: typography.semiboldWeight },
    tr: { borderColor: colors.interactive.border, borderBottomWidth: StyleSheet.hairlineWidth },
    th: { padding: 12 * density }, td: { padding: 12 * density },
    hr: { backgroundColor: colors.interactive.border, marginVertical: 16 * density },
    bullet_list: { marginBottom: 16 * density }, ordered_list: { marginBottom: 16 * density },
  });
  const code = (node: ASTNode) => <View key={node.key} style={[styles.code, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }]}>
    <View style={[styles.codeHeader, { borderColor: colors.interactive.border }]}><Text numberOfLines={1} style={[styles.codeLanguage, typography.text(12, 18), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{node.sourceInfo?.trim().split(/\s/)[0] ?? ''}</Text><CopyAction text={node.content.replace(/\n$/, '')} label={t('markdownRenderer.code.actions.copyTitle')} showLabel testID={'copy-code-' + message.info.id} /></View>
    {preferences.codeBlockLineWrap ? <View style={{ padding: 14 * density }} testID={'wrapped-code-' + message.info.id}><Text selectable style={{ fontFamily: codeFont, ...typography.text(14, 22), color: colors.surface.foreground }}>{node.content.replace(/\n$/, '')}</Text></View> : <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ padding: 14 * density }} testID={'scroll-code-' + message.info.id}><Text selectable style={{ fontFamily: codeFont, ...typography.text(14, 22), color: colors.surface.foreground }}>{node.content.replace(/\n$/, '')}</Text></ScrollView>}
  </View>;
  return <View style={[styles.message, user && { alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: colors.surface.elevated, paddingHorizontal: 16 * density, paddingTop: 12 * density, borderRadius: 22 }]}>
    {message.parts.map(part => {
      if (part.type === 'text') {
        if (part.synthetic || part.ignored) return null;
        return user && preferences.userMessageRenderingMode === 'plain' ? <Text key={part.id} selectable style={[body, { marginBottom: 12 * density }]}>{part.text}</Text> : <Markdown key={part.id} style={markdownStyle} onLinkPress={url => { if (/^https?:\/\//i.test(url)) void Linking.openURL(url); return false; }} rules={{
          image: node => <Text key={node.key} style={body}>{node.content || t('filesView.editor.imageAltFallback')}</Text>,
          fence: code, code_block: code,
          table: (node, children) => <ScrollView key={node.key} horizontal nestedScrollEnabled style={styles.tableScroll}><View style={[styles.table, { borderColor: colors.interactive.border, width: Math.max(width - safe.left - safe.right - 40, (node.children[0]?.children[0]?.children.length ?? 1) * 140 * fontScale * appearance.textScale / 100) }]}>{children}</View></ScrollView>,
        }}>{part.text}</Markdown>;
      }
      if (part.type === 'reasoning') {
        if (!preferences.showReasoningTraces) return null;
        const detail = <Text selectable style={[styles.detail, typography.text(14, 22), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{part.text}</Text>;
        return preferences.collapsibleThinkingBlocks ? <Folder detail key={part.id} title={t('chat.reasoningTrace.thinking')} testID={'reasoning-' + part.id}>{detail}</Folder> : <View key={part.id} testID={'reasoning-open-' + part.id}><Text accessibilityRole="header" style={[styles.detail, typography.text(14, 22), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight, color: colors.surface.mutedForeground }]}>{t('chat.reasoningTrace.thinking')}</Text>{detail}</View>;
      }
      if (part.type === 'tool') {
        const name = part.tool.trim().toLowerCase().replace(/:\d+$/, '').split('.').filter(Boolean).at(-1) ?? '';
        const expanded = bashTools.has(name) ? preferences.showExpandedBashTools : editTools.has(name) && preferences.showExpandedEditTools;
        return <Folder detail initialOpen={expanded} key={`${part.id}-${expanded}`} title={part.state.title || part.tool} testID={'tool-' + part.id}><Text selectable style={[styles.detail, typography.text(14, 22), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{JSON.stringify(part.state.input ?? {}, null, 2)}</Text><Text selectable style={[styles.detail, typography.text(14, 22), { fontFamily: font.regular }, { color: part.state.status === 'error' ? colors.status.error : colors.surface.foreground }]}>{part.state.output ?? part.state.error ?? part.state.status}</Text></Folder>;
      }
      const uri = previewableImageUri(part.url, part.mime, 'message');
      if (uri) return <ImageAttachment key={part.id} image={{ uri, name: part.filename ?? t('filesView.editor.imageAltFallback') }} open={previewImage} testID={'attachment-' + part.id} />;
      return <View key={part.id} style={[styles.attachment, { backgroundColor: colors.surface.background, borderColor: colors.interactive.border }]} testID={'attachment-' + part.id}>
        <View style={[styles.attachmentIcon, { backgroundColor: colors.surface.elevated }]}><Icon name="file-text" size={22} color={colors.surface.mutedForeground} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={2} style={[styles.attachmentName, typography.text(14, 20), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.foreground }]}>{part.filename ?? t('chat.fileAttachment.fileFallback')}</Text><Text numberOfLines={1} style={[styles.codeLanguage, typography.text(12, 18), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{part.filename?.match(/\.([a-z0-9]{1,8})$/i)?.[1].toUpperCase() ?? part.mime}</Text></View>
      </View>;
    })}
    {!user && visibleText(message.parts) !== '' && <CopyAction text={visibleText(message.parts)} label={t('chat.messageBody.actions.copyMessage')} testID={'copy-message-' + message.info.id} />}
  </View>;
});
const styles = StyleSheet.create({
  message: { alignSelf: 'stretch' },
  code: { maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  codeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  codeLanguage: { includeFontPadding: false, flexShrink: 1 },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minWidth: 200, maxWidth: '100%', marginBottom: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  attachmentIcon: { width: 40, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  attachmentName: { includeFontPadding: false },
  tableScroll: { flexGrow: 0, maxWidth: '100%', marginBottom: 16 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, overflow: 'hidden' },
  detail: { paddingHorizontal: 10, paddingBottom: 12 },
});
