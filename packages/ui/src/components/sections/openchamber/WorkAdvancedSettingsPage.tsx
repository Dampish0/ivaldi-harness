import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsFieldRow,
  SettingsSection,
  SETTINGS_ICON_BUTTON_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useI18n, type I18nKey } from '@/lib/i18n';
import type { SettingsPageSlug } from '@/lib/settings/metadata';
import { useUIStore } from '@/stores/useUIStore';

type WorkAdvancedSettingsPageProps = {
  onOpenPage: (slug: SettingsPageSlug) => void;
};

type AdvancedDestination = {
  slug: SettingsPageSlug;
  labelKey: I18nKey;
};

const AI_DESTINATIONS: readonly AdvancedDestination[] = [
  { slug: 'providers', labelKey: 'settings.page.providers.title' },
  { slug: 'agents', labelKey: 'settings.page.agents.title' },
  { slug: 'behavior', labelKey: 'settings.page.behavior.title' },
];

const TOOL_DESTINATIONS: readonly AdvancedDestination[] = [
  { slug: 'commands', labelKey: 'settings.page.commands.title' },
  { slug: 'lifecycle-hooks', labelKey: 'settings.page.lifecycleHooks.workTitle' },
  { slug: 'shortcuts', labelKey: 'settings.page.shortcuts.title' },
];

export const WorkAdvancedSettingsPage: React.FC<WorkAdvancedSettingsPageProps> = ({ onOpenPage }) => {
  const { t } = useI18n();
  const isMobile = useUIStore((state) => state.isMobile);
  const isVSCode = isVSCodeRuntime();

  const renderDestination = (destination: AdvancedDestination) => {
    const label = t(destination.labelKey);
    return (
      <SettingsFieldRow key={destination.slug} label={label}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={SETTINGS_ICON_BUTTON_CLASS}
          onClick={() => onOpenPage(destination.slug)}
          aria-label={label}
          title={label}
        >
          <Icon name="arrow-right-s" className="size-4" />
        </Button>
      </SettingsFieldRow>
    );
  };

  return (
    <SettingsPageLayout title={t('settings.view.nav.group.advanced')} showSaveStatus={false}>
      <SettingsSection title={t('settings.page.work.ai.title')} divider={false}>
        {AI_DESTINATIONS.map(renderDestination)}
      </SettingsSection>
      <SettingsSection>
        {TOOL_DESTINATIONS
          .filter((destination) => (!isMobile || destination.slug !== 'shortcuts')
            && (!isVSCode || destination.slug !== 'lifecycle-hooks'))
          .map(renderDestination)}
      </SettingsSection>
    </SettingsPageLayout>
  );
};
