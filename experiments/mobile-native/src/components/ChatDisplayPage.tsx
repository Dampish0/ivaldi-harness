import React, { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useChatDisplay } from '../chat-display';
import type { ChatDisplayPreferences } from '../runtime/chat-display';
import { useTheme, useTypography } from '../theme';
import { Button } from './ui';
import { SettingsSection, SettingsToggle } from './SettingsControls';

export type ChatDisplayTarget = 'reasoning' | 'tools' | 'code' | 'user';

export function ChatDisplayPage({ save, busy, target, offset, onScroll }: {
  save: (operation: () => Promise<void>) => void; busy: boolean; target?: ChatDisplayTarget;
  offset: number; onScroll: (offset: number) => void;
}) {
  const { preferences, ready, storageError, setPreferences, retryLoad } = useChatDisplay();
  const { colors, appearance } = useTheme(); const { text, font } = useTypography(); const { t } = useI18n();
  const scroll = useRef<ScrollView>(null);
  const pendingTarget = useRef(target);
  const disabled = busy || !ready;
  const update = (patch: Partial<ChatDisplayPreferences>) => save(() => setPreferences(patch));
  const locate = (section: ChatDisplayTarget, y: number) => {
    if (pendingTarget.current !== section) return;
    scroll.current?.scrollTo({ y, animated: false });
    pendingTarget.current = undefined;
  };
  return <ScrollView ref={scroll} contentOffset={{ x: 0, y: offset }} onScroll={event => onScroll(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} contentContainerStyle={{ width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32 * appearance.density / 100 }} testID="settings-page-chat">
    {!ready && <View style={{ padding: 12, gap: 8 }}>
      <Text accessibilityLiveRegion="polite" style={[text(14, 20), { fontFamily: font.regular, color: storageError ? colors.status.error : colors.surface.mutedForeground }]}>{t(storageError ? 'common.unavailable' : 'common.loading')}</Text>
      {storageError && <Button variant="setting" label={t('settings.common.actions.retry')} disabled={busy} onPress={() => save(retryLoad)} testID="chat-display-load-retry" />}
    </View>}
    <SettingsSection title={t('settings.openchamber.visual.section.reasoning')} onLayout={y => locate('reasoning', y)}>
      <SettingsToggle title={t('settings.openchamber.visual.field.showReasoningTraces')} checked={ready && preferences.showReasoningTraces} disabled={disabled} onPress={() => update({ showReasoningTraces: !preferences.showReasoningTraces })} testID="chat-show-reasoning" />
      {preferences.showReasoningTraces && <SettingsToggle title={t('settings.openchamber.visual.field.collapsibleThinkingBlocks')} checked={ready && preferences.collapsibleThinkingBlocks} disabled={disabled} onPress={() => update({ collapsibleThinkingBlocks: !preferences.collapsibleThinkingBlocks })} testID="chat-collapse-reasoning" />}
    </SettingsSection>
    <SettingsSection title={t('settings.openchamber.visual.section.userMessageRendering')} onLayout={y => locate('user', y)}>
      {(['plain', 'markdown'] as const).map(option => <Button key={option} variant="setting" showSelection selected={ready && preferences.userMessageRenderingMode === option} label={t(option === 'plain' ? 'settings.openchamber.visual.option.userMessageRendering.plain.label' : 'settings.openchamber.visual.option.userMessageRendering.markdown.label')} disabled={disabled} onPress={() => update({ userMessageRenderingMode: option })} testID={`chat-user-${option}`} />)}
    </SettingsSection>
    <SettingsSection onLayout={y => locate('code', y)}>
      <SettingsToggle title={t('settings.openchamber.visual.field.codeBlockLineWrap')} checked={ready && preferences.codeBlockLineWrap} disabled={disabled} onPress={() => update({ codeBlockLineWrap: !preferences.codeBlockLineWrap })} testID="chat-code-wrap" />
    </SettingsSection>
    <SettingsSection title={t('settings.openchamber.visual.section.showToolsOpenedByDefault')} onLayout={y => locate('tools', y)}>
      <SettingsToggle title={t('settings.openchamber.visual.field.bash')} checked={ready && preferences.showExpandedBashTools} disabled={disabled} onPress={() => update({ showExpandedBashTools: !preferences.showExpandedBashTools })} testID="chat-expand-bash" />
      <SettingsToggle title={t('settings.openchamber.visual.field.editTools')} checked={ready && preferences.showExpandedEditTools} disabled={disabled} onPress={() => update({ showExpandedEditTools: !preferences.showExpandedEditTools })} testID="chat-expand-edit" />
    </SettingsSection>
  </ScrollView>;
}
