import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { useI18n } from '@/lib/i18n';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';

interface ModelGroup {
  id: string;
  name: string;
  models: Array<{ id: string; name: string; favorite: boolean }>;
}

interface MobileWorkModelPickerProps {
  open: boolean;
  groups: ModelGroup[];
  selectedProvider: string | null;
  selectedModel: string | null;
  selectedName: string;
  favorite: boolean;
  thinkingLabel: string | null;
  retrying: boolean;
  onClose: () => void;
  onSelect: (providerId: string, modelId: string) => void;
  onToggleFavorite: () => void;
  onThinking: () => void;
  onRetry: () => void;
  onSettings: () => void;
}

/** Work's model chooser shares selection policy with ModelControls. */
export function MobileWorkModelPicker({ open, groups, selectedProvider, selectedModel, selectedName, favorite, thinkingLabel, retrying, onClose, onSelect, onToggleFavorite, onThinking, onRetry, onSettings }: MobileWorkModelPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  React.useEffect(() => { if (open) setQuery(''); }, [open]);
  const normalizedQuery = query.trim();
  const visibleGroups = groups.map((group) => ({
    ...group,
    models: group.models.filter((model) => matchesRankQuery([model.name, model.id, group.name, group.id], normalizedQuery)),
  })).filter((group) => group.models.length > 0);
  const selectedGroup = visibleGroups.find((group) => group.id === selectedProvider);
  const selectedChoice = selectedGroup?.models.find((model) => model.id === selectedModel);
  const favorites = visibleGroups.flatMap((group) => group.models.filter((model) => model.favorite && !(group.id === selectedProvider && model.id === selectedModel)).map((model) => ({ ...model, providerId: group.id, providerName: group.name })));
  const renderModel = (providerId: string, model: ModelGroup['models'][number], providerName?: string) => {
    const selected = selectedProvider === providerId && selectedModel === model.id;
    return (
      <Button key={`${providerId}/${model.id}`} type="button" variant="ghost" aria-pressed={selected} onClick={() => onSelect(providerId, model.id)} className={cn('h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-3 py-3 text-left font-normal', selected && 'bg-interactive-selection text-interactive-selection-foreground')}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] leading-6">{model.name}</span>
          {providerName ? <span className="block truncate text-[13px] leading-5 text-muted-foreground">{providerName}</span> : null}
        </span>
        {selected ? <Icon name="check" className="size-5 shrink-0" /> : null}
      </Button>
    );
  };
  return (
    <MobileOverlayPanel open={open} onClose={onClose} title={t('chat.modelControls.selectModel')} contentMaxHeightClassName="max-h-[min(58dvh,520px)]" renderHeader={(closeButton) => (
      <div className="px-4 pb-3 pt-2">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-[18px] font-semibold">{t('chat.modelControls.selectModel')}</h2>
          {closeButton}
        </div>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chat.modelControls.searchModels')} aria-label={t('chat.modelControls.searchModels')} className="h-11 rounded-xl border-transparent bg-[var(--surface-elevated)] pl-10 pr-12 shadow-none" />
          {query ? <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-1/2 -translate-y-1/2" aria-label={t('chat.modelControls.clearSearch')} onClick={() => setQuery('')}><Icon name="close" className="size-4" /></Button> : null}
        </div>
      </div>
    )} footer={selectedProvider && selectedModel ? (
      <div className="flex min-w-0 items-center gap-2">
        {thinkingLabel ? <Button type="button" variant="ghost" className="min-w-0 flex-1 justify-start gap-2 font-normal" onClick={onThinking}>
          <span className="text-muted-foreground">{t('chat.modelControls.thinking')}</span>
          <span className="truncate">{thinkingLabel}</span>
          <Icon name="arrow-right-s" className="size-4 shrink-0 text-muted-foreground" />
        </Button> : <span className="min-w-0 flex-1 truncate px-2 typography-meta text-muted-foreground">{selectedName}</span>}
        <Button type="button" variant="ghost" size="icon" onClick={onToggleFavorite} aria-label={t(favorite ? 'chat.modelControls.unfavoriteAria' : 'chat.modelControls.favoriteAria')}><Icon name={favorite ? 'star-fill' : 'star'} className="size-5" /></Button>
      </div>
    ) : undefined}>
      <div className="space-y-4 px-1 pb-2" data-mobile-work-models>
        {selectedGroup && selectedChoice ? <section>
          <h3 className="px-3 pb-1 text-[13px] font-medium text-muted-foreground">{t('chat.modelControls.current')}</h3>
          {renderModel(selectedGroup.id, selectedChoice, selectedGroup.name)}
        </section> : null}
        {favorites.length > 0 ? <section>
          <h3 className="px-3 pb-1 text-[13px] font-medium text-muted-foreground">{t('chat.modelControls.favorites')}</h3>
          {favorites.map((model) => renderModel(model.providerId, model, model.providerName))}
        </section> : null}
        {visibleGroups.map((group) => {
          const models = group.models.filter((model) => !model.favorite && !(group.id === selectedProvider && model.id === selectedModel));
          return models.length > 0 ? <section key={group.id}>
            <h3 className="px-3 pb-1 text-[13px] font-medium text-muted-foreground">{group.name}</h3>
            {models.map((model) => renderModel(group.id, model))}
          </section> : null;
        })}
        {visibleGroups.length === 0 ? <div className="space-y-3 px-4 py-8 text-center typography-meta text-muted-foreground">
          <p>{retrying ? t('common.loading') : normalizedQuery ? t('chat.modelControls.noProvidersOrModelsFound') : t('mobile.models.unavailable')}</p>
          {!normalizedQuery ? <div className="flex justify-center gap-2">
            <Button type="button" variant="outline" disabled={retrying} onClick={onRetry}>{t('startup.initRecovery.retry')}</Button>
            <Button type="button" variant="ghost" onClick={onSettings}>{t('commandPalette.item.openSettings')}</Button>
          </div> : null}
        </div> : null}
      </div>
    </MobileOverlayPanel>
  );
}
