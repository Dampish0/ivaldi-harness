import React from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/icon/Icon';
import { McpIcon } from '@/components/icons/McpIcon';
import { McpDropdownContent } from '@/components/mcp/McpDropdown';
import { ProjectContextPanel } from '@/components/layout/RightSidebarTabs';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { TerminalView } from '@/components/views/TerminalView';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { useMcpStore } from '@/stores/useMcpStore';
import { useProductModeStore } from '@/stores/useProductModeStore';

import { MobileChangesSurface } from './MobileChangesSurface';
import { MobileFilesSurface } from './MobileFilesSurface';
import { useMobileModalFocus } from './useMobileModalFocus';
import { MOBILE_PANEL_EASING, useMobilePanelPresence } from './useMobilePanelPresence';

const DRAWER_ROOT_ID = 'mobile-surface-root';
const ENTER_DURATION_MS = 220;

export type MobileWorkspaceTab = 'changes' | 'files' | 'terminal' | 'notes' | 'mcp';

/** Quick MCP enable/disable toggles as a workspace pane, with its own slim
    action row (add server → settings, refresh) replacing the old fullscreen
    surface's header actions. */
const McpWorkspacePane: React.FC<{ onOpenMcpSettings: () => void }> = ({ onOpenMcpSettings }) => {
  const { t } = useI18n();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const refreshMcpStatus = useMcpStore((state) => state.refresh);
  const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);

  const refresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const minSpinPromise = new Promise((resolve) => window.setTimeout(resolve, 500));
    void Promise.all([
      refreshMcpStatus({ directory: currentDirectory || null, silent: true }),
      loadMcpConfigs({ force: true }),
      minSpinPromise,
    ]).finally(() => setIsRefreshing(false));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-1 px-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground"
          onClick={onOpenMcpSettings}
          aria-label={t('settings.mcp.sidebar.actions.addServerTitle')}
          title={t('settings.mcp.sidebar.actions.addServerTitle')}
          style={{ touchAction: 'manipulation' }}
        >
          <Icon name="add" className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground"
          onClick={refresh}
          disabled={isRefreshing}
          aria-label={t('mcpDropdown.actions.refreshAria')}
          title={t('mcpDropdown.actions.refreshAria')}
          style={{ touchAction: 'manipulation' }}
        >
          <Icon name="refresh" className={cn('size-5', isRefreshing && 'animate-spin')} />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <McpDropdownContent
          active
          className="h-full"
          listClassName="max-h-none"
          hideHeader
          mobileListDensity
        />
      </div>
    </div>
  );
};

/** Workspace tabs. Developer exposes Changes / Files / Terminal / Notes / MCP;
    Work exposes Files / Notes / MCP.

    Two hosts, same content and same state:
     - `drawer` (default) covers the app and slides in from the right edge —
       the phone, and a tablet in portrait where a side panel would leave no
       usable chat column;
     - `panel` renders inline so the caller can size it as a real sidebar
       beside the chat (tablet, landscape). The caller owns the width and the
       open/close animation there; this component only fills it.

    Closes via the header X, Escape (unless the terminal tab owns the keys), or
    the Android back button (handled by MobileShell). */
