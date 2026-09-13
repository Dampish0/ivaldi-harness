import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import type { Permission, Question } from '../runtime/schema';
import type { ChatController } from '../runtime/chat';
import { Button, Icon } from './ui';

export function PermissionCard({ permission, controller }: { permission: Permission; controller: ChatController }) {
  const { colors, appearance } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n(); const [busy, setBusy] = useState(false);
  return <View style={[styles.card, { padding: 16 * appearance.density / 100, gap: 16 * appearance.density / 100, borderColor: colors.interactive.border }]}>
    <View style={styles.titleRow}><Icon name="shield" size={20} color={colors.surface.mutedForeground} /><Text style={[styles.title, typography.text(16, 23), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.foreground }]}>{t('chat.permissionRequest.required')}</Text></View>
    <Text selectable style={[typography.text(14, 22), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{permission.permission + '\n' + permission.patterns.join('\n')}</Text>
    <View style={styles.actions}>{(['once', 'always', 'reject'] as const).map(reply => <Button key={reply} disabled={busy} variant={reply === 'once' ? 'action' : 'row'} label={t(reply === 'once' ? 'chat.permissionRequest.actions.once' : reply === 'always' ? 'chat.permissionRequest.actions.always' : 'chat.permissionRequest.actions.reject')} onPress={() => { setBusy(true); void controller.permissionReply(permission, reply).finally(() => setBusy(false)); }} />)}</View>
  </View>;
}
export function QuestionCard({ question, controller }: { question: Question; controller: ChatController }) {
  const { colors, appearance } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n(); const [answers, setAnswers] = useState<string[][]>(question.questions.map(() => [])); const [custom, setCustom] = useState<string[]>(question.questions.map(() => '')); const [busy, setBusy] = useState(false);
  const finalAnswers = answers.map((answer, index) => custom[index]?.trim() ? [...answer, custom[index].trim()] : answer);
  return <View style={[styles.card, { padding: 16 * appearance.density / 100, gap: 16 * appearance.density / 100, borderColor: colors.interactive.border }]}>
    {question.questions.map((item, index) => <View key={index} style={{ gap: 6 }}>
      <Text style={[styles.title, typography.text(16, 23), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.foreground }]}>{item.question}</Text>
      {item.options.map(option => <Button key={option.label} showSelection selected={answers[index].includes(option.label)} variant="row" label={option.label} onPress={() => { if (!item.multiple) setCustom(previous => previous.map((value, i) => i === index ? '' : value)); setAnswers(previous => previous.map((answer, i) => i !== index ? answer : item.multiple ? answer.includes(option.label) ? answer.filter(value => value !== option.label) : [...answer, option.label] : [option.label])); }}><View style={{ flex: 1, gap: 3 }}><Text style={{ fontFamily: font.regular, ...typography.text(16, 22), color: colors.surface.foreground }}>{option.label}</Text><Text style={{ fontFamily: font.regular, ...typography.text(13, 19), color: colors.surface.mutedForeground }}>{option.description}</Text></View></Button>)}
      {item.custom !== false && <TextInput disableFullscreenUI value={custom[index]} onChangeText={value => { setCustom(previous => previous.map((text, i) => i === index ? value : text)); if (!item.multiple) setAnswers(previous => previous.map((answer, i) => i === index ? [] : answer)); }} placeholder={t('chat.questionCard.yourAnswer')} placeholderTextColor={colors.surface.mutedForeground} style={{ color: colors.surface.foreground, fontFamily: font.regular, ...typography.text(16, 24), padding: 12, minHeight: 48 }} />}
    </View>)}
    <View style={styles.actions}><Button disabled={busy || finalAnswers.some(answer => !answer.length)} variant="action" label={t('chat.questionCard.submit')} onPress={() => { setBusy(true); void controller.questionReply(question, finalAnswers).finally(() => setBusy(false)); }} /><Button disabled={busy} variant="row" label={t('chat.questionCard.dismiss')} onPress={() => { setBusy(true); void controller.questionReply(question, null).finally(() => setBusy(false)); }} /></View>
  </View>;
}
const styles = StyleSheet.create({ card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, marginVertical: 12, gap: 16 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { flexShrink: 1 }, actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 } });
