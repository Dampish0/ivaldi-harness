import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { resolveWorkChatTitle } from '@/components/session/sidebar/utils';
import { Button } from '@/components/ui/button';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useI18n } from '@/lib/i18n';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSession } from '@/sync/sync-context';

import { useMobileBackHandler } from './mobileAppContext';
import { getProjectLabel, normalizePath } from './mobilePaths';
import { MobileSessionMetadataButton } from './MobileSessionMetadata';

export const MobileHeader: React.FC<{
  onOpenSessions: () => void;
  onOpenWorkspace: () => void;
}> = ({ onOpenSessions, onOpenWorkspace }) => {
  const { t } = useI18n();
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const mode = useProductModeStore((state) => state.mode);
  const isWorkMode = mode === 'work';
  const effectiveDirectory = useEffectiveDirectory();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentSession = useSession(currentSessionId, effectiveDirectory);
  const isNewSessionDraftOpen = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));
  const project = useProjectsStore((state) => {
    const sessionDirectory = currentSession?.directory;
    if (!sessionDirectory || isChatDirectoryPath(sessionDirectory)) return undefined;
    const directory = normalizePath(sessionDirectory);
    let closest: (typeof state.projects)[number] | undefined;
    let closestRootLength = -1;
    for (const entry of state.projects) {
      const root = normalizePath(entry.path);
      if (root.length > closestRootLength && (directory === root || directory.startsWith(`${root}/`))) {
        closest = entry;
        closestRootLength = root.length;
      }
    }
    return closest;
  });
  const projectLabel = project ? project.label?.trim() || getProjectLabel(project.path) : '';
  const sessionTitle = !currentSessionId ? undefined : isWorkMode
    ? resolveWorkChatTitle(currentSession?.title, t('chat.work.untitledChat'))
    : currentSession?.title?.trim();
  const primaryLabel = sessionTitle || (currentSessionId
    ? t(isWorkMode ? 'chat.work.untitledChat' : 'mobile.sessions.untitled')
    : t(isWorkMode ? 'chat.work.newChat' : 'sessions.switcher.draftTitle'));

  const closeHeaderMenus = () => {
    setMetadataOpen(false);
  };

  React.useEffect(() => {
    setMetadataOpen(false);
  }, [currentSessionId, effectiveDirectory]);

  useMobileBackHandler('chat', metadataOpen, () => {
    closeHeaderMenus();
    return true;
  });

  return (
    <header className="oc-mobile-header relative z-30 shrink-0 bg-background" style={{ paddingTop: 'var(--oc-safe-area-top, 0px)' }}>
      <div className="flex h-[var(--oc-header-height,56px)] items-center justify-between gap-2 px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={t(isWorkMode ? 'sessions.sidebar.activity.chatsTitle' : 'mobile.sessions.openSheetAria')}
          onClick={() => { closeHeaderMenus(); onOpenSessions(); }}
        >
          <Icon name="menu-2" className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center">
        {currentSessionId && !isNewSessionDraftOpen ? (
        <MobileSessionMetadataButton
          open={metadataOpen}
          onOpenChange={setMetadataOpen}
          currentSessionId={currentSessionId}
          effectiveDirectory={effectiveDirectory ?? null}
          isNewSessionDraftOpen={isNewSessionDraftOpen}
          triggerContent={(
            <span className="flex min-w-0 flex-1 items-baseline gap-2 text-left">
              <span className="truncate text-[17px] font-medium text-foreground">{primaryLabel}</span>
              {projectLabel ? <span className="truncate typography-micro text-muted-foreground">{projectLabel}</span> : null}
            </span>
          )}
        />
        ) : <span className="text-[19px] font-semibold tracking-[-0.025em]">Ivaldi</span>}
        </div>
        {!isWorkMode ? <Button type="button" variant="ghost" size="icon" aria-label={t('mobile.header.workspace')} onClick={() => { closeHeaderMenus(); onOpenWorkspace(); }}>
          <Icon name="folder" className="size-5" />
        </Button> : null}
        <Button type="button" variant="ghost" size="icon" aria-label={t('mobile.sessions.newChat')} onClick={() => { closeHeaderMenus(); useSessionUIStore.getState().openNewSessionDraft(); }}>
          <Icon name="edit-box" className="size-5" />
        </Button>
      </div>
    </header>
  );
};
