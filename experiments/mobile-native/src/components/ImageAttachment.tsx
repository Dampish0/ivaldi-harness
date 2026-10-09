import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useI18n } from '@/lib/i18n';
import { useTheme, useTypography } from '../theme';
import { Icon } from './ui';

export type PreviewImage = { uri: string; name: string };

export function ImageAttachment({ image, compact, open, testID }: { image: PreviewImage; compact?: boolean; open: (image: PreviewImage) => void; testID: string }) {
  const { colors } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReducedMotion(); const opacity = useSharedValue(1);
  const feedback = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => setFailed(false), [image.uri]);
  return <Animated.View style={[styles.frame, compact ? styles.compact : styles.full, { backgroundColor: colors.surface.background, borderColor: colors.interactive.border }, feedback]}><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={t('chat.messageBody.actions.openPreviewAria') + ': ' + image.name} onPress={() => open(image)} onPressIn={() => { opacity.value = withTiming(0.65, { duration: 80 }); }} onPressOut={() => { opacity.value = withTiming(1, { duration: 130 }); }} style={styles.pressable}>
    {failed ? <View style={styles.fallback}><Icon name="file-image" size={24} color={colors.surface.mutedForeground} />{!compact && <Text numberOfLines={2} style={[styles.name, typography.text(14, 20), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{t('filesView.error.previewUnavailable')}</Text>}</View> : <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)} style={StyleSheet.absoluteFill}><Image accessible={false} source={{ uri: image.uri }} resizeMode="cover" fadeDuration={reduceMotion ? 0 : 180} onError={() => setFailed(true)} style={StyleSheet.absoluteFill} /></Animated.View>}
  </Pressable></Animated.View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  pressable: { flex: 1 },
  compact: { width: 60, height: 60, borderRadius: 12 },
  full: { width: 248, maxWidth: '100%', aspectRatio: 4 / 3, borderRadius: 16, marginBottom: 12 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 },
  name: { textAlign: 'center' },
});
