import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SETTINGS_DESCRIPTION_CLASS } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { ThirdPartyIntegrationsSection } from './ThirdPartyIntegrationsSection';

interface IntegrationsPageProps {
  onOpenProviderSetup: (providerId: string) => Promise<boolean>;
  onOpenPluginManager: () => void;
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({
  onOpenProviderSetup,
  onOpenPluginManager,
}) => {
  const { t } = useI18n();

  return (
    <SettingsPageLayout
      title={t('settings.page.integrations.title')}
      description={(
        <div className="space-y-2">
          <p className={SETTINGS_DESCRIPTION_CLASS}>{t('settings.page.integrations.description')}</p>
          <div role="alert" className="flex max-w-3xl items-start gap-2 text-[var(--status-warning)]">
            <Icon name="error-warning" className="mt-0.5 size-3.5 shrink-0" />
            <p className="typography-meta leading-relaxed">
              {t('settings.integrations.experimentalWarning')}
            </p>
          </div>
        </div>
      )}
      showSaveStatus={false}
    >
      <ThirdPartyIntegrationsSection
        divider={false}
        onOpenProviderSetup={onOpenProviderSetup}
        onOpenPluginManager={onOpenPluginManager}
      />
    </SettingsPageLayout>
  );
};
