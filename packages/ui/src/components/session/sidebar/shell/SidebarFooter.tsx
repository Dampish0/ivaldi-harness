import React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';

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

  if (!showRuntimeButtons && !showUpdateButton) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-t border-border/30 px-2.5 py-2">
      {showRuntimeButtons ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="min-w-0 justify-start gap-2 px-1.5 text-muted-foreground/80 hover:text-foreground"
          >
            <Icon name="settings-3" className="h-4 w-4" />
            <span className="truncate">{t('sessions.sidebar.footer.actions.settings')}</span>
          </Button>
        </>
      ) : null}
      {showUpdateButton ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto gap-1.5 px-1.5 text-muted-foreground/80 hover:bg-interactive-hover hover:text-foreground"
          onClick={onOpenUpdate}
        >
          <span className="size-1.5 rounded-full bg-[var(--status-info)]" aria-hidden="true" />
          {t('sessions.sidebar.footer.actions.update')}
        </Button>
      ) : null}
    </div>
  );
}
