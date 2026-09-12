import * as React from 'react';
import { z } from 'zod';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui/toast';
import { reloadOpenCodeConfiguration } from '@/stores/useAgentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { updateDesktopSettings } from '@/lib/persistence';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import {
  resolveOpenCodeUpdateVersion,
  resolveOpenCodeUpgradeStatusVersion,
  shouldShowOpenCodeUpdateToast,
} from './openCodeUpdateDedup';

const UPDATE_TOAST_ID = 'opencode-update-available';
const UPGRADE_TOAST_ID = 'opencode-upgrade-progress';
const INITIAL_CHECK_DELAY_MS = 5_000;
const CHECK_RETRY_DELAYS_MS = [10_000, 60_000];
const UPDATE_TOAST_DISMISSED_VERSION_KEY = 'opencode-update-toast-dismissed-version';
const upgradeStatusSchema = z.object({
  available: z.boolean(),
  latestVersion: z.string().nullable(),
  upgrade: z.object({ supported: z.boolean() }),
});
const upgradeResultSchema = z.object({
  success: z.boolean(),
  version: z.string().optional(),
  error: z.string().optional(),
});

export const OpenCodeUpdateToast: React.FC = () => {
  const { t } = useI18n();
  const showOpenCodeUpdateNotifications = useUIStore((state) => state.showOpenCodeUpdateNotifications);
  const isDeveloperMode = useProductModeStore((state) => state.mode === 'developer');
  const showUpdateUi = isDeveloperMode && showOpenCodeUpdateNotifications;
  const seenVersionsRef = React.useRef(new Set<string>());
  const upgradingRef = React.useRef(false);
  const upgradeRevisionRef = React.useRef(0);

  React.useEffect(() => {
    if (!showUpdateUi) {
      toast.dismiss(UPDATE_TOAST_ID);
      toast.dismiss(UPGRADE_TOAST_ID);
    }
  }, [showUpdateUi]);

  const reloadOpenCode = React.useCallback(() => {
    toast.dismiss(UPGRADE_TOAST_ID);
    void reloadOpenCodeConfiguration({
      message: t('opencodeUpdate.toast.reload.message'),
      mode: 'projects',
      scopes: ['all'],
    }).catch(() => undefined);
  }, [t]);

  const runUpgrade = React.useCallback(async () => {
    if (upgradingRef.current) return;
    const runtimeKey = getRuntimeKey();
    upgradeRevisionRef.current += 1;
    upgradingRef.current = true;
    toast.dismiss(UPDATE_TOAST_ID);
    toast.message(t('opencodeUpdate.toast.upgrading.title'), {
      id: UPGRADE_TOAST_ID,
      description: t('opencodeUpdate.toast.upgrading.description'),
      duration: Infinity,
      icon: <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />,
    });

    try {
      const response = await runtimeFetch('/api/opencode/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({}),
      });
      const payload = upgradeResultSchema.parse(await response.json());
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error || response.statusText || t('opencodeUpdate.toast.failed.description'));
      }

      if (runtimeKey !== getRuntimeKey()) {
        return;
      }
      useUpdateStore.getState().setOpenCodeUpdate(null);
      toast.success(t('opencodeUpdate.toast.updated.title'), {
        id: UPGRADE_TOAST_ID,
        description: payload?.version
          ? t('opencodeUpdate.toast.updated.descriptionWithVersion', { version: payload.version })
          : t('opencodeUpdate.toast.updated.description'),
        duration: Infinity,
        icon: <Icon name="check" className="h-4 w-4 text-[var(--status-success)]" />,
        action: {
          label: t('opencodeUpdate.toast.actions.reload'),
          onClick: reloadOpenCode,
        },
      });
    } catch (error) {
      if (runtimeKey !== getRuntimeKey()) {
        return;
      }
      toast.error(t('opencodeUpdate.toast.failed.title'), {
        id: UPGRADE_TOAST_ID,
        description: error instanceof Error ? error.message : t('opencodeUpdate.toast.failed.description'),
        duration: Infinity,
      });
    } finally {
      upgradingRef.current = false;
    }
  }, [reloadOpenCode, t]);

  React.useEffect(() => {
    const showUpdateAvailableToast = (version: string) => {
      const runtimeKey = getRuntimeKey();
      const open = () => {
        if (runtimeKey !== getRuntimeKey()) return;
        toast.info(t('opencodeUpdate.toast.available.title'), {
          id: UPDATE_TOAST_ID,
          description: t('opencodeUpdate.toast.available.description', { version }),
          duration: Infinity,
          action: {
            label: t('opencodeUpdate.toast.actions.update'),
            onClick: runUpgrade,
          },
          cancel: {
            label: t('opencodeUpdate.toast.actions.dismiss'),
            onClick: () => {
              getDeferredSafeStorage().setItem(UPDATE_TOAST_DISMISSED_VERSION_KEY, version);
              void updateDesktopSettings({ openCodeUpdateToastDismissedVersion: version });
              toast.dismiss(UPDATE_TOAST_ID);
            },
          },
        });
      };
      useUpdateStore.getState().setOpenCodeUpdate({ version, open });
      if (
        useProductModeStore.getState().mode === 'developer'
        && useUIStore.getState().showOpenCodeUpdateNotifications
        && shouldShowOpenCodeUpdateToast({
          version,
          dismissedVersion: getDeferredSafeStorage().getItem(UPDATE_TOAST_DISMISSED_VERSION_KEY),
          seenVersions: seenVersionsRef.current,
        })
      ) {
        seenVersionsRef.current.add(version);
        open();
      }
    };

    let cancelled = false;
    let checkSequence = 0;
    const timeoutIds: Array<ReturnType<typeof setTimeout>> = [];

    const checkForUpdate = async (attempt: number, runtimeKey = getRuntimeKey()) => {
      if (upgradingRef.current) return;
      const sequence = ++checkSequence;
      const upgradeRevision = upgradeRevisionRef.current;
      try {
        const response = await runtimeFetch('/api/opencode/upgrade-status', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(response.statusText || 'OpenCode upgrade status check failed');
        const status = upgradeStatusSchema.parse(await response.json());
        if (status.available && !status.latestVersion?.trim()) {
          throw new Error('OpenCode update version is missing');
        }
        const version = resolveOpenCodeUpgradeStatusVersion(status);
        if (!cancelled && runtimeKey === getRuntimeKey() && sequence === checkSequence && upgradeRevision === upgradeRevisionRef.current) {
          if (version) showUpdateAvailableToast(version);
          else useUpdateStore.getState().setOpenCodeUpdate(null);
        }
      } catch {
        const delay = CHECK_RETRY_DELAYS_MS[attempt];
        if (!cancelled && runtimeKey === getRuntimeKey() && sequence === checkSequence && delay !== undefined) {
          timeoutIds.push(setTimeout(() => { void checkForUpdate(attempt + 1, runtimeKey); }, delay));
        }
      }
    };

    const onUpdateAvailable = (event: Event) => {
      const version = resolveOpenCodeUpdateVersion(event instanceof CustomEvent ? event.detail : null);
      if (version) {
        void checkForUpdate(0);
      }
    };

    timeoutIds.push(setTimeout(() => { void checkForUpdate(0); }, INITIAL_CHECK_DELAY_MS));

    const unsubscribeRuntime = subscribeRuntimeEndpointChanged(({ runtimeKey }) => {
      seenVersionsRef.current.clear();
      toast.dismiss(UPDATE_TOAST_ID);
      toast.dismiss(UPGRADE_TOAST_ID);
      useUpdateStore.getState().setOpenCodeUpdate(null);
      void checkForUpdate(0, runtimeKey);
    });

    window.addEventListener('openchamber:opencode-update-available', onUpdateAvailable);
    return () => {
      cancelled = true;
      useUpdateStore.getState().setOpenCodeUpdate(null);
      for (const timeoutId of timeoutIds) clearTimeout(timeoutId);
      unsubscribeRuntime();
      window.removeEventListener('openchamber:opencode-update-available', onUpdateAvailable);
    };
  }, [runUpgrade, showUpdateUi, t]);

  return null;
};
