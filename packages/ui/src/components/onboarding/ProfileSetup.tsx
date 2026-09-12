import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsStackedField } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { useProfileStore } from '@/stores/useProfileStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { Icon } from '@/components/icon/Icon';

export function ProfileForm({ onSaved, showModeSelection = false }: { onSaved?: () => void; showModeSelection?: boolean }) {
  const { t } = useI18n();
  const profile = useProfileStore((state) => state.profile);
  const saveName = useProfileStore((state) => state.saveName);
  const mode = useProductModeStore((state) => state.mode);
  const setMode = useProductModeStore((state) => state.setMode);
  const [selectedMode, setSelectedMode] = React.useState(mode);
  const [name, setName] = React.useState(profile.kind === 'ready' ? profile.name : '');
  const [error, setError] = React.useState<'invalid' | 'storage' | null>(null);
  const id = React.useId();

  return (
    <form className="app-region-no-drag space-y-6" onSubmit={(event) => {
      event.preventDefault();
      const result = saveName(name);
      setError(result);
      if (!result) {
        if (showModeSelection && selectedMode !== mode) setMode(selectedMode);
        onSaved?.();
      }
    }}>
      <SettingsStackedField label={<label htmlFor={id}>{t('profile.name.label')}</label>} controlClassName={showModeSelection ? 'w-full max-w-none' : undefined}>
        <Input
          id={id}
          autoFocus
          autoComplete="nickname"
          required
          maxLength={64}
          value={name}
          placeholder={t('profile.name.placeholder')}
          onChange={(event) => { setName(event.target.value); setError(null); }}
          aria-invalid={error === 'invalid'}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </SettingsStackedField>
      {showModeSelection ? (
        <SettingsStackedField label={t('sessions.sidebar.header.productMode.label')} controlClassName="w-full max-w-none">
          <div className="grid w-full grid-cols-2 gap-3" role="group" aria-label={t('sessions.sidebar.header.productMode.label')}>
            {(['work', 'developer'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant="chip"
                aria-pressed={selectedMode === option}
                onClick={() => setSelectedMode(option)}
                className="aspect-square h-auto min-w-0 flex-col gap-3 whitespace-normal rounded-xl p-4 text-center"
              >
                {selectedMode === option ? <Icon name="check" className="absolute right-3 top-3 size-4" /> : null}
                <Icon name={option === 'work' ? 'briefcase' : 'code-box'} className="size-8" />
                <span>{t(`sessions.sidebar.header.productMode.${option}`)}</span>
              </Button>
            ))}
          </div>
        </SettingsStackedField>
      ) : null}
      {error ? <p id={`${id}-error`} role="alert" className="typography-meta text-[var(--status-error)]">{t(`profile.error.${error}`)}</p> : null}
      <Button type="submit" disabled={!name.trim()} className="w-full">
        {t(onSaved ? 'profile.actions.save' : 'profile.actions.continue')}
      </Button>
    </form>
  );
}

export function ProfileSetup() {
  const { t } = useI18n();
  return (
    <div className="app-region-drag flex h-full items-center justify-center overflow-y-auto bg-background p-8 text-foreground">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-3">
          <p className="typography-meta text-muted-foreground">Ivaldi</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('profile.setup.title')}</h1>
          <p className="typography-body text-muted-foreground">{t('profile.setup.description')}</p>
        </header>
        <ProfileForm />
      </div>
    </div>
  );
}