export const MobileWorkspaceDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  tab: MobileWorkspaceTab;
  onTabChange: (tab: MobileWorkspaceTab) => void;
  /** When set, the Changes tab opens directly into the per-file diff. */
  pendingChangesDiff: { path: string; staged: boolean } | null;
  /** Notes tab: opens a plan fullscreen (layered above the drawer). */
  onOpenPlan: (plan: { id: string; title: string }) => void;
  /** MCP tab: jump to the MCP settings page pre-seeded with a new server draft. */
  onOpenMcpSettings: () => void;
  variant?: 'drawer' | 'panel';
}> = ({ open, onClose, tab, onTabChange, pendingChangesDiff, onOpenPlan, onOpenMcpSettings, variant = 'drawer' }) => {
  const { t } = useI18n();
  const isDeveloperMode = useProductModeStore((state) => state.mode === 'developer');
  const effectiveDirectory = useEffectiveDirectory();
  const effectiveTab: MobileWorkspaceTab = !isDeveloperMode && (tab === 'changes' || tab === 'terminal')
    ? 'files'
    : tab;
  const rootRef = React.useRef<HTMLElement | null>(null);
  const surfaceRef = React.useRef<HTMLElement | null>(null);
  const { visible, entered, reducedMotion } = useMobilePanelPresence(open, ENTER_DURATION_MS);
  const tabsRef = React.useRef<HTMLDivElement | null>(null);
  const activeTabRef = React.useRef<HTMLButtonElement | null>(null);

  // Adding Developer tabs must not leave the selected Work tab off-screen.
  React.useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const selected = activeTabRef.current;
    if (!open || !visible || !tabs || !selected) return;
    const start = selected.offsetLeft;
    const end = start + selected.offsetWidth;
    if (start < tabs.scrollLeft) tabs.scrollLeft = start;
    else if (end > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = end - tabs.clientWidth;
  }, [effectiveTab, isDeveloperMode, open, visible]);

  React.useEffect(() => {
    if (effectiveTab !== tab) {
      onTabChange(effectiveTab);
    }
  }, [effectiveTab, onTabChange, tab]);

  // Tabs the user has actually opened — their panes stay mounted afterwards.
  const [visitedTabs, setVisitedTabs] = React.useState<ReadonlySet<MobileWorkspaceTab>>(() => new Set());
  React.useEffect(() => {
    if (!open) return;
    setVisitedTabs((current) => {
      if (current.has(effectiveTab)) return current;
      const next = new Set(current);
      next.add(effectiveTab);
      return next;
    });
  }, [effectiveTab, open]);

  const ownerDocument = globalThis.document;
  if (ownerDocument && !rootRef.current) {
    let root = ownerDocument.getElementById(DRAWER_ROOT_ID);
    if (!root) {
      root = ownerDocument.createElement('div');
      root.id = DRAWER_ROOT_ID;
      ownerDocument.body.appendChild(root);
    }
    rootRef.current = root;
  }

  useMobileModalFocus(surfaceRef, open && variant === 'drawer', effectiveTab === 'terminal' ? null : onClose);

  if (variant === 'drawer' && !rootRef.current) return null;

  const tabItems: Array<{ id: MobileWorkspaceTab; label: string; icon: React.ReactNode }> = [];
  if (isDeveloperMode) {
    tabItems.push({ id: 'changes', label: t('mobile.menu.changes'), icon: <Icon name="git-branch" className="h-3.5 w-3.5" /> });
  }
  tabItems.push({ id: 'files', label: t('mobile.menu.files'), icon: <Icon name="file-text" className="h-3.5 w-3.5" /> });
  if (isDeveloperMode) {
    tabItems.push({ id: 'terminal', label: t('mobile.menu.terminal'), icon: <Icon name="terminal" className="h-3.5 w-3.5" /> });
  }
  tabItems.push(
    { id: 'notes', label: t('rightSidebar.contextNotesTodo.tabs.notes'), icon: <Icon name="sticky-note" className="h-3.5 w-3.5" /> },
    { id: 'mcp', label: t('mobile.menu.mcp'), icon: <McpIcon className="h-3.5 w-3.5" /> },
  );

  const body = (
    <>
      <div className="flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <div
          ref={tabsRef}
          className="scrollbar-none relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          role="tablist"
          aria-label={t('sortableTabsStrip.aria.tabs')}
        >
          {visible ? tabItems.map((item) => {
            const active = item.id === effectiveTab;
            return (
              <Button
                key={item.id}
                ref={active ? activeTabRef : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={item.label}
                title={item.label}
                variant="ghost"
                size="default"
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'shrink-0 gap-1.5 text-muted-foreground',
                  active && 'bg-interactive-selection text-interactive-selection-foreground hover:bg-interactive-selection',
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">{item.icon}</span>
                <span className="typography-ui-label font-medium">{item.label}</span>
              </Button>
            );
          }) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label={t('mobile.surface.closeAria')}
          onClick={onClose}
          style={{ touchAction: 'manipulation' }}
        >
          <Icon name="close" className="size-5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* Panes stay MOUNTED once visited (hidden when inactive/closed), so
            reopening the drawer lands exactly where the user left off — an
            open diff, an edited file, an attached terminal. */}
        {isDeveloperMode && visitedTabs.has('changes') ? (
          <div
            // A newly requested per-file diff remounts the pane so
            // initialDiffPath applies; plain reopens keep the state.
            key={`${effectiveDirectory}:changes:${pendingChangesDiff?.path ?? ''}:${pendingChangesDiff?.staged ?? false}`}
            className={cn('h-full', effectiveTab !== 'changes' && 'hidden')}
          >
            <ErrorBoundary>
              <MobileChangesSurface
                active={open && effectiveTab === 'changes'}
                initialDiffPath={pendingChangesDiff?.path ?? null}
                initialDiffStaged={pendingChangesDiff?.staged === true}
              />
            </ErrorBoundary>
          </div>
        ) : null}
        {visitedTabs.has('files') ? (
          <div className={cn('h-full', effectiveTab !== 'files' && 'hidden')}>
            <ErrorBoundary>
              <MobileFilesSurface active={open && effectiveTab === 'files'} />
            </ErrorBoundary>
          </div>
        ) : null}
        {isDeveloperMode && visitedTabs.has('terminal') ? (
          <div className={cn('h-full', effectiveTab !== 'terminal' && 'hidden')}>
            <ErrorBoundary>
              <TerminalView visible={open && effectiveTab === 'terminal'} />
            </ErrorBoundary>
          </div>
        ) : null}
        {visitedTabs.has('notes') ? (
          <div className={cn('h-full', effectiveTab !== 'notes' && 'hidden')}>
            <ErrorBoundary>
              <ProjectContextPanel onActionComplete={onClose} onOpenPlan={onOpenPlan} />
            </ErrorBoundary>
          </div>
        ) : null}
        {visitedTabs.has('mcp') ? (
          <div className={cn('h-full', effectiveTab !== 'mcp' && 'hidden')}>
            <ErrorBoundary>
              <McpWorkspacePane onOpenMcpSettings={onOpenMcpSettings} />
            </ErrorBoundary>
          </div>
        ) : null}
      </div>
    </>
  );

  if (variant === 'panel') {
    // The caller animates the width; the content itself is plain flow so it
    // never gets its own compositing layer (iOS clips those to the safe-area
    // viewport, which is exactly what the drawer's settled `transform: none`
    // avoids on the other host).
    return (
      <div
        inert={!open}
        className="flex h-full min-h-0 flex-col bg-background text-foreground"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented && effectiveTab !== 'terminal'
            && event.target instanceof Node && event.currentTarget.contains(event.target)) {
            event.preventDefault();
            onClose();
          }
        }}
      >{body}</div>
    );
  }

  const portalRoot = rootRef.current;
  if (!portalRoot) return null;

  return createPortal(
    <section
      ref={surfaceRef}
      role="dialog"
      tabIndex={-1}
      aria-modal="true"
      aria-label={t('mobile.header.openWorkspaceAria')}
      aria-hidden={!open}
      inert={!open}
      className="oc-keyboard-inset-surface fixed inset-0 z-50 flex flex-col bg-background text-foreground"
      style={{
        paddingTop: 'var(--oc-safe-area-top, 0px)',
        // Settled state drops the transform entirely so the drawer isn't kept
        // on a compositing layer (iOS clips those to the safe-area viewport).
        transform: entered || reducedMotion ? 'none' : 'translateX(100%)',
        transition: reducedMotion ? 'none' : `transform ${ENTER_DURATION_MS}ms ${MOBILE_PANEL_EASING}`,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {body}
    </section>,
    portalRoot,
  );
};
