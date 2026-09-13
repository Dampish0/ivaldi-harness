import React, { useEffect, useState, type RefObject } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Button, Icon } from './ui';
import { movement } from '../motion';
import { useTheme, useTypography } from '../theme';
import { useI18n } from '@/lib/i18n';
import type { Attachment } from '../runtime/chat';
import { previewableImageUri } from '../runtime/images';
import { ImageAttachment, type PreviewImage } from './ImageAttachment';

export function Composer({ inputRef, draft, setDraft, pending, disabled, editable = true, obscured, send, stop, attachments, addAttachment, removeAttachment, previewImage, extraPadding }: {
  inputRef: RefObject<TextInput | null>; draft: string; setDraft: (text: string) => void;
  pending: boolean; send: () => void; stop: () => void;
  attachments: Attachment[]; addAttachment: () => void; removeAttachment: (uri: string) => void; extraPadding: SharedValue<number>; disabled?: boolean; obscured: boolean;
  previewImage: (image: PreviewImage) => void; editable?: boolean;
}) {
  const { colors, appearance } = useTheme(); const typography = useTypography(); const { font } = typography;
  const { t } = useI18n();
  const safe = useSafeAreaInsets();
  const { fontScale, height, width } = useWindowDimensions();
  const textScale = appearance.textScale / 100;
  const minimumHeight = 24 * fontScale * textScale;
  const maximumHeight = 150 * fontScale * textScale;
  const typographyKey = `${font.regular}:${textScale}:${fontScale}`;
  const [layoutContext, setLayoutContext] = useState({ draft: '', typography: typographyKey });
  const needsMeasurement = draft.length > 0 && (layoutContext.draft !== draft || layoutContext.typography !== typographyKey);
  const [textHeight, setTextHeight] = useState(minimumHeight);
  const restingHeight = Math.max(minimumHeight, Math.min(textHeight, maximumHeight));
  const editorHeight = useSharedValue(minimumHeight);
  const chipHeight = useSharedValue(0);
  const visibility = useSharedValue(1);
  const attachmentRequested = useSharedValue(false);
  const keyboard = useReanimatedKeyboardAnimation();
  const attachmentRowHeight = Math.max(attachments.some(file => previewableImageUri(file.uri, file.mime, 'picker')) ? 76 : 44, 20 * fontScale * textScale + 16);
  const visibleEditorHeight = useDerivedValue(() => Math.min(editorHeight.value, Math.max(minimumHeight, height - safe.top - safe.bottom - 64 - Math.abs(keyboard.height.value) - chipHeight.value - 48)));
  // Android's didHide notification precedes the final UI-thread keyboard event.
  // Opening another Activity there can suspend that event and the card layout.
  useAnimatedReaction(
    () => attachmentRequested.value && keyboard.height.value === 0 && editorHeight.value === restingHeight,
    ready => { if (ready) { attachmentRequested.value = false; runOnJS(addAttachment)(); } },
  );
  useEffect(() => { if (draft.length === 0) { setTextHeight(minimumHeight); setLayoutContext({ draft: '', typography: typographyKey }); } }, [draft, minimumHeight, typographyKey]);
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', () => { inputRef.current?.blur(); });
    return () => subscription.remove();
  }, [inputRef]);
  useEffect(() => {
    editorHeight.value = withTiming(restingHeight, { ...movement, duration: 180 });
  }, [restingHeight, editorHeight]);
  useEffect(() => { chipHeight.value = withTiming(attachments.length ? attachmentRowHeight : 0, movement); }, [attachments.length, chipHeight, attachmentRowHeight]);
  useEffect(() => { visibility.value = withTiming(obscured ? 0 : 1, { ...movement, duration: 160 }); }, [obscured, visibility]);
  useEffect(() => { if (!editable) attachmentRequested.value = false; }, [editable, attachmentRequested]);
  useDerivedValue(() => { extraPadding.value = Math.max(44, visibleEditorHeight.value + 16) + chipHeight.value + safe.bottom + 40; });
  const card = useAnimatedStyle(() => ({ height: Math.max(44, visibleEditorHeight.value + 16) + chipHeight.value + 8 }));
  const editor = useAnimatedStyle(() => ({ height: visibleEditorHeight.value }));
  const chip = useAnimatedStyle(() => ({ height: chipHeight.value, opacity: chipHeight.value / attachmentRowHeight }));
  const visibilityStyle = useAnimatedStyle(() => ({ opacity: visibility.value }));
  return <KeyboardStickyView offset={{ opened: safe.bottom }} pointerEvents={obscured ? 'none' : 'auto'} style={[styles.sticky, { paddingLeft: Math.max(safe.left, (width - 720) / 2) + 16, paddingRight: Math.max(safe.right, (width - 720) / 2) + 16, paddingBottom: safe.bottom + 8, backgroundColor: colors.surface.background }]}>
    <Animated.View style={[styles.content, { gap: 8 * appearance.density / 100 }, visibilityStyle]}>
    <Button label={t('chat.chatInput.actions.addAttachment')} icon="add" variant="surface" style={styles.add} disabled={!editable} onPress={() => { attachmentRequested.value = true; inputRef.current?.blur(); Keyboard.dismiss(); }} testID="add-attachment" />
    <Animated.View testID="composer" style={[styles.card, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }, card]}>
      <Animated.View style={chip} pointerEvents={attachments.length ? 'auto' : 'none'} accessibilityElementsHidden={!attachments.length} importantForAccessibility={attachments.length ? 'auto' : 'no-hide-descendants'}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
          {attachments.map((file, index) => {
            const uri = previewableImageUri(file.uri, file.mime, 'picker');
            return <Animated.View key={file.uri} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={[styles.chip, { backgroundColor: colors.surface.background }, uri && styles.imageChip]}>
            {uri ? <ImageAttachment compact image={{ uri, name: file.name }} open={previewImage} testID={'draft-image-' + index} /> : <><Icon name="file-text" size={16} color={colors.surface.mutedForeground} /><Text numberOfLines={1} style={[styles.file, typography.text(13, 20), { fontFamily: font.regular }, { color: colors.surface.foreground }]}>{file.name}</Text></>}
            <Button label={t('chat.chatInput.contextPreview.remove') + ': ' + file.name} icon="close" iconSize={18} disabled={!editable} onPress={() => removeAttachment(file.uri)} testID={index === 0 ? 'remove-attachment' : 'remove-attachment-' + index} />
          </Animated.View>;
          })}
        </ScrollView>
      </Animated.View>
      <View style={styles.editorRow}>
      <View style={styles.editorInset}><Animated.View style={editor}>
        {/* Android can redraw changed font metrics or restored text without a
            content-size event. Measure once at the editor's width, capped to the
            visible line budget. Native typing uses its own content-size events.
            The editable input keeps its native selection and scroll position. */}
        {needsMeasurement && <Text key={typographyKey} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
          numberOfLines={Math.ceil(maximumHeight / minimumHeight)} ellipsizeMode="clip" textBreakStrategy="simple"
          onTextLayout={event => {
            const measuredHeight = Math.max(minimumHeight, ...event.nativeEvent.lines.map(line => line.y + line.height));
            setTextHeight(Math.min(maximumHeight, Math.ceil(measuredHeight)));
            setLayoutContext({ draft, typography: typographyKey });
          }}
          style={[styles.measurement, typography.text(16, 24), { fontFamily: font.regular }]}
        >{draft.endsWith('\n') ? draft + '\u200b' : draft}</Text>}
        <TextInput disableFullscreenUI editable={editable} ref={inputRef} testID="composer-input" accessibilityLabel={t('mobile.composer.prompt')}
          value={draft} onChangeText={value => { setLayoutContext({ draft: value, typography: typographyKey }); setDraft(value); }} multiline
          onContentSizeChange={event => { if (!needsMeasurement) setTextHeight(event.nativeEvent.contentSize.height); }}
          placeholder={t('mobile.composer.prompt')} placeholderTextColor={colors.surface.mutedForeground}
          selectionColor={colors.interactive.focus} style={[styles.input, typography.text(16, 24), { fontFamily: font.regular }, { color: colors.surface.foreground }]}
        />
      </Animated.View></View>
        <Button label={pending ? t('chat.chatInput.actions.stopGeneratingAria') : t('chat.chatInput.actions.sendMessageAria')} icon={pending ? 'stop' : 'arrow-up'} variant="primary" onPress={pending ? stop : send} disabled={!pending && (disabled || !draft.trim() && !attachments.length)} testID={pending ? 'stop' : 'send'} />
      </View>
    </Animated.View>
    </Animated.View>
  </KeyboardStickyView>;
}

const styles = StyleSheet.create({
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12 },
  content: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  add: { marginBottom: 4 },
  card: { flex: 1, minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 26, padding: 4, overflow: 'hidden' },
  input: { padding: 0, margin: 0, height: '100%', textAlignVertical: 'top', includeFontPadding: false },
  measurement: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0, includeFontPadding: false },
  editorRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  editorInset: { flex: 1, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  chips: { alignItems: 'center', gap: 8, paddingLeft: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 10, gap: 6 },
  imageChip: { paddingLeft: 4, paddingVertical: 4, borderRadius: 16, gap: 0 },
  file: { maxWidth: 180 },
});
