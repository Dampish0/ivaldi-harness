import React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";
import { ensureSettingsDictionary, useI18n } from '@/lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { ProfileForm } from '@/components/onboarding/ProfileSetup';
import { useUIStore } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const GitHubSettings = React.lazy(async () => {
  await ensureSettingsDictionary();
  const module = await import('@/components/sections/openchamber/GitHubSettings');
  return { default: module.GitHubSettings };
});

type Props = {
  onOpenSettings: () => void;
  onOpenUpdate: () => void;
  showRuntimeButtons?: boolean;
  showUpdateButton?: boolean;
};

export function SidebarFooter({
  onOpenSettings,
  onOpenUpdate,
  showRuntimeButtons = true,
  showUpdateButton = true,
}: Props): React.ReactNode {
  const { t } = useI18n();
  const githubStatus = useGitHubAuthStore((state) => state.status);
  const hasCheckedGitHub = useGitHubAuthStore((state) => state.hasChecked);
  const isLoadingGitHub = useGitHubAuthStore((state) => state.isLoading);
  const profile = useProfileStore((state) => state.profile);
  const setSettingsPage = useUIStore((state) => state.setSettingsPage);
  const openCodeUpdate = useUpdateStore((state) => state.openCodeUpdate);
  const hasOpenCodeUpdate = showRuntimeButtons && openCodeUpdate !== null;
  const [githubDialogAction, setGitHubDialogAction] = React.useState<'connect' | 'disconnect' | 'manage' | null>(null);
  const [editingProfile, setEditingProfile] = React.useState(false);
  const user = githubStatus?.connected ? githubStatus.user : null;
  const displayName = profile.kind === 'ready' ? profile.name : user?.name?.trim() || user?.login || t('profile.fallback');
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase();
  const accountDetail = githubStatus?.error
    ? t('settings.github.page.status.loadFailed')
    : !hasCheckedGitHub || isLoadingGitHub
      ? t('common.loading')
      : githubStatus?.connected
        ? user?.login ? `@${user.login}` : t('header.github.connected')
        : t('sessions.sidebar.footer.github.notConnected');
  const avatar = user?.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className="size-7 shrink-0 rounded-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground ring-1 ring-border/50" aria-hidden="true">
      {initials}
    </span>
  );

  if (!showRuntimeButtons && !showUpdateButton) {
    return null;
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 px-2.5 py-2">
        {showRuntimeButtons ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="min-w-0 flex-1 justify-start gap-2 pl-1"
                title={displayName}
                aria-label={`${displayName}, ${accountDetail}`}
              >
                {avatar}
                <span className="min-w-0 truncate text-left">{displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] p-2">
              <DropdownMenuLabel className="flex items-center gap-3 px-2 py-3">
                {avatar}
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{displayName}</span>
                  <span className="mt-0.5 block break-words typography-meta font-normal text-muted-foreground">{accountDetail}</span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="mx-2 my-1" />
              <DropdownMenuItem className="gap-3 py-2" onSelect={() => setEditingProfile(true)}>
                <Icon name="user" className="size-4" />
                {t('profile.actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-3 py-2"
                disabled={!hasCheckedGitHub || isLoadingGitHub}
                onSelect={() => setGitHubDialogAction(githubStatus?.error ? 'manage' : githubStatus?.connected ? 'disconnect' : 'connect')}
              >
                <Icon name="github-fill" className="size-4" />
                {githubStatus?.error
                  ? t('settings.common.actions.retry')
                  : githubStatus?.connected
                    ? t('sessions.sidebar.footer.github.disconnect')
                    : t('settings.github.page.actions.connect')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-2 my-1" />
              <DropdownMenuItem className="gap-3 py-2" onSelect={() => { setSettingsPage('usage'); onOpenSettings(); }}>
                <Icon name="bar-chart-box" className="size-4" />
                {t('settings.page.usage.title')}
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 py-2" onSelect={onOpenSettings}>
                <Icon name="settings-3" className="size-4" />
                {t('sessions.sidebar.footer.actions.settings')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {showUpdateButton || hasOpenCodeUpdate ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto rounded-full text-[var(--status-info)]"
                title={t('sessions.sidebar.footer.actions.update')}
                aria-label={t('sessions.sidebar.footer.actions.update')}
              >
                <Icon name="download" className="size-4" />
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--status-info)]" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={8}>
              {showUpdateButton ? (
                <DropdownMenuItem onSelect={onOpenUpdate}>
                  {t('sessions.sidebar.footer.update.product', { product: 'Ivaldi' })}
                </DropdownMenuItem>
              ) : null}
              {hasOpenCodeUpdate && openCodeUpdate ? (
                <DropdownMenuItem onSelect={openCodeUpdate.open}>
                  {t('sessions.sidebar.footer.update.product', { product: 'OpenCode' })}
                  <span className="ml-2 typography-micro text-muted-foreground">{openCodeUpdate.version}</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <Dialog open={githubDialogAction !== null} onOpenChange={(open) => { if (!open) setGitHubDialogAction(null); }}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{t('header.github.accountsTitle')}</DialogTitle></DialogHeader>
          {githubDialogAction !== null ? (
            <React.Suspense fallback={<p className="text-muted-foreground">{t('common.loading')}</p>}>
              <GitHubSettings initialAction={githubDialogAction === 'manage' ? undefined : githubDialogAction} />
            </React.Suspense>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={editingProfile} onOpenChange={setEditingProfile}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{t('profile.actions.edit')}</DialogTitle></DialogHeader>
          {editingProfile ? <ProfileForm showModeSelection onSaved={() => setEditingProfile(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
