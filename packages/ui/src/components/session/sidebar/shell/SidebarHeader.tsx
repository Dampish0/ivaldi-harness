import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Icon } from "@/components/icon/Icon";
import { ArrowsMerge } from '@/components/icons/ArrowsMerge';
import { Button } from '@/components/ui/button';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useSessionMultiSelectStore } from '@/stores/useSessionMultiSelectStore';
import { useI18n } from '@/lib/i18n';
import { updateDesktopSettings } from '@/lib/persistence';

type Props = {
  hideDirectoryControls: boolean;
  onNewSession: () => void;
  showProjectDisplayControls: boolean;
  showRecentControls: boolean;
  handleOpenDirectoryDialog: () => void;
  onOpenScheduled: () => void;
  onOpenMultiRun: () => void;
  canOpenMultiRun: boolean;
  onOpenArchive: () => void;
  headerActionIconClass: string;
  headerActionButtonClass: string;
  isSessionSearchOpen: boolean;
  setIsSessionSearchOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  sessionSearchInputRef: React.RefObject<HTMLInputElement | null>;
  sessionSearchQuery: string;
  setSessionSearchQuery: (value: string) => void;
  hasSessionSearchQuery: boolean;
  searchMatchCount: number;
  collapseAllProjects: () => void;
  expandAllProjects: () => void;
};

