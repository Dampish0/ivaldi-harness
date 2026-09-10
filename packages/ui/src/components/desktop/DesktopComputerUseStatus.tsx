import React from 'react';
import { z } from 'zod';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import {
  invokeDesktop,
  isDesktopLocalOriginActive,
  isDesktopShell,
  listenDesktopEvent,
} from '@/lib/desktop';

const computerUseStatusSchema = z.object({
  active: z.boolean().optional(),
  target: z.string().nullable().optional(),
});

export const DesktopComputerUseStatus = React.memo(function DesktopComputerUseStatus() {
  const { t } = useI18n();
  const [status, setStatus] = React.useState<z.infer<typeof computerUseStatusSchema> | null>(null);

  React.useEffect(() => {
    if (!isDesktopShell() || !isDesktopLocalOriginActive()) return;
    let dispose: (() => void | Promise<void>) | null = null;
    void invokeDesktop<unknown>('desktop_get_computer_use_status').then((payload) => {
      const parsed = computerUseStatusSchema.safeParse(payload);
      if (parsed.success) setStatus(parsed.data);
    });
    void listenDesktopEvent('ivaldi:computer-use-status', (payload) => {
      const parsed = computerUseStatusSchema.safeParse(payload);
      if (parsed.success) setStatus(parsed.data);
    }).then((listener) => { dispose = listener; });
    return () => { void dispose?.(); };
  }, []);

  if (!status?.active || !status.target) return null;

  return (
    <div className="app-region-no-drag flex h-7 max-w-56 items-center gap-1.5 rounded-md border border-border bg-muted px-2 text-muted-foreground">
      <Icon name="cursor" className="size-3.5 shrink-0 text-foreground" />
      <span className="truncate typography-micro text-foreground">{status.target}</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-5 shrink-0 px-1.5 text-muted-foreground hover:text-foreground"
        aria-label={t('contextPanel.browser.stop')}
        title={t('contextPanel.browser.stop')}
        onClick={() => { void invokeDesktop('desktop_stop_computer_use'); }}
      >
        <Icon name="stop" className="size-3" />
      </Button>
    </div>
  );
});
