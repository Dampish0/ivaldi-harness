import React, { useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { movement } from '../motion';
import { useTheme } from '../theme';
import { useI18n } from '@/lib/i18n';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Mounted through close, so gestures and rapid reversal start at the visible position. */
export function Overlay({ open, kind, onClose, children, preferredHeight = 560 }: { open: boolean; kind: 'drawer' | 'sheet'; onClose: () => void; children: React.ReactNode; preferredHeight?: number }) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const { t } = useI18n();
  const safe = useSafeAreaInsets();
  const extent = kind === 'drawer' ? Math.min(width - safe.right - 56, 360) : Math.min(height * 0.85, preferredHeight);
  const progress = useSharedValue(0);
  const sheetHeight = useSharedValue(extent);
  const origin = useSharedValue(0);
  const keyboard = useReanimatedKeyboardAnimation();
  useEffect(() => { progress.value = withTiming(open ? 1 : 0, { ...movement, duration: open ? 280 : 220 }); }, [open, progress]);
  useEffect(() => { sheetHeight.value = withTiming(extent, movement); }, [extent, sheetHeight]);
  const panel = useAnimatedStyle(() => {
    if (kind === 'drawer') return { paddingBottom: Math.abs(keyboard.height.value), transform: [{ translateX: (progress.value - 1) * extent }] };
    const keyboardSpace = Math.abs(keyboard.height.value);
    return {
      height: Math.min(sheetHeight.value, Math.max(0, height - safe.top - (width > height ? 0 : 12) - keyboardSpace)),
      paddingBottom: keyboardSpace > 0 ? 8 : safe.bottom + 8,
      transform: [{ translateY: (1 - progress.value) * (sheetHeight.value + keyboardSpace) - keyboardSpace }],
    };
  });
  const scrim = useAnimatedStyle(() => ({ opacity: progress.value * 0.7 }));
  const handleSize = useAnimatedStyle(() => ({ height: width > height ? 16 * (1 - keyboard.progress.value) : 32 }));
  const drag = Gesture.Pan().onStart(() => { origin.value = progress.value; }).onUpdate(event => {
    const delta = kind === 'drawer' ? event.translationX : -event.translationY;
    progress.value = Math.max(0, Math.min(1, origin.value + delta / extent));
  }).onEnd(event => {
    const velocity = kind === 'drawer' ? event.velocityX : -event.velocityY;
    const dismiss = progress.value < 0.68 || velocity < -650;
    progress.value = withTiming(dismiss ? 0 : 1, movement);
    if (dismiss) runOnJS(onClose)();
  }).onFinalize((_, success) => { if (!success) progress.value = withTiming(open ? 1 : 0, movement); });
  if (kind === 'drawer') drag.activeOffsetX([-10, 10]).failOffsetY([-16, 16]);
  return <View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'yes' : 'no-hide-descendants'} style={styles.overlay}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface.overlay }, scrim]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel={t('mobile.surface.closeAria')} onPress={onClose} testID={`${kind}-backdrop`} />
    </Animated.View>
    {kind === 'drawer' ? <GestureDetector gesture={drag}>
      <Animated.View accessibilityViewIsModal style={[styles.drawer, { width: extent, backgroundColor: colors.surface.muted }, panel]} testID="drawer">
        {children}
      </Animated.View>
    </GestureDetector> : <Animated.View accessibilityViewIsModal style={[styles.sheet, { left: Math.max(safe.left, (width - 640) / 2), right: Math.max(safe.right, (width - 640) / 2), backgroundColor: colors.surface.background }, panel]} testID="sheet">
      <GestureDetector gesture={drag}><Animated.View style={[styles.handleArea, handleSize]} testID="sheet-handle"><View style={[styles.handle, { backgroundColor: colors.interactive.borderHover }]} /></Animated.View></GestureDetector>
      <View style={styles.body}>{children}</View>
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10 },
  drawer: { position: 'absolute', top: 0, left: 0, bottom: 0 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handleArea: { height: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  handle: { width: 32, height: 4, borderRadius: 2 },
  body: { flex: 1, minHeight: 0 },
});