export function SidebarHeader(props: Props): React.ReactNode {
  const { t } = useI18n();
  const {
    hideDirectoryControls,
    onNewSession,
    showProjectDisplayControls,
    showRecentControls,
    handleOpenDirectoryDialog,
    onOpenScheduled,
    onOpenMultiRun,
    canOpenMultiRun,
    onOpenArchive,
    headerActionIconClass,
    headerActionButtonClass,
    isSessionSearchOpen,
    setIsSessionSearchOpen,
    sessionSearchInputRef,
    sessionSearchQuery,
    setSessionSearchQuery,
    hasSessionSearchQuery,
    searchMatchCount,
    collapseAllProjects,
    expandAllProjects,
  } = props;

  const selectionModeEnabled = useSessionMultiSelectStore((state) => state.enabled);
  const toggleSelectionMode = useSessionMultiSelectStore((state) => state.toggleMode);

  const showRecentSection = useSessionDisplayStore((state) => state.showRecentSection);
  const toggleRecentSection = useSessionDisplayStore((state) => state.toggleRecentSection);
  const projectSortOrder = useSessionDisplayStore((state) => state.projectSortOrder);
  const setProjectSortOrder = useSessionDisplayStore((state) => state.setProjectSortOrder);
  const sessionGroupingMode = useSessionDisplayStore((state) => state.sessionGroupingMode);
  const setSessionGroupingMode = useSessionDisplayStore((state) => state.setSessionGroupingMode);
  const stickyZoneHeaders = useSessionDisplayStore((state) => state.stickyZoneHeaders);
  const toggleStickyZoneHeaders = useSessionDisplayStore((state) => state.toggleStickyZoneHeaders);
  const projectDisplayMode = useSessionDisplayStore((state) => state.projectDisplayMode);
  const setProjectDisplayMode = useSessionDisplayStore((state) => state.setProjectDisplayMode);
  const productMode = useProductModeStore((state) => state.mode);
  const setProductMode = useProductModeStore((state) => state.setMode);
  const isSingleProjectMode = showProjectDisplayControls && projectDisplayMode === 'single';
  const searchChatsLabel = productMode === 'work'
    ? t('chat.work.searchChats')
    : t('sessions.sidebar.header.actions.searchSessions');
  const searchPlaceholder = productMode === 'work'
    ? t('chat.work.searchChatsPlaceholder')
    : t('sessions.sidebar.header.search.placeholder');
  const selectSessionsLabel = productMode === 'work'
    ? t('chat.work.selectChats')
    : t('sessions.sidebar.header.actions.selectSessions');



  if (hideDirectoryControls) {
    return null;
  }

  return (
    <div className="select-none flex-shrink-0 px-2.5 pb-1.5 pt-1.5">
      <div className="flex h-auto min-h-8 flex-col gap-1">
        <div className="flex h-8 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNewSession}
            className="min-w-0 flex-1 justify-start gap-2 px-1.5 font-medium text-foreground hover:bg-interactive-hover"
          >
            <Icon name="chat-new" className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">
              {productMode === 'work'
                ? t('chat.work.newChat')
                : t('sessions.sidebar.header.actions.newSession')}
            </span>
          </Button>
          <div className="ml-auto flex items-center gap-0.5">
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsSessionSearchOpen((prev) => !prev)}
                  className={cn(headerActionButtonClass, 'text-muted-foreground hover:text-foreground')}
                  aria-label={searchChatsLabel}
                  aria-expanded={isSessionSearchOpen}
                >
                  <Icon name="search" className={headerActionIconClass} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}><p>{t('sessions.sidebar.header.actions.searchSessions')}</p></TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(headerActionButtonClass, 'text-muted-foreground hover:text-foreground')}
                      aria-label={t('sessions.sidebar.header.displayMode.label')}
                    >
                      <Icon name="more" className={headerActionIconClass} />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}><p>{t('sessions.sidebar.header.displayMode.label')}</p></TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem onClick={handleOpenDirectoryDialog} className="flex items-center gap-2">
                  <Icon name="folder-add" className="h-4 w-4" />
                  <span>{t('sessions.sidebar.header.actions.addProject')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenScheduled} className="flex items-center gap-2">
                  <Icon name="calendar-schedule" className="h-4 w-4" />
                  <span>{t('sessions.sidebar.header.actions.scheduledTasks')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenMultiRun} disabled={!canOpenMultiRun} className="flex items-center gap-2">
                  <ArrowsMerge className="h-4 w-4" />
                  <span>{t('sessions.sidebar.header.actions.newMultiRun')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenArchive} className="flex items-center gap-2">
                  <Icon name="archive" className="h-4 w-4" />
                  <span>{t('sessions.sidebar.nav.archive')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleSelectionMode} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Icon name="checkbox-multiple" className="h-4 w-4" />
                    <span>{selectionModeEnabled
                      ? t('sessions.sidebar.header.actions.exitSelection')
                      : selectSessionsLabel}</span>
                  </span>
                  {selectionModeEnabled ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{t('sessions.sidebar.header.productMode.label')}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[170px]">
                    <DropdownMenuItem
                      onClick={() => setProductMode('work')}
                      className="flex items-center justify-between"
                    >
                      <span>{t('sessions.sidebar.header.productMode.work')}</span>
                      {productMode === 'work' ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setProductMode('developer')}
                      className="flex items-center justify-between"
                    >
                      <span>{t('sessions.sidebar.header.productMode.developer')}</span>
                      {productMode === 'developer' ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{t('sessions.sidebar.header.actions.sortProjects')}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[170px]">
                    {([
                      ['manual', 'sessions.sidebar.header.projectSort.manual'],
                      ['a-z', 'sessions.sidebar.header.projectSort.aToZ'],
                      ['z-a', 'sessions.sidebar.header.projectSort.zToA'],
                      ['date-added', 'sessions.sidebar.header.projectSort.dateAdded'],
                      ['recent', 'sessions.sidebar.header.projectSort.recent'],
                    ] as const).map(([order, labelKey]) => (
                      <DropdownMenuItem
                        key={order}
                        onClick={() => {
                          setProjectSortOrder(order);
                          void updateDesktopSettings({ sidebarProjectSortOrder: order });
                        }}
                        className="flex items-center justify-between"
                      >
                        <span>{t(labelKey)}</span>
                        {projectSortOrder === order ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {showProjectDisplayControls ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{t('sessions.sidebar.header.projectDisplay.label')}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-[170px]">
                      {([
                        ['all', 'sessions.sidebar.header.projectDisplay.all'],
                        ['single', 'sessions.sidebar.header.projectDisplay.single'],
                      ] as const).map(([mode, labelKey]) => (
                        <DropdownMenuItem
                          key={mode}
                          onClick={() => {
                            setProjectDisplayMode(mode);
                            void updateDesktopSettings({ sidebarProjectDisplayMode: mode });
                          }}
                          className="flex items-center justify-between"
                        >
                          <span>{t(labelKey)}</span>
                          {projectDisplayMode === mode ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                {productMode === 'developer' ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{t('sessions.sidebar.header.grouping.label')}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-[170px]">
                      {([
                        ['by-worktree', 'sessions.sidebar.header.grouping.byWorktree'],
                        ['flat', 'sessions.sidebar.header.grouping.flat'],
                      ] as const).map(([mode, labelKey]) => (
                        <DropdownMenuItem
                          key={mode}
                          onClick={() => {
                            setSessionGroupingMode(mode);
                            void updateDesktopSettings({ sidebarSessionGroupingMode: mode });
                          }}
                          className="flex items-center justify-between"
                        >
                          <span>{t(labelKey)}</span>
                          {sessionGroupingMode === mode ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{t('sessions.sidebar.header.displayMode.label')}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[190px]">
                    {showRecentControls && !isSingleProjectMode ? (
                      <DropdownMenuItem
                        onClick={() => {
                          toggleRecentSection();
                          void updateDesktopSettings({ sidebarShowRecentSection: !showRecentSection });
                        }}
                        className="flex items-center justify-between"
                      >
                        <span>{t('sessions.sidebar.header.displayMode.showRecent')}</span>
                        {showRecentSection ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onClick={toggleStickyZoneHeaders}
                      className="flex items-center justify-between"
                    >
                      <span>{t('sessions.sidebar.header.displayMode.stickyHeaders')}</span>
                      {stickyZoneHeaders ? <Icon name="check" className="h-4 w-4 text-foreground" /> : null}
                    </DropdownMenuItem>
                    {!isSingleProjectMode ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={collapseAllProjects} className="flex items-center gap-2">
                          <Icon name="contract-up-down" className="h-4 w-4" />
                          <span>{t('sessions.sidebar.header.displayMode.collapseAll')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={expandAllProjects} className="flex items-center gap-2">
                          <Icon name="expand-up-down" className="h-4 w-4" />
                          <span>{t('sessions.sidebar.header.displayMode.expandAll')}</span>
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isSessionSearchOpen ? (
          <div className="pb-1 pt-0.5">
            {hasSessionSearchQuery ? (
              <div className="mb-1 flex items-center justify-between px-0.5 typography-micro text-muted-foreground/80">
                <span>{searchMatchCount === 1
                  ? t('sessions.sidebar.header.search.matchCountSingle', { count: searchMatchCount })
                  : t('sessions.sidebar.header.search.matchCountPlural', { count: searchMatchCount })}</span>
                <span>{t('sessions.sidebar.header.search.escapeHint')}</span>
              </div>
            ) : null}
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={sessionSearchInputRef}
                value={sessionSearchQuery}
                onChange={(event) => setSessionSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-md border border-border bg-transparent pl-8 pr-8 typography-ui-label text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    if (hasSessionSearchQuery) {
                      setSessionSearchQuery('');
                    } else {
                      setIsSessionSearchOpen(false);
                    }
                  }
                }}
              />
              {sessionSearchQuery.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSessionSearchQuery('')}
                  className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
                  aria-label={t('sessions.sidebar.header.search.clear')}
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
