import React from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { ContextMenu } from '@base-ui/react/context-menu';
import type { Session } from '@opencode-ai/sdk/v2';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dropdownMenuItemClass, dropdownMenuPopupClass, dropdownMenuSeparatorClass } from '@/components/ui/dropdown-menu.styles';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useSessionTabsStore, type SessionTabSnapshot } from '@/stores/useSessionTabsStore';
import { closeSessionTabAndActivateNeighbour } from '@/lib/sessionTabs';
import { useGlobalSessionsStore, resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionStatus } from '@/sync/sync-context';
import { useSessionUnseenCount } from '@/sync/notification-store';

const restrictToXAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 });
const MAX_VERTICAL_WHEEL_STEP_PX = 44;
const SCROLL_EASING_TIME_CONSTANT_MS = 55;
const SCROLL_SNAP_EPSILON_PX = 6;

type SessionTab = {
  id: string;
  session: Session | null;
  snapshot: SessionTabSnapshot;
};

export type SessionTabMenuComponents = {
  Item: React.ComponentType<{
    className?: string;
    disabled?: boolean;
    onClick?: React.MouseEventHandler;
    children?: React.ReactNode;
  }>;
  Separator: React.ComponentType<{ className?: string }>;
};

export type SessionTabMenuArgs = {
  session: Session;
  isActive: boolean;
  select: () => void;
  closeOtherTabs: () => void;
  /** Menu primitives for the surface the menu opens in (dropdown or context menu). */
  components: SessionTabMenuComponents;
};

const dropdownComponents: SessionTabMenuComponents = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
};

const contextComponents: SessionTabMenuComponents = {
  Item: ({ className, ...props }) => (
    <ContextMenu.Item className={cn(dropdownMenuItemClass, className)} {...props} />
  ),
  Separator: ({ className, ...props }) => (
    <ContextMenu.Separator className={cn(dropdownMenuSeparatorClass, className)} {...props} />
  ),
};

/**
 * One tab, active or not. The tab drags to reorder; the menu and close
 * controls sit in a hover-revealed overlay at the tab's end (menu first,
 * close after it). One session menu — supplied by the header via
 * `renderMenu` — backs both the "..." dropdown and the right-click context
 * menu, which opens under the cursor without changing the active tab. The
 * dropdown's anchor overlay stays mounted through the close animation so the
 * popup never flashes detached. While the active tab is renaming, the
 * overlay is suppressed entirely — only the rename controls show.
 */
