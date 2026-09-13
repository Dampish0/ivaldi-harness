import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewProps, type TextInputProps } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import { Button, Icon, type IconName } from './ui';

const FormContext = createContext<{
  compactEditing: boolean;
  focus: (input: TextInput, focused: boolean) => void;
  reveal: () => void;
} | null>(null);

export function SettingsForm({ compactEditing = false, children, scrollRef, ...props }: ScrollViewProps & { compactEditing?: boolean; scrollRef?: React.RefObject<ScrollView | null> }) {
  const ownScroll = useRef<ScrollView>(null); const scroll = scrollRef ?? ownScroll; const content = useRef<View>(null);
  const focused = useRef<TextInput | null>(null);
  const viewport = useRef(0); const offset = useRef(0); const compact = useRef(false);
  const reveal = useCallback(() => {
    const field = focused.current; const container = content.current; const list = scroll.current;
    if (!compact.current || !field?.isFocused() || !container || !list || viewport.current <= 0) return;
    field.measureLayout(container, (_left, top, _width, height) => {
      if (!compact.current || focused.current !== field || !field.isFocused() || scroll.current !== list) return;
      const current = offset.current;
      const target = top < current ? top : top + height > current + viewport.current ? top + height - viewport.current : current;
      if (Math.abs(target - current) > 0.5) list.scrollTo({ y: Math.max(0, target), animated: false });
    });
  }, [scroll]);
  const focus = useCallback((field: TextInput, active: boolean) => {
    if (active) { focused.current = field; reveal(); }
    else if (focused.current === field) focused.current = null;
  }, [reveal]);
  useLayoutEffect(() => { compact.current = compactEditing; reveal(); }, [compactEditing, reveal]);
  const context = useMemo(() => ({ compactEditing, focus, reveal }), [compactEditing, focus, reveal]);
  return <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={32} {...props}
    onLayout={event => { viewport.current = event.nativeEvent.layout.height; reveal(); props.onLayout?.(event); }}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; props.onScroll?.(event); }}>
    <FormContext.Provider value={context}><View ref={content} collapsable={false} onLayout={reveal}>{children}</View></FormContext.Provider>
  </ScrollView>;
}

export function SettingsHeader({ title, back, close, hidden, disabled }: { title: string; back?: () => void; close: () => void; hidden?: boolean; disabled?: boolean }) {
  const { t } = useI18n(); const { colors } = useTheme(); const { font, text, semiboldWeight } = useTypography();
  return <View style={[styles.header, hidden && styles.hiddenLabel]}>
    {back && <Button icon="arrow-left" label={t('settings.view.actions.back')} onPress={back} disabled={disabled} testID="settings-back" animateIcon={false} />}
    <Text accessibilityRole="header" style={[text(20, 28), styles.title, { fontFamily: font.semibold, fontWeight: semiboldWeight, color: colors.surface.foreground }]}>{title}</Text>
    <Button icon="close" label={t('mobile.surface.closeAria')} onPress={() => { Keyboard.dismiss(); close(); }} disabled={disabled} testID="settings-close" animateIcon={false} />
  </View>;
}

export function SettingsSection({ title, info, children, onLayout }: { title?: string; info?: string; children: React.ReactNode; onLayout?: (y: number) => void }) {
  const { colors, appearance } = useTheme(); const { font, text } = useTypography();
  const { t } = useI18n();
  return <View onLayout={onLayout ? event => onLayout(event.nativeEvent.layout.y) : undefined} style={{ paddingTop: 20 * appearance.density / 100, paddingBottom: 8 * appearance.density / 100 }}>
    {title && <View style={styles.sectionHeading}><Text accessibilityRole="header" style={[text(13, 19), styles.sectionTitle, { fontFamily: font.semibold, color: colors.surface.mutedForeground }]}>{title}</Text>{info && <Button icon="information" iconSize={18} label={`${t('settings.common.infoAria')}: ${title}`} onPress={() => Alert.alert(title, info)} animateIcon={false} />}</View>}
    {children}
  </View>;
}

