import React from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SidebarTopBar } from './SidebarTopBar';
import { TitlebarLeftControls } from './TitlebarLeftControls';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { SessionSidebar } from '@/components/session/SessionSidebar';
import { SessionDialogs } from '@/components/session/SessionDialogs';
import { DiffWorkerProvider } from '@/contexts/DiffWorkerProvider';

import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUpdatePolling } from '@/hooks/useUpdatePolling';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';
import { preloadSettingsRouteModules } from '@/lib/settings/preload';
import { ensureSettingsDictionary } from '@/lib/i18n';
import { useSessionListSync } from '@/components/session/sidebar/list/useSessionListSync';

import { ChatView } from '@/components/views/ChatView';

const loadSettingsWindowModule = () => Promise.all([
    ensureSettingsDictionary(),
    import('@/components/views/SettingsWindow'),
]).then(([, module]) => module);
const SettingsWindow = lazyWithChunkRecovery(() => loadSettingsWindowModule().then(m => ({ default: m.SettingsWindow })));
const loadContextPanelModule = () => import('./ContextPanel');
const ContextPanel = lazyWithChunkRecovery(() => loadContextPanelModule().then(m => ({ default: m.ContextPanel })));
const loadCommandPaletteModule = () => import('../ui/CommandPalette');
const CommandPalette = lazyWithChunkRecovery(() => loadCommandPaletteModule().then(m => ({ default: m.CommandPalette })));
const loadHelpDialogModule = () => import('../ui/HelpDialog');
const HelpDialog = lazyWithChunkRecovery(() => loadHelpDialogModule().then(m => ({ default: m.HelpDialog })));
const OpenCodeStatusDialog = lazyWithChunkRecovery(() => import('../ui/OpenCodeStatusDialog').then(m => ({ default: m.OpenCodeStatusDialog })));
const ScheduledTasksDialog = lazyWithChunkRecovery(() => import('@/components/session/ScheduledTasksDialog').then(m => ({ default: m.ScheduledTasksDialog })));
const ArchiveView = lazyWithChunkRecovery(() => import('@/components/views/ArchiveView').then(m => ({ default: m.ArchiveView })));
const WorktreesView = lazyWithChunkRecovery(() => import('@/components/views/WorktreesView').then(m => ({ default: m.WorktreesView })));
const MultiRunLauncher = lazyWithChunkRecovery(() => import('@/components/multirun').then(m => ({ default: m.MultiRunLauncher })));

/**
 * Desktop-surface layout: the chat owns the main area, and every other
 * surface (git, diff, files, terminal, ...) opens in the ContextPanel via the
 * rail. Phone-sized viewports run the separate MobileApp shell — a viewport
 * crossing the threshold reloads into it (see watchHostedSurfaceViewport).
 */