const SessionTabItem: React.FC<{
  tab: SessionTab;
  isActive: boolean;
  isSolo: boolean;
  suppressControls: boolean;
  onSelect: (tab: SessionTab) => void;
  onClose: (id: string) => void;
  renderMenu: (args: SessionTabMenuArgs) => React.ReactNode;
  closeOtherTabs: (id: string) => void;
  onMenuOpenChangeComplete?: (open: boolean) => void;
  children?: React.ReactNode;
}> = ({ tab, isActive, isSolo, suppressControls, onSelect, onClose, renderMenu, closeOtherTabs, onMenuOpenChangeComplete, children }) => {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Keeps the overlay (the dropdown's anchor) mounted through the close animation.
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });

  const title = tab.session?.title?.trim()
    || tab.snapshot.title.trim()
    || t('sessions.sidebar.session.untitled');
  const hasLiveSession = tab.session !== null;
  const overlayVisible = !suppressControls && (menuOpen || menuVisible);

  // Session state for the dot and the hover tooltip.
  const sessionStatus = useGlobalSessionStatus(tab.id);
  const isStreaming = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';
  const unseenCount = useSessionUnseenCount(tab.id);
  const showUnread = unseenCount > 0 && !isActive && !isStreaming;
  const showDot = isStreaming || showUnread;
  const dotLabel = isStreaming
    ? t('sessions.sidebar.session.status.active')
    : t('sessions.sidebar.session.status.unread');

  const menuArgsFor = (components: SessionTabMenuComponents): SessionTabMenuArgs | null => tab.session ? ({
    session: tab.session,
    isActive,
    select: () => onSelect(tab),
    closeOtherTabs: () => closeOtherTabs(tab.id),
    components,
  }) : null;
  const dropdownMenuArgs = menuArgsFor(dropdownComponents);
  const contextMenuArgs = menuArgsFor(contextComponents);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: DndCSS.Translate.toString(transform), transition }}
      className={cn(
        'app-region-no-drag session-tab-slot flex h-7 shrink-0 touch-none',
        isSolo ? 'w-auto max-w-56 min-w-0' : 'w-44',
        isDragging && 'z-10 opacity-60',
      )}
      data-active={isActive ? 'true' : 'false'}
      {...(isActive ? { 'data-active-session-tab': true } : {})}
    >
      <ContextMenu.Root
        open={hasLiveSession ? contextMenuOpen : false}
        onOpenChange={(open) => {
          if (hasLiveSession) setContextMenuOpen(open);
        }}
        onOpenChangeComplete={(open) => onMenuOpenChangeComplete?.(open)}
      >
        <ContextMenu.Trigger
              render={(triggerProps) => (
                <div
                  {...triggerProps}
                  {...listeners}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive || !hasLiveSession ? undefined : 0}
                  onClick={isActive || !hasLiveSession ? undefined : () => onSelect(tab)}
                  onKeyDown={isActive || !hasLiveSession ? undefined : (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(tab);
                    }
                  }}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      onClose(tab.id);
                    }
                  }}
                  data-controls-open={overlayVisible ? 'true' : 'false'}
                  aria-describedby={attributes['aria-describedby']}
                  className={cn(
                    'session-tab group/session-tab relative flex h-7 w-full min-w-0 select-none items-center rounded-md',
                    isSolo && isActive ? 'px-1' : 'px-2',
                    'transition-colors duration-75',
                    isActive
                      ? (isSolo ? 'bg-transparent' : 'bg-interactive-selection')
                      : cn(
                        'text-muted-foreground',
                        hasLiveSession && 'cursor-pointer hover:bg-interactive-hover hover:text-foreground',
                        overlayVisible && 'bg-interactive-hover text-foreground',
                      ),
                  )}
                >
                  <div className={cn(
                    'flex min-w-0 flex-1 items-center',
                    !suppressControls && 'group-hover/session-tab:pr-10',
                    overlayVisible && 'pr-10',
                  )}
                  >
                    <div className={cn(
                      'min-w-0 flex-1 overflow-hidden whitespace-nowrap',
                      !suppressControls && 'session-tab-title',
                    )}
                    >
                      {isActive ? children : (
                        <span className="text-[13px] font-medium leading-4">{title}</span>
                      )}
                    </div>
                    {showDot ? (
                      <span
                        className={cn(
                          'ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          isStreaming ? 'bg-[var(--status-success)]' : 'bg-[var(--status-info)]',
                          !suppressControls && 'group-hover/session-tab:opacity-0',
                          overlayVisible && 'opacity-0',
                        )}
                        aria-label={dotLabel}
                      />
                    ) : null}
                  </div>
                  {!suppressControls && hasLiveSession ? (
                    <div
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      className={cn(
                        'absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5',
                        'opacity-0 transition-opacity duration-150',
                        'group-hover/session-tab:flex group-hover/session-tab:opacity-100',
                        overlayVisible && 'flex opacity-100',
                      )}
                    >
                      <DropdownMenu
                        open={menuOpen}
                        onOpenChange={(open) => {
                          setMenuOpen(open);
                          if (open) setMenuVisible(true);
                        }}
                        onOpenChangeComplete={(open) => {
                          if (!open) setMenuVisible(false);
                          onMenuOpenChangeComplete?.(open);
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={t('header.sessionTabs.tabMenuAria')}
                            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="more" className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[190px]">
                          {dropdownMenuArgs ? renderMenu(dropdownMenuArgs) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <button
                        type="button"
                        aria-label={t('header.sessionTabs.closeTab')}
                        onClick={() => onClose(tab.id)}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      >
                        <Icon name="close" className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
        />
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="app-region-no-drag z-50">
            <ContextMenu.Popup
              data-slot="dropdown-menu-content"
              style={{ color: 'var(--surface-elevated-foreground)' }}
              className={cn(dropdownMenuPopupClass, 'min-w-[190px]')}
            >
              {contextMenuArgs ? renderMenu(contextMenuArgs) : null}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </div>
  );
};

/**
 * The header's horizontal working set of sessions (web/desktop only).
 *
 * Every session the user opens joins the strip once; the tab whose session is
 * current renders `children` — the header's title/rename block — inside a
 * selected pill. Closing a tab only removes it from the strip; closing the
 * active one activates its neighbour. A persisted title snapshot can paint a
 * tab before its session metadata loads; that provisional tab stays inert
 * until the live/global session record arrives.
 */
export const SessionTabsStrip: React.FC<{
  /** Menu items for one tab's session, supplied by the header. */
  renderMenu: (args: SessionTabMenuArgs) => React.ReactNode;
  /** Fires when a tab menu finishes opening/closing (deferred rename hook). */
  onMenuOpenChangeComplete?: (open: boolean) => void;
  /** While the active tab renames, its hover controls stay hidden. */
  suppressActiveTabControls?: boolean;
  children: React.ReactNode;
}> = ({ renderMenu, onMenuOpenChangeComplete, suppressActiveTabControls = false, children }) => {
  const { t } = useI18n();
  const tabIds = useSessionTabsStore((state) => state.tabIds);
  const tabSnapshots = useSessionTabsStore((state) => state.tabSnapshots);
  const ensureTab = useSessionTabsStore((state) => state.ensureTab);
  const rememberTabSnapshots = useSessionTabsStore((state) => state.rememberTabSnapshots);
  const closeOtherTabs = useSessionTabsStore((state) => state.closeOtherTabs);
  const reorderTabs = useSessionTabsStore((state) => state.reorderTabs);

  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const activeSessions = useGlobalSessionsStore((state) => state.activeSessions);

  // Opening a session anywhere (sidebar, palette, deep link) adds its tab.
  React.useEffect(() => {
    if (currentSessionId) ensureTab(currentSessionId);
  }, [currentSessionId, ensureTab]);

  const sessionsById = React.useMemo(() => {
    const map = new Map<string, Session>();
    for (const session of activeSessions) map.set(session.id, session);
    return map;
  }, [activeSessions]);

  React.useEffect(() => {
    if (tabIds.length === 0 || activeSessions.length === 0) return;
    const openIds = new Set(tabIds);
    const snapshots: SessionTabSnapshot[] = [];
    for (const session of activeSessions) {
      if (!openIds.has(session.id)) continue;
      snapshots.push({
        id: session.id,
        title: session.title ?? '',
      });
    }
    rememberTabSnapshots(snapshots);
  }, [activeSessions, rememberTabSnapshots, tabIds]);

  // Persisted display snapshots let the working set paint before the global
  // session list finishes loading. They are presentation-only continuity:
  // selection and session actions stay disabled until live session metadata
  // arrives and replaces the snapshot.
  const tabs = React.useMemo<SessionTab[]>(() => {
    const list: SessionTab[] = [];
    for (const id of tabIds) {
      const session = sessionsById.get(id) ?? null;
      const snapshot = session
        ? {
          id,
          title: session.title ?? '',
        }
        : tabSnapshots[id];
      if (snapshot) list.push({ id, session, snapshot });
    }
    return list;
  }, [tabIds, sessionsById, tabSnapshots]);

  const handleSelect = React.useCallback((tab: SessionTab) => {
    if (!tab.session) return;
    setCurrentSession(tab.id, resolveGlobalSessionDirectory(tab.session));
  }, [setCurrentSession]);

  const handleClose = React.useCallback((id: string) => {
    closeSessionTabAndActivateNeighbour(id);
  }, []);

  const handleCloseOthers = React.useCallback((id: string) => {
    closeOtherTabs(id);
    if (currentSessionId && currentSessionId !== id) {
      const kept = tabs.find((tab) => tab.id === id);
      if (kept) handleSelect(kept);
    }
  }, [closeOtherTabs, currentSessionId, handleSelect, tabs]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderTabs(String(active.id), String(over.id));
    }
  }, [reorderTabs]);

  // Soft fade at the edges while more tabs hide behind them.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const scrollTargetRef = React.useRef(0);
  const scrollFrameRef = React.useRef<number | null>(null);
  const scrollFrameTimeRef = React.useRef<number | null>(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });
  const updateEdges = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const left = node.scrollLeft > 2;
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  React.useLayoutEffect(() => {
    updateEdges();
    if (scrollFrameRef.current === null && scrollRef.current) {
      scrollTargetRef.current = scrollRef.current.scrollLeft;
    }
  }, [currentSessionId, tabs.length, updateEdges]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node || !globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(node);
    return () => observer.disconnect();
  }, [updateEdges]);

  const stopScrollAnimation = React.useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    scrollFrameTimeRef.current = null;
  }, []);

  const animateScrollTo = React.useCallback((requestedLeft: number) => {
    const node = scrollRef.current;
    if (!node) return;

    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    scrollTargetRef.current = Math.max(0, Math.min(maxScrollLeft, requestedLeft));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stopScrollAnimation();
      node.scrollLeft = scrollTargetRef.current;
      return;
    }

    if (scrollFrameRef.current !== null) return;

    const step = (now: number) => {
      const currentNode = scrollRef.current;
      if (!currentNode) {
        scrollFrameRef.current = null;
        scrollFrameTimeRef.current = null;
        return;
      }

      const maxLeft = Math.max(0, currentNode.scrollWidth - currentNode.clientWidth);
      const target = Math.max(0, Math.min(maxLeft, scrollTargetRef.current));
      scrollTargetRef.current = target;
      const remaining = target - currentNode.scrollLeft;

      if (Math.abs(remaining) <= SCROLL_SNAP_EPSILON_PX) {
        currentNode.scrollLeft = target;
        scrollFrameRef.current = null;
        scrollFrameTimeRef.current = null;
        return;
      }

      const previousFrameTime = scrollFrameTimeRef.current ?? now;
      const elapsedMs = Math.min(32, Math.max(0, now - previousFrameTime));
      scrollFrameTimeRef.current = now;
      const blend = 1 - Math.exp(-elapsedMs / SCROLL_EASING_TIME_CONSTANT_MS);
      currentNode.scrollLeft += remaining * blend;
      scrollFrameRef.current = window.requestAnimationFrame(step);
    };

    scrollFrameTimeRef.current = performance.now();
    scrollFrameRef.current = window.requestAnimationFrame(step);
  }, [stopScrollAnimation]);

  React.useEffect(() => stopScrollAnimation, [stopScrollAnimation]);

  // Keep the active tab in view when it changes.
  React.useEffect(() => {
    stopScrollAnimation();
    const node = scrollRef.current;
    node
      ?.querySelector('[data-active-session-tab]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (node) scrollTargetRef.current = node.scrollLeft;
  }, [currentSessionId, stopScrollAnimation]);

  // A normal mouse wheel reports vertical deltas even when the pointer is
  // over this horizontal strip. Convert that motion while there are hidden
  // tabs, but leave native horizontal trackpad gestures alone. At either end
  // of the strip the event can bubble normally instead of trapping the page.
  const handleWheel = React.useCallback((event: WheelEvent) => {
    const node = scrollRef.current;
    if (!node) return;
    if (node.scrollWidth <= node.clientWidth) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
      stopScrollAnimation();
      scrollTargetRef.current = node.scrollLeft;
      return;
    }

    const deltaScale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? node.clientWidth
        : 1;
    const rawDelta = event.deltaY * deltaScale;
    const normalizedDelta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), MAX_VERTICAL_WHEEL_STEP_PX);
    const maxScrollLeft = node.scrollWidth - node.clientWidth;
    const currentTarget = scrollFrameRef.current === null
      ? node.scrollLeft
      : scrollTargetRef.current;
    const nextScrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, currentTarget + normalizedDelta),
    );

    if (nextScrollLeft === currentTarget) return;
    event.preventDefault();
    animateScrollTo(nextScrollLeft);
  }, [animateScrollTo, stopScrollAnimation]);

  // React delegates wheel events through a passive root listener, which means
  // converting a vertical mouse wheel into horizontal tab scrolling is not
  // reliable here. Own the wheel event directly on the scroll container so a
  // normal desktop mouse wheel can scroll the strip without affecting native
  // horizontal trackpad gestures.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const scrollTabs = React.useCallback((direction: -1 | 1) => {
    const node = scrollRef.current;
    if (!node) return;

    const firstTab = node.querySelector<HTMLElement>('.session-tab-slot');
    const tabWidth = firstTab?.offsetWidth ?? 176;
    const currentTarget = scrollFrameRef.current === null
      ? node.scrollLeft
      : scrollTargetRef.current;
    animateScrollTo(currentTarget + direction * tabWidth * 2);
  }, [animateScrollTo]);

  const handleScroll = React.useCallback(() => {
    updateEdges();
    const node = scrollRef.current;
    if (node && scrollFrameRef.current === null) {
      scrollTargetRef.current = node.scrollLeft;
    }
  }, [updateEdges]);

  const maskImage = edges.left && edges.right
    ? 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)'
    : edges.left
      ? 'linear-gradient(to right, transparent, black 24px)'
      : edges.right
        ? 'linear-gradient(to right, black calc(100% - 24px), transparent)'
        : undefined;

  const tabIdsInOrder = React.useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  // A brand-new draft is a quiet transient title after the tabs. It becomes a
  // real tab once the first message creates the session.
  const showDraftPill = !currentSessionId || !tabs.some((tab) => tab.id === currentSessionId);

  return (
    // Keep no-drag on the tabs and controls so unused strip space remains
    // part of the native title bar.
    <div
      className="group/session-tabs relative mr-2 flex h-full min-w-0 flex-1 items-center"
      onPointerEnter={updateEdges}
      onFocusCapture={updateEdges}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="tablist"
        aria-label={t('header.sessionTabs.stripAria')}
        className="session-tabs-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain"
        style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToXAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tabIdsInOrder} strategy={horizontalListSortingStrategy}>
            {tabs.map((tab) => (
              <SessionTabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === currentSessionId}
                isSolo={tabs.length === 1}
                suppressControls={tab.id === currentSessionId && suppressActiveTabControls}
                onSelect={handleSelect}
                onClose={handleClose}
                renderMenu={renderMenu}
                closeOtherTabs={handleCloseOthers}
                onMenuOpenChangeComplete={onMenuOpenChangeComplete}
              >
                {tab.id === currentSessionId ? children : null}
              </SessionTabItem>
            ))}
          </SortableContext>
        </DndContext>
        {showDraftPill ? (
          <div
            role="tab"
            aria-selected
            className={cn(
              'session-tab-slot flex h-7 min-w-0 max-w-56 shrink items-center px-1.5',
              suppressActiveTabControls && 'app-region-no-drag',
            )}
            data-active="true"
          >
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-20 flex w-10 items-center opacity-0 transition-opacity duration-150 ease-out',
          edges.left && 'group-hover/session-tabs:opacity-100 group-focus-within/session-tabs:opacity-100',
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/95 to-transparent" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('header.sessionTabs.scrollLeftAria')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => scrollTabs(-1)}
          className={cn(
            'app-region-no-drag relative h-full w-7 rounded-none bg-transparent p-0 text-muted-foreground shadow-none transition-colors duration-150 ease-out hover:bg-transparent hover:text-foreground focus-visible:bg-transparent',
            edges.left
              ? 'group-hover/session-tabs:pointer-events-auto group-focus-within/session-tabs:pointer-events-auto'
              : 'pointer-events-none',
          )}
        >
          <Icon name="arrow-left-s" className="size-3.5" />
        </Button>
      </div>
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-20 flex w-10 items-center justify-end opacity-0 transition-opacity duration-150 ease-out',
          edges.right && 'group-hover/session-tabs:opacity-100 group-focus-within/session-tabs:opacity-100',
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-background via-background/95 to-transparent" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('header.sessionTabs.scrollRightAria')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => scrollTabs(1)}
          className={cn(
            'app-region-no-drag relative h-full w-7 rounded-none bg-transparent p-0 text-muted-foreground shadow-none transition-colors duration-150 ease-out hover:bg-transparent hover:text-foreground focus-visible:bg-transparent',
            edges.right
              ? 'group-hover/session-tabs:pointer-events-auto group-focus-within/session-tabs:pointer-events-auto'
              : 'pointer-events-none',
          )}
        >
          <Icon name="arrow-right-s" className="size-3.5" />
        </Button>
      </div>
    </div>
  );
};
