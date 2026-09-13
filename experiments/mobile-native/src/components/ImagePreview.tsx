import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, clamp, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useI18n } from '@/lib/i18n';
import { movement } from '../motion';
import { useTheme, useTypography } from '../theme';
import { Button, Icon } from './ui';
import type { PreviewImage } from './ImageAttachment';

export function ImagePreview({ image, close }: { image: PreviewImage; close: () => void }) {
  const { colors } = useTheme(); const typography = useTypography(); const { font } = typography; const { t } = useI18n(); const safe = useSafeAreaInsets(); const reduceMotion = useReducedMotion();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0); const [zoom, setZoom] = useState(1);
  const scale = useSharedValue(1); const x = useSharedValue(0); const y = useSharedValue(0);
  const startScale = useSharedValue(1); const startX = useSharedValue(0); const startY = useSharedValue(0);
  const focalX = useSharedValue(0); const focalY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const fit = Math.min(viewport.width / size.width, viewport.height / size.height);
  const width = size.width * fit; const height = size.height * fit;
  useEffect(() => { scale.value = 1; x.value = 0; y.value = 0; setZoom(1); }, [viewport.width, viewport.height, scale, x, y]);
  useEffect(() => { opacity.value = withTiming(status === 'ready' ? 1 : 0, { ...movement, duration: 180 }); }, [status, opacity]);
  const transform = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  const changeZoom = (next: number) => {
    'worklet';
    const target = clamp(next, 1, 4);
    scale.value = withTiming(target, movement);
    x.value = withTiming(clamp(x.value, -Math.max(0, (width * target - viewport.width) / 2), Math.max(0, (width * target - viewport.width) / 2)), movement);
    y.value = withTiming(clamp(y.value, -Math.max(0, (height * target - viewport.height) / 2), Math.max(0, (height * target - viewport.height) / 2)), movement);
    runOnJS(setZoom)(target);
  };
  const pinch = Gesture.Pinch().enabled(status === 'ready').onStart(event => {
    cancelAnimation(scale); cancelAnimation(x); cancelAnimation(y);
    startScale.value = scale.value; startX.value = x.value; startY.value = y.value;
    focalX.value = event.focalX - viewport.width / 2; focalY.value = event.focalY - viewport.height / 2;
  }).onUpdate(event => {
    const next = clamp(startScale.value * event.scale, 1, 4); const ratio = next / startScale.value;
    scale.value = next;
    const boundX = Math.max(0, (width * next - viewport.width) / 2); const boundY = Math.max(0, (height * next - viewport.height) / 2);
    x.value = clamp(event.focalX - viewport.width / 2 - (focalX.value - startX.value) * ratio, -boundX, boundX);
    y.value = clamp(event.focalY - viewport.height / 2 - (focalY.value - startY.value) * ratio, -boundY, boundY);
  }).onEnd(() => { runOnJS(setZoom)(scale.value); });
  const pan = Gesture.Pan().maxPointers(1).enabled(status === 'ready').onStart(() => { cancelAnimation(scale); cancelAnimation(x); cancelAnimation(y); startX.value = x.value; startY.value = y.value; }).onUpdate(event => {
    const boundX = Math.max(0, (width * scale.value - viewport.width) / 2); const boundY = Math.max(0, (height * scale.value - viewport.height) / 2);
    x.value = clamp(startX.value + event.translationX, -boundX, boundX); y.value = clamp(startY.value + event.translationY, -boundY, boundY);
  });
  const doubleTap = Gesture.Tap().numberOfTaps(2).enabled(status === 'ready').onEnd((_event, success) => { if (success) changeZoom(scale.value > 1 ? 1 : 2); });
  return <Modal visible animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={close} statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait', 'landscape']}>
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.surface.background, paddingTop: safe.top, paddingBottom: safe.bottom, paddingLeft: safe.left, paddingRight: safe.right }]}>
      <View style={styles.header}><Text numberOfLines={1} style={[styles.title, typography.text(16, 24), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: colors.surface.foreground }]}>{image.name}</Text><Button icon="close" label={t('chat.toolOutputDialog.image.closeAria')} onPress={close} testID="image-preview-close" /></View>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}><View testID="image-preview" style={styles.stage} onLayout={event => { const { width, height } = event.nativeEvent.layout; setViewport({ width, height }); }}>
        <Animated.View style={[{ width, height }, transform]}><Image key={attempt} source={{ uri: image.uri }} accessibilityLabel={image.name} resizeMode="contain" fadeDuration={0} onLoad={event => { setSize(event.nativeEvent.source); setStatus('ready'); }} onError={() => setStatus('failed')} style={StyleSheet.absoluteFill} /></Animated.View>
        {status === 'loading' && <View style={styles.feedback}><ActivityIndicator color={colors.surface.foreground} accessibilityLabel={t('common.loading')} /></View>}
        {status === 'failed' && <View style={styles.feedback}><Icon name="file-image" size={32} color={colors.surface.mutedForeground} /><Text accessibilityRole="alert" style={[styles.note, typography.text(16, 24), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{t('filesView.error.previewUnavailable')}</Text><Button variant="action" label={t('contextPanel.preview.actions.retry')} onPress={() => { setStatus('loading'); setAttempt(value => value + 1); }} testID="image-preview-retry" /></View>}
      </View></GestureDetector>
      <View style={styles.controls}>
        <Button icon="subtract" label={t('contextPanel.browser.zoomOut')} disabled={status !== 'ready' || zoom <= 1} onPress={() => changeZoom(scale.value - 1)} testID="image-zoom-out" />
        <Button variant="compact" label={t('contextPanel.browser.zoomReset')} disabled={status !== 'ready'} onPress={() => changeZoom(1)} testID="image-zoom-reset"><Text style={[styles.zoom, typography.text(14, 20), { fontFamily: font.regular }, { color: colors.surface.mutedForeground }]}>{Math.round(zoom * 100)}%</Text></Button>
        <Button icon="add" label={t('contextPanel.browser.zoomIn')} disabled={status !== 'ready' || zoom >= 4} onPress={() => changeZoom(scale.value + 1)} testID="image-zoom-in" />
      </View>
    </GestureHandlerRootView>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, minHeight: 60, paddingVertical: 8 },
  title: { flex: 1, includeFontPadding: false },
  stage: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  zoom: { minWidth: 60, textAlign: 'center' },
  feedback: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  note: { textAlign: 'center' },
});
