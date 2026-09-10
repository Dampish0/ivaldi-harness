import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { DiffViewIcon } from '@/components/icons/DiffIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useDeviceInfo } from '@/lib/device';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useI18n } from '@/lib/i18n';
import { getVisibleContextRailSurfaces } from '@/lib/surfaces/registry';
import { cn } from '@/lib/utils';
import { useFeatureFlagsStore } from '@/stores/useFeatureFlagsStore';
import { useGitStatus } from '@/stores/useGitStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { normalizeContextPanelDirectoryKey, useUIStore } from '@/stores/useUIStore';
import { isDeveloperOnlyContextMode } from '@/lib/productMode';
import { ContextRailSurfacesDialog } from './ContextRailSurfacesDialog';

const EMPTY_TABS: never[] = [];

// Keep large Git counts compact in the menu's trailing metadata slot.
const formatSurfaceBadgeCount = (count: number): string => (count > 99 ? '99+' : String(count));

type CompactWorkStatusAction = {
  label: string;
  active: boolean;
  onSelect: () => void;
};

export const ContextPanelRail: React.FC<{
  workStatusAction?: CompactWorkStatusAction;
}> = ({ workStatusAction }) => {
  const { t } = useI18n();
  const effectiveDirectory = useEffectiveDirectory();
  const directoryKey = effectiveDirectory ? normalizeContextPanelDirectoryKey(effectiveDirectory) : '';

  const panelState = useUIStore((state) => (directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined));
  const contextRailOrder = useUIStore((state) => state.contextRailOrder);
  const openContextSurface = useUIStore((state) => state.openContextSurface);
  const planModeEnabled = useFeatureFlagsStore((state) => state.planModeEnabled);
  const productMode = useProductModeStore((state) => state.mode);
  const { screenWidth } = useDeviceInfo();
  const gitStatus = useGitStatus(productMode === 'developer' ? directoryKey || null : null);

  const tabs = panelState?.tabs ?? EMPTY_TABS;
  const visibleTabs = productMode === 'work'
    ? tabs.filter((tab) => !isDeveloperOnlyContextMode(tab.mode))
    : tabs;
  const activeTab = visibleTabs.find((tab) => tab.id === panelState?.activeTabId)
    ?? visibleTabs[visibleTabs.length - 1]
    ?? null;
  const activeMode = panelState?.isOpen ? activeTab?.mode ?? null : null;
  const changedFilesCount = gitStatus?.files.length ?? 0;

  const hiddenSurfaces = useUIStore((state) => state.contextRailHiddenSurfaces);
  const [configureOpen, setConfigureOpen] = React.useState(false);
  const surfaces = React.useMemo(() => {
    return getVisibleContextRailSurfaces({
      railOrder: contextRailOrder,
      hiddenSurfaces,
      planModeEnabled,
      productMode,
      isVSCode: isVSCodeRuntime(),
      screenWidth,
      tabs: visibleTabs,
    });
  }, [hiddenSurfaces, contextRailOrder, planModeEnabled, productMode, screenWidth, visibleTabs]);

  if (!directoryKey) {
    return null;
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-work-status-toggle={workStatusAction ? 'true' : undefined}
          aria-label={t('contextRail.aria.rail')}
          title={t('contextRail.aria.rail')}
          className={cn(
            'app-region-no-drag inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]',
            activeMode || workStatusAction?.active
              ? 'bg-interactive-selection text-interactive-selection-foreground hover:bg-interactive-selection hover:text-interactive-selection-foreground'
              : 'text-muted-foreground',
          )}
        >
          <Icon name="layout-right" className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {surfaces.map((surface) => {
          const label = t(surface.labelKey);
          const gitChangedCount = surface.id === 'git' ? changedFilesCount : 0;
          return (
            <DropdownMenuItem
              key={surface.id}
              onClick={() => openContextSurface(directoryKey, surface.mode)}
              className="flex items-center gap-2"
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                {surface.id === 'diff' ? (
                  <DiffViewIcon />
                ) : (
                  <Icon name={surface.icon} className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {gitChangedCount > 0 ? (
                <span className="typography-micro tabular-nums text-muted-foreground">
                  {formatSurfaceBadgeCount(gitChangedCount)}
                </span>
              ) : null}
              {activeMode === surface.mode ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
        {workStatusAction ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-work-status-toggle="true"
              onClick={workStatusAction.onSelect}
              className="flex items-center gap-2"
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                <Icon name="list-indefinite" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">{workStatusAction.label}</span>
              {workStatusAction.active ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
            </DropdownMenuItem>
          </>
        ) : null}
        {productMode === 'developer' ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setConfigureOpen(true)}>
              {t('contextRail.configure.open')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
    <ContextRailSurfacesDialog open={configureOpen} onOpenChange={setConfigureOpen} />
    </>
  );
};
