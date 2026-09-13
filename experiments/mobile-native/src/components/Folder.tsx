import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme, useTypography } from '../theme';
import { Icon } from './ui';
import { movement } from '../motion';

export function Folder({ title, children, initialOpen = false, testID, detail = false, action, disclosure }: { title: string; children: React.ReactNode; initialOpen?: boolean; testID: string; detail?: boolean; action?: React.ReactNode; disclosure?: { open: boolean; toggle: () => void } }) {
  const [localOpen, setLocalOpen] = useState(initialOpen);
  const controlled = disclosure !== undefined;
  const open = disclosure?.open ?? localOpen;
  const measured = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);
  const { colors, appearance } = useTheme(); const typography = useTypography(); const { font } = typography;
  const content = useAnimatedStyle(() => ({ height: measured.value * progress.value, opacity: progress.value }));
  const arrow = useAnimatedStyle(() => ({ transform: [{ rotate: `${-90 * (1 - progress.value)}deg` }] }));
  useEffect(() => { if (controlled) progress.value = withTiming(open ? 1 : 0, movement); }, [controlled, open, progress]);
  const toggle = () => { if (disclosure) disclosure.toggle(); else { setLocalOpen(!open); progress.value = withTiming(open ? 0 : 1, movement); } };
  return <View>
    <View style={styles.row}><Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} testID={testID} style={[styles.header, { paddingVertical: 8 * appearance.density / 100 }]}>
      {!detail && <Icon name="folder-3" size={20} color={colors.surface.mutedForeground} />}
      <Text style={[styles.title, typography.text(15, 22), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight }, { color: detail ? colors.surface.mutedForeground : colors.surface.foreground }, detail && { fontFamily: font.regular, fontWeight: 'normal', ...typography.text(14, 22) }]} numberOfLines={1}>{title}</Text>
      <Animated.View style={arrow}><Icon name="arrow-down-s" size={16} color={colors.surface.mutedForeground} /></Animated.View>
    </Pressable>{action}</View>
    <Animated.View style={[styles.clip, content]} pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
      <View style={[styles.measured, !detail && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.interactive.border }]} onLayout={event => { measured.value = event.nativeEvent.layout.height; }}>{children}</View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' }, header: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }, title: { includeFontPadding: false, flex: 1 }, clip: { overflow: 'hidden' }, measured: { position: 'absolute', top: 0, left: 22, right: 0, paddingLeft: 2 } });
