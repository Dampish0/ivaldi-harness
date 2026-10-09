import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import { Button } from './ui';

export function CopyAction({ text, label, testID, showLabel = false }: { text: string; label: string; testID?: string; showLabel?: boolean }) {
  const { colors } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle');
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copying = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (reset.current) clearTimeout(reset.current); }; }, []);
  const feedback = result === 'copied' ? t('markdownRenderer.code.actions.copiedTitle') : result === 'failed' ? t('filesView.toast.copyFailed') : '';
  const copy = async () => {
    if (copying.current) return;
    copying.current = true;
    if (reset.current) clearTimeout(reset.current);
    let copied = false;
    try { copied = await Clipboard.setStringAsync(text); } catch { /* Keep failure visible beside the action. */ }
    copying.current = false;
    if (!mounted.current) return;
    setResult(copied ? 'copied' : 'failed');
    reset.current = setTimeout(() => { setResult('idle'); }, 2200);
  };
  return <View style={styles.row}>
    <Button icon={result === 'copied' ? 'check' : 'file-copy'} iconSize={18} muted label={feedback || label} variant={showLabel ? 'compact' : 'ghost'} onPress={() => { void copy(); }} testID={testID}>
      {showLabel ? <Text accessibilityLiveRegion="polite" style={[styles.label, typography.text(13, 18), { fontFamily: font.regular }, { color: result === 'failed' ? colors.status.error : colors.surface.mutedForeground }]}>{feedback || label}</Text> : null}
    </Button>
    {!showLabel && result !== 'idle' && <Animated.Text key={result} entering={reduceMotion ? undefined : FadeIn.duration(160)} exiting={reduceMotion ? undefined : FadeOut.duration(120)} accessibilityLiveRegion="polite" style={[styles.label, typography.text(13, 18), { fontFamily: font.regular }, { color: result === 'failed' ? colors.status.error : colors.surface.mutedForeground }]}>{feedback}</Animated.Text>}
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 }, label: { includeFontPadding: false, flexShrink: 1 } });