export const MainLayout: React.FC = () => {
    useSessionListSync({ isVSCode: false });
    const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
    const setIsMobile = useUIStore((state) => state.setIsMobile);
    const isSettingsDialogOpen = useUIStore((state) => state.isSettingsDialogOpen);
    const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
    const isCommandPaletteOpen = useUIStore((state) => state.isCommandPaletteOpen);
    const isHelpDialogOpen = useUIStore((state) => state.isHelpDialogOpen);
    const isOpenCodeStatusDialogOpen = useUIStore((state) => state.isOpenCodeStatusDialogOpen);
    const isAnyContextPanelOpen = useUIStore((state) => (
        Object.values(state.contextPanelByDirectory).some((panel) => panel.isOpen)
    ));
    // Mount the windowed settings dialog only after its first open: rendering
    // the lazy component (even closed) makes React fetch the SettingsView
    // chunk graph (CodeMirror editor, vim mode, theme tooling) on startup.
    // Once opened it stays mounted so the close animation and state behave as
    // before.
    const [settingsWindowMounted, setSettingsWindowMounted] = React.useState(false);
    const [contextPanelMounted, setContextPanelMounted] = React.useState(() => isAnyContextPanelOpen);
    React.useEffect(() => {
        if (isSettingsDialogOpen) {
            setSettingsWindowMounted(true);
        }
    }, [isSettingsDialogOpen]);
    React.useEffect(() => {
        if (isAnyContextPanelOpen) {
            setContextPanelMounted(true);
        }
    }, [isAnyContextPanelOpen]);

    // Keep Settings off the startup graph, then warm it after the first few
    // seconds. `requestIdleCallback` can run immediately after first paint and
    // compete with the still-loading chat graph on cold development starts.
    // Opening Settings before this timer still loads it immediately on demand.
    React.useEffect(() => {
        let cancelled = false;
        const warm = () => {
            void loadSettingsWindowModule()
                .then(() => {
                    if (!cancelled) {
                        return preloadSettingsRouteModules();
                    }
                    return undefined;
                })
                .catch(() => {
                    // The normal lazy boundary owns chunk-load recovery. An
                    // idle warm-up is opportunistic and must never break app
                    // startup or navigation.
                });
        };

        const timeout = window.setTimeout(warm, 15000);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, []);

    // The context panel is closed for most launches. Keep its module graph out
    // of the critical shell path, then opportunistically warm it after the
    // browser has an idle turn so first use stays responsive.
    React.useEffect(() => {
        if (contextPanelMounted) return;
        let cancelled = false;
        const warm = () => {
            void loadContextPanelModule().catch(() => {
                // First-use lazy loading owns recovery. This is best-effort.
            });
        };
        const timeout = window.setTimeout(() => {
            if (!cancelled) warm();
        }, 15000);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [contextPanelMounted]);

    React.useEffect(() => {
        let cancelled = false;
        const warm = () => {
            if (cancelled) return;
            void Promise.allSettled([
                loadCommandPaletteModule(),
                loadHelpDialogModule(),
            ]);
        };
        const timeout = window.setTimeout(warm, 15000);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, []);
    const isMultiRunLauncherOpen = useUIStore((state) => state.isMultiRunLauncherOpen);
    const setMultiRunLauncherOpen = useUIStore((state) => state.setMultiRunLauncherOpen);
    const multiRunLauncherPrefillPrompt = useUIStore((state) => state.multiRunLauncherPrefillPrompt);
    const isScheduledTasksPageOpen = useUIStore((state) => state.isScheduledTasksDialogOpen);
    const isArchivePageOpen = useUIStore((state) => state.isArchivePageOpen);
    const worktreesPageProjectId = useUIStore((state) => state.worktreesPageProjectId);
    // Any full-page surface replacing the chat area. While open, the chat is
    // fully hidden (not just covered) so none of its floating chrome bleeds
    // through, and selecting a session or draft anywhere closes the surface.
    const isSurfacePageOpen = isScheduledTasksPageOpen || isArchivePageOpen || Boolean(worktreesPageProjectId) || isMultiRunLauncherOpen;

    React.useEffect(() => {
        const closeSurfacePages = () => useUIStore.getState().closeMainSurfaces();
        const unsubscribeSession = useSessionUIStore.subscribe((state, prev) => {
            const sessionSelected = Boolean(state.currentSessionId) && state.currentSessionId !== prev.currentSessionId;
            // Draft identity change covers re-opening a draft while one is
            // already open (the boolean alone never transitions then).
            const draftOpened = Boolean(state.newSessionDraft?.open) && state.newSessionDraft !== prev.newSessionDraft;
            if (sessionSelected || draftOpened) closeSurfacePages();
        });
        return () => {
            unsubscribeSession();
        };
    }, []);
    const { isMobile } = useDeviceInfo();

    useUpdatePolling();

    React.useEffect(() => {
        const previous = useUIStore.getState().isMobile;
        if (previous !== isMobile) {
            setIsMobile(isMobile);
        }
    }, [isMobile, setIsMobile]);

    return (
        <DiffWorkerProvider>
            <div
                data-ivaldi-shell="true"
                data-page-scroll-lock="true"
                className="main-content-safe-area relative flex h-[100dvh] bg-background"
            >
                {isCommandPaletteOpen ? (
                    <React.Suspense fallback={null}><CommandPalette /></React.Suspense>
                ) : null}
                {isHelpDialogOpen ? (
                    <React.Suspense fallback={null}><HelpDialog /></React.Suspense>
                ) : null}
                {isOpenCodeStatusDialogOpen ? (
                    <React.Suspense fallback={null}><OpenCodeStatusDialog /></React.Suspense>
                ) : null}
                <SessionDialogs />

                {/* Persistent top-left controls (toggle + project actions) that
                    stay put while the sidebar/header animate beneath them. */}
                <TitlebarLeftControls />
                {/* Full-height Sidebar beside [Header above (chat | RightSidebar)] */}
                <div className="flex flex-1 overflow-hidden" data-page-scroll-lock="true">
                    <Sidebar
                        isOpen={isSidebarOpen}
                        isMobile={isMobile}
                        className="border-border"
                        topBar={<SidebarTopBar />}
                    >
                        <SessionSidebar isVisible={isSidebarOpen} />
                    </Sidebar>
                    <div className="relative flex flex-1 min-w-0 flex-col overflow-hidden bg-background" data-page-scroll-lock="true">
                        <Header />
                        <div className="relative flex flex-1 min-h-0 overflow-hidden bg-background" data-page-scroll-lock="true">
                            <div className="relative flex flex-1 min-w-0 flex-col overflow-hidden border-t border-border bg-background" data-page-scroll-lock="true">
                                <div className="flex flex-1 min-h-0 overflow-hidden" data-page-scroll-lock="true">
                                    {/* Holds the chat and the context panel together, so its
                                        width does not move when the context panel opens. The
                                        work-status panel measures this rather than the chat,
                                        which the context panel animates. */}
                                    <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden" data-page-scroll-lock="true" data-chat-area="true">
                                        <main className="flex-1 overflow-hidden bg-background relative" data-page-scroll-lock="true">
                                            <div className={cn('absolute inset-0', isSurfacePageOpen && 'invisible')}>
                                                <ErrorBoundary><ChatView active={!isSettingsDialogOpen && !isSurfacePageOpen} /></ErrorBoundary>
                                            </div>
                                            {isMultiRunLauncherOpen && (
                                                <div className="absolute inset-0 z-10 bg-background">
                                                    <ErrorBoundary>
                                                        <React.Suspense fallback={null}>
                                                            {/* isWindowed: the app Header already shows the surface
                                                                title, so skip the launcher's own title bar. */}
                                                            <MultiRunLauncher
                                                                isWindowed
                                                                initialPrompt={multiRunLauncherPrefillPrompt}
                                                                onCreated={() => setMultiRunLauncherOpen(false)}
                                                                onCancel={() => setMultiRunLauncherOpen(false)}
                                                            />
                                                        </React.Suspense>
                                                    </ErrorBoundary>
                                                </div>
                                            )}
                                            {isScheduledTasksPageOpen ? (
                                                <ErrorBoundary><React.Suspense fallback={null}><ScheduledTasksDialog /></React.Suspense></ErrorBoundary>
                                            ) : null}
                                            {isArchivePageOpen ? (
                                                <ErrorBoundary><React.Suspense fallback={null}><ArchiveView /></React.Suspense></ErrorBoundary>
                                            ) : null}
                                            {worktreesPageProjectId ? (
                                                <ErrorBoundary><React.Suspense fallback={null}><WorktreesView /></React.Suspense></ErrorBoundary>
                                            ) : null}
                                        </main>
                                        {contextPanelMounted ? (
                                            <React.Suspense fallback={null}>
                                                <ContextPanel />
                                            </React.Suspense>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Settings: windowed dialog with blur */}
                {settingsWindowMounted ? (
                    <React.Suspense fallback={null}>
                        <SettingsWindow
                            open={isSettingsDialogOpen}
                            onOpenChange={setSettingsDialogOpen}
                        />
                    </React.Suspense>
                ) : null}
            </div>
        </DiffWorkerProvider>
    );
};
