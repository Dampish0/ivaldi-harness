import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import icons from '../generated/icons.json';
import { useTheme, useTypography } from '../theme';

export type IconName = keyof typeof icons;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <SvgXml xml={icons[name]} width={size} height={size} color={color ?? colors.surface.foreground} />;
}

export function Button({ label, icon, onPress, onLongPress, longPressLabel, selected = false, variant = 'ghost', style, disabled, testID, children, labelLines = 2, showSelection = false, iconSize = 22, muted = false, animateIcon = true, checked }: {
  label: string; icon?: IconName; onPress: () => void; selected?: boolean;
  onLongPress?: () => void; longPressLabel?: string;
  variant?: 'ghost' | 'primary' | 'row' | 'setting' | 'compact' | 'surface' | 'action' | 'destructive'; style?: StyleProp<ViewStyle>; disabled?: boolean;
  testID?: string; children?: React.ReactNode;
  labelLines?: number; showSelection?: boolean; iconSize?: number; muted?: boolean; animateIcon?: boolean;
  checked?: boolean;
}) {
  const { colors, appearance } = useTheme();
  const { font, text, semiboldWeight } = useTypography();
  const opacity = useSharedValue(1);
  const feedback = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const action = variant === 'action' || variant === 'destructive';
  const foreground = variant === 'destructive' ? colors.status.errorForeground : variant === 'primary' || action ? colors.primary.foreground : muted ? colors.surface.mutedForeground : colors.surface.foreground;
  return (
    <Animated.View style={[feedback, style]}>
      <Pressable accessibilityRole={checked === undefined ? 'button' : 'checkbox'} accessibilityLabel={label} accessibilityState={checked === undefined ? { selected, disabled } : { checked, disabled }} testID={testID}
        disabled={disabled} onPress={onPress} onLongPress={onLongPress}
        accessibilityActions={onLongPress ? [{ name: 'longpress', label: longPressLabel }] : undefined}
        onAccessibilityAction={onLongPress ? event => { if (event.nativeEvent.actionName === 'longpress') onLongPress(); } : undefined}
        onPressIn={() => { opacity.value = withTiming(0.55, { duration: 80 }); }}
        onPressOut={() => { opacity.value = withTiming(1, { duration: 130 }); }}
        style={[styles.button, variant === 'row' || action || variant === 'setting' ? styles.row : variant === 'compact' ? styles.compact : styles.icon, action && styles.action, variant === 'setting' && { minHeight: 56, paddingVertical: 14 * appearance.density / 100 }, {
          backgroundColor: variant === 'destructive' ? colors.status.error : variant === 'action' ? colors.primary.base : selected && variant !== 'setting' ? colors.interactive.selection : variant === 'surface' ? colors.surface.elevated : 'transparent',
          opacity: disabled && variant !== 'primary' ? 0.4 : 1,
        }]}>
        {showSelection && <View style={styles.selection}>{selected && <Icon name="check" size={20} />}</View>}
        {icon && <View style={variant === 'primary' ? [styles.primary, { backgroundColor: disabled ? colors.interactive.border : colors.primary.base }] : { width: iconSize, height: iconSize }}>
          <Animated.View key={icon} entering={animateIcon ? FadeIn.duration(160) : undefined} exiting={animateIcon ? FadeOut.duration(120) : undefined} style={styles.iconLayer}><Icon name={icon} size={variant === 'primary' ? 20 : iconSize} color={variant === 'primary' && disabled ? colors.surface.mutedForeground : foreground} /></Animated.View>
        </View>}
        {children ?? (variant === 'row' || variant === 'setting' || action ? <Text numberOfLines={variant === 'setting' ? undefined : labelLines} style={[styles.label, text(16, 22), { fontFamily: font.regular, color: foreground }, action && { fontFamily: font.semibold, fontWeight: semiboldWeight }]}>{label}</Text> : null)}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', borderRadius: 22, flexDirection: 'row', gap: 12 },
  icon: { width: 44, height: 44 },
  primary: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconLayer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  compact: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  action: { justifyContent: 'center', borderRadius: 24 },
  selection: { width: 20, alignItems: 'center' },
  row: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'flex-start', borderRadius: 12 },
  label: { includeFontPadding: false, flexShrink: 1 },
});
