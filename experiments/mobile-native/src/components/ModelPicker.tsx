import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useI18n } from '@/lib/i18n';
import { Button, Icon } from './ui';
import { useTheme, useTypography } from '../theme';
import { movement } from '../motion';
import type { ModelChoice, ModelSelection } from '../runtime/schema';
import type { CatalogAvailability } from '../runtime/model-refresh';
import { CatalogStatus } from './CatalogStatus';

export function ModelPicker({ open, models, model, variants, setVariants, favorites, favorite, select, close, hiddenModels, availability, retry }: {
  open: boolean; models: ModelChoice[]; model: ModelSelection | null;
  variants: ModelChoice | null; setVariants: (model: ModelChoice | null) => void;
  favorites: string[]; favorite: (key: string) => void; select: (model: ModelSelection) => void; close: () => void;
  hiddenModels: string[];
  availability: CatalogAvailability; retry: () => void;
}) {
  const { colors, appearance } = useTheme();
  const typography = useTypography(); const { font } = typography; const { t } = useI18n();
  const [query, setQuery] = useState('');
  const { width, height } = useWindowDimensions(); const landscape = width > height;
  const search = useRef<TextInput>(null);
  const previousVariants = useRef<ModelChoice | null>(null);
  const progress = useSharedValue(0);
  const available = availability.available;
  const effortIdentity = variants ?? previousVariants.current;
  const effort = available && effortIdentity ? models.find(item => item.id === effortIdentity.id && item.providerID === effortIdentity.providerID && item.variants.length > 0) ?? null : null;
  const hasEffort = effort !== null;
  const showEffort = variants !== null && hasEffort;
  useLayoutEffect(() => {
    if (!effort) {
      previousVariants.current = null;
      progress.value = 0;
      if (variants) setVariants(null);
    } else if (variants) previousVariants.current = effort;
  }, [effort, variants, setVariants, progress]);
  useLayoutEffect(() => { if (open) { setQuery(''); progress.value = 0; } }, [open, progress]);
  useEffect(() => { if (open) progress.value = hasEffort ? withTiming(showEffort ? 1 : 0, movement) : 0; }, [open, hasEffort, showEffort, progress]);
  const modelPageStyle = useAnimatedStyle(() => ({ opacity: hasEffort ? 1 - progress.value : 1, transform: [{ translateX: hasEffort ? -24 * progress.value : 0 }] }));
  const effortPageStyle = useAnimatedStyle(() => ({ opacity: hasEffort ? progress.value : 0, transform: [{ translateX: 36 * (1 - progress.value) }] }));
  const keyOf = (item: ModelChoice) => item.providerID + '/' + item.id;
  const isSelected = (item: ModelChoice) => item.id === model?.modelID && item.providerID === model.providerID;
  const hidden = new Set(hiddenModels);
  const filtered = (available ? models : []).filter(item => !hidden.has(keyOf(item)) && (item.name + ' ' + item.provider).toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Number(isSelected(b)) - Number(isSelected(a)) || Number(favorites.includes(keyOf(b))) - Number(favorites.includes(keyOf(a))) || a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

  return <View style={styles.pages}>
    <Animated.View style={[styles.page, modelPageStyle]} pointerEvents={showEffort ? 'none' : 'auto'} accessibilityElementsHidden={showEffort} importantForAccessibility={showEffort ? 'no-hide-descendants' : 'auto'} testID="model-list-page">
      <View style={[styles.header, landscape && { paddingBottom: 4 }]}>
        {!landscape && <View style={styles.titleRow}><Text style={[typography.text(18, 24), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight, color: colors.surface.foreground }]}>{t('chat.modelControls.selectModel')}</Text></View>}
        <View style={[styles.searchRow, { backgroundColor: colors.surface.elevated, borderColor: colors.interactive.border }, landscape && { marginRight: 48 }]}>
          <Icon name="search" size={18} color={colors.surface.mutedForeground} />
          <TextInput ref={search} disableFullscreenUI value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search" placeholder={t('chat.modelControls.searchModels')} accessibilityLabel={t('chat.modelControls.searchModels')} placeholderTextColor={colors.surface.mutedForeground} style={[styles.search, typography.text(16, 22), { fontFamily: font.regular, color: colors.surface.foreground }]} testID="model-search" />
        </View>
      </View>
      <FlatList data={filtered} keyExtractor={keyOf} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}
        ListHeaderComponent={<CatalogStatus availability={availability} retry={retry} />}
        ListEmptyComponent={availability.status === 'ready' ? <Text style={[styles.provider, typography.text(13, 18), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{t('chat.modelControls.noProvidersOrModelsFound')}</Text> : null}
        renderItem={({ item }) => {
          const selected = isSelected(item);
          return <View style={[styles.modelRow, { marginBottom: 4 * appearance.density / 100, backgroundColor: selected ? colors.interactive.selection : 'transparent' }]}>
            <Button label={item.name} variant="row" style={{ flex: 1 }} onPress={() => { if (item.variants.length) { search.current?.blur(); Keyboard.dismiss(); setVariants(item); } else select({ providerID: item.providerID, modelID: item.id }); }} testID={'model-' + item.providerID + '-' + item.id}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={landscape ? 1 : 2} style={[styles.name, typography.text(16, 22), { color: colors.surface.foreground, fontFamily: selected ? font.semibold : font.regular, fontWeight: selected ? typography.semiboldWeight : 'normal' }]}>{item.name}</Text>
                {!landscape && <Text numberOfLines={1} style={[styles.provider, typography.text(13, 18), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{item.provider}</Text>}
              </View>
              <View style={{ width: 20 }}>{selected ? <Icon name="check" size={20} /> : item.variants.length > 0 ? <Icon name="arrow-right-s" size={18} color={colors.surface.mutedForeground} /> : null}</View>
            </Button>
            <Button label={t(favorites.includes(keyOf(item)) ? 'chat.modelControls.removeFromFavorites' : 'chat.modelControls.addToFavorites')} icon={favorites.includes(keyOf(item)) ? 'star-fill' : 'star'} muted={!favorites.includes(keyOf(item))} iconSize={18} onPress={() => favorite(keyOf(item))} />
          </View>;
        }} />
    </Animated.View>
    <Animated.View style={[styles.page, effortPageStyle]} pointerEvents={showEffort ? 'auto' : 'none'} accessibilityElementsHidden={!showEffort} importantForAccessibility={showEffort ? 'auto' : 'no-hide-descendants'} testID="model-effort-page">
      <View style={[styles.header, landscape && { paddingBottom: 4 }]}>
        <View style={styles.titleRow}><Text style={[typography.text(18, 24), { fontFamily: font.semibold, fontWeight: typography.semiboldWeight, color: colors.surface.foreground }]}>{t('chat.unifiedControls.effort.title')}</Text></View>
      </View>
      {effort && <FlatList data={['', ...effort.variants]} keyExtractor={item => item || 'default'} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
        ListHeaderComponent={<Button variant="row" icon="arrow-left" label={effort.name} disabled={!showEffort} onPress={() => setVariants(null)} testID="model-effort-back" />}
        renderItem={({ item }) => <Button variant="row" showSelection selected={isSelected(effort) && (model?.variant ?? '') === item} disabled={!showEffort} label={item || t('chat.modelControls.default')} onPress={() => {
          if (showEffort && (!item || effort.variants.includes(item))) select({ providerID: effort.providerID, modelID: effort.id, variant: item || undefined });
        }} testID={'model-effort-' + (item || 'default')} />} />}
    </Animated.View>
    <Button icon="close" label={t('mobile.surface.closeAria')} onPress={close} testID="sheet-close" style={styles.close} />
  </View>;
}

const styles = StyleSheet.create({
  pages: { flex: 1, overflow: 'hidden' }, page: { ...StyleSheet.absoluteFill },
  header: { paddingHorizontal: 24, paddingBottom: 16, gap: 12 },
  titleRow: { minHeight: 44, justifyContent: 'center', paddingRight: 40 },
  close: { position: 'absolute', right: 12, top: 0 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 12 },
  search: { flex: 1, minWidth: 0, paddingVertical: 10, minHeight: 44, includeFontPadding: false },
  content: { paddingHorizontal: 12, paddingBottom: 16 }, provider: { marginTop: 2 },
  modelRow: { borderRadius: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingRight: 4 },
  name: { includeFontPadding: false },
});