export function SettingsInput({ label, error, ...input }: TextInputProps & {
  label: string; error?: string;
}) {
  const { colors } = useTheme(); const { font, text } = useTypography();
  const { t } = useI18n();
  const ref = useRef<TextInput>(null);
  const form = useContext(FormContext);
  const [focused, setFocused] = useState(false);
  const compact = form?.compactEditing && focused;
  return <View style={[styles.field, compact && styles.compactField]} onLayout={form?.reveal}>
    <Text style={[text(14, 21), { fontFamily: font.regular, color: colors.surface.foreground }, compact && styles.hiddenLabel]}>{label}</Text>
    <View style={[styles.inputRow, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }]}>
      {compact && <Button icon="arrow-down" label={t('mobile.sessions.doneEditing')} onPress={() => { ref.current?.blur(); Keyboard.dismiss(); }} testID={input.testID ? `${input.testID}-dismiss` : undefined} animateIcon={false} />}
      <TextInput ref={ref} autoCapitalize="none" autoCorrect={false} disableFullscreenUI {...input} accessibilityLabel={label} placeholderTextColor={colors.surface.mutedForeground}
        onFocus={event => { setFocused(true); if (ref.current) form?.focus(ref.current, true); input.onFocus?.(event); }}
        onBlur={event => { setFocused(false); if (ref.current) form?.focus(ref.current, false); input.onBlur?.(event); }}
        onLayout={event => { form?.reveal(); input.onLayout?.(event); }}
        style={[styles.input, text(16, 23), { fontFamily: font.regular, color: colors.surface.foreground }, compact && styles.compactInput, input.style]} />
    </View>
    {error && <Text accessibilityRole="alert" style={[text(14, 21), { fontFamily: font.regular, color: colors.status.error }]}>{error}</Text>}
  </View>;
}

export function SettingsToggle({ title, checked, disabled, onPress, testID }: { title: string; checked: boolean; disabled: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme(); const { font, text } = useTypography();
  return <Button variant="setting" label={title} checked={checked} disabled={disabled} onPress={onPress} testID={testID}>
    <View style={{ width: 20, height: 20, borderWidth: 1, borderRadius: 5, borderColor: colors.interactive.borderHover, backgroundColor: checked ? colors.interactive.selection : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {checked && <Icon name="check" size={16} color={colors.surface.foreground} />}
    </View>
    <Text style={[text(16, 23), { flex: 1, fontFamily: font.regular, color: colors.surface.foreground }]}>{title}</Text>
  </Button>;
}

export function SettingsRow({ title, value, icon, onPress, testID, disabled }: { title: string; value?: string; icon: IconName; onPress: () => void; testID: string; disabled?: boolean }) {
  const { colors } = useTheme(); const { font, text } = useTypography();
  return <Button variant="setting" label={value ? `${title}, ${value}` : title} onPress={onPress} testID={testID} disabled={disabled}>
    <Icon name={icon} size={21} color={colors.surface.mutedForeground} />
    <View style={styles.rowText}><Text style={[text(16, 23), { fontFamily: font.regular, color: colors.surface.foreground }]}>{title}</Text>{value && <Text numberOfLines={2} style={[text(13, 19), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{value}</Text>}</View>
    <Icon name="arrow-right-s" size={18} color={colors.surface.mutedForeground} />
  </Button>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingVertical: 12, gap: 8 },
  title: { flex: 1, includeFontPadding: false },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10 },
  sectionTitle: { paddingHorizontal: 12, flex: 1 }, rowText: { flex: 1, gap: 2 },
  field: { marginHorizontal: 12, marginVertical: 10, gap: 8, maxWidth: 480 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, includeFontPadding: false },
  compactField: { marginVertical: 0, gap: 0 }, compactInput: { paddingVertical: 4, paddingLeft: 4 }, hiddenLabel: { display: 'none' },
});
