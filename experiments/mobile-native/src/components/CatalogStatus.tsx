import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import type { CatalogAvailability } from '../runtime/model-refresh';
import { useTheme, useTypography } from '../theme';
import { Button } from './ui';

export function CatalogStatus({ availability, retry, testID = 'catalog-retry' }: {
  availability: CatalogAvailability; retry: () => void; testID?: string;
}) {
  const { t } = useI18n(); const { colors } = useTheme(); const { font, text } = useTypography();
  if (availability.status === 'ready') return null;
  const loading = availability.status === 'loading';
  return <View style={styles.status}>
    <Text accessibilityRole={loading ? 'text' : 'alert'} accessibilityLiveRegion="polite" style={[styles.message, text(14, 21), { fontFamily: font.regular, color: colors.surface.mutedForeground }]}>{t(loading ? 'common.loading' : 'common.unavailable')}</Text>
    {!loading && <Button variant="compact" label={t('settings.common.actions.retry')} onPress={retry} testID={testID}>
      <Text style={[text(14, 21), { fontFamily: font.semibold, color: colors.surface.foreground }]}>{t('settings.common.actions.retry')}</Text>
    </Button>}
  </View>;
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  message: { flex: 1 },
});
