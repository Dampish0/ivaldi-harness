import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsCheckboxRow,
  SettingsFieldRow,
  SettingsSection,
  SettingsStackedField,
  SETTINGS_CONTROL_CLUSTER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SELECT_SIZE,
  SETTINGS_SELECT_TRIGGER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useDeviceInfo } from '@/lib/device';
import { useI18n, type I18nKey } from '@/lib/i18n';
import {
  fetchLifecycleHooks,
  saveLifecycleHooks,
  testLifecycleHook,
  type LifecycleExecution,
  type LifecycleHook,
  type LifecycleHookEvent,
} from '@/lib/lifecycleHooks';
import { reportSettingsSaveState } from '@/lib/persistence';
import { useProductModeStore } from '@/stores/useProductModeStore';

const DEFAULT_HOOK: LifecycleHook = {
  id: '',
  event: 'UserPromptSubmit',
  command: [''],
  enabled: true,
  timeoutMs: 10_000,
  failureMode: 'warn',
};

const HOOK_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

const EVENT_LABEL_KEYS = {
  UserPromptSubmit: {
    developer: 'settings.lifecycleHooks.event.userPromptSubmit',
    work: 'settings.lifecycleHooks.event.userPromptSubmitWork',
  },
  ChatStart: {
    developer: 'settings.lifecycleHooks.event.chatStart',
    work: 'settings.lifecycleHooks.event.chatStartWork',
  },
  BeforeToolCall: {
    developer: 'settings.lifecycleHooks.event.beforeToolCall',
    work: 'settings.lifecycleHooks.event.beforeToolCallWork',
  },
  AfterToolCall: {
    developer: 'settings.lifecycleHooks.event.afterToolCall',
    work: 'settings.lifecycleHooks.event.afterToolCallWork',
  },
  ToolCallFailed: {
    developer: 'settings.lifecycleHooks.event.toolCallFailed',
    work: 'settings.lifecycleHooks.event.toolCallFailedWork',
  },
  PermissionRequest: {
    developer: 'settings.lifecycleHooks.event.permissionRequest',
    work: 'settings.lifecycleHooks.event.permissionRequestWork',
  },
  PermissionDenied: {
    developer: 'settings.lifecycleHooks.event.permissionDenied',
    work: 'settings.lifecycleHooks.event.permissionDeniedWork',
  },
  BeforeAgentSpawn: {
    developer: 'settings.lifecycleHooks.event.beforeAgentSpawn',
    work: 'settings.lifecycleHooks.event.beforeAgentSpawnWork',
  },
  AfterAgentReturn: {
    developer: 'settings.lifecycleHooks.event.afterAgentReturn',
    work: 'settings.lifecycleHooks.event.afterAgentReturnWork',
  },
  TaskCreated: {
    developer: 'settings.lifecycleHooks.event.taskCreated',
    work: 'settings.lifecycleHooks.event.taskCreatedWork',
  },
  TaskCompleted: {
    developer: 'settings.lifecycleHooks.event.taskCompleted',
    work: 'settings.lifecycleHooks.event.taskCompletedWork',
  },
  WorktreeCreate: {
    developer: 'settings.lifecycleHooks.event.worktreeCreate',
    work: 'settings.lifecycleHooks.event.worktreeCreateWork',
  },
  WorktreeRemove: {
    developer: 'settings.lifecycleHooks.event.worktreeRemove',
    work: 'settings.lifecycleHooks.event.worktreeRemoveWork',
  },
  BeforeCompact: {
    developer: 'settings.lifecycleHooks.event.beforeCompact',
    work: 'settings.lifecycleHooks.event.beforeCompactWork',
  },
  ChatEnd: {
    developer: 'settings.lifecycleHooks.event.chatEnd',
    work: 'settings.lifecycleHooks.event.chatEnd',
  },
  Notification: {
    developer: 'settings.lifecycleHooks.event.notification',
    work: 'settings.lifecycleHooks.event.notification',
  },
} satisfies Record<LifecycleHookEvent, { developer: I18nKey; work: I18nKey }>;

type HookDraft = {
  id: string;
  event: LifecycleHook['event'];
  executable: string;
  argumentsText: string;
  enabled: boolean;
  timeoutMs: string;
  failureMode: LifecycleHook['failureMode'];
};

const hookToDraft = (hook: LifecycleHook): HookDraft => ({
  id: hook.id,
  event: hook.event,
  executable: hook.command[0] ?? '',
  argumentsText: hook.command.slice(1).join('\n'),
  enabled: hook.enabled,
  timeoutMs: String(hook.timeoutMs),
  failureMode: hook.failureMode,
});

const draftToHook = (draft: HookDraft): LifecycleHook => ({
  id: draft.id.trim(),
  event: draft.event,
  command: [
    draft.executable.trim(),
    ...(draft.argumentsText === '' ? [] : draft.argumentsText.split('\n').map((value) => value.replace(/\r$/, ''))),
  ],
  enabled: draft.enabled,
  timeoutMs: Number(draft.timeoutMs),
  failureMode: draft.failureMode,
});

export const LifecycleHooksPage: React.FC = () => {
  const { t } = useI18n();
  const { isMobile } = useDeviceInfo();
  const productMode = useProductModeStore((state) => state.mode);
  const isWork = productMode === 'work';
  const [hooks, setHooks] = React.useState<LifecycleHook[]>([]);
  const [supportedEvents, setSupportedEvents] = React.useState<LifecycleHookEvent[]>(['UserPromptSubmit']);
  const [blockingEvents, setBlockingEvents] = React.useState<LifecycleHookEvent[]>(['UserPromptSubmit']);
  const [recentExecutions, setRecentExecutions] = React.useState<LifecycleExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = React.useState<LifecycleExecution | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testingHookId, setTestingHookId] = React.useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<HookDraft>(() => hookToDraft(DEFAULT_HOOK));

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const snapshot = await fetchLifecycleHooks();
      setHooks(snapshot.hooks);
      setSupportedEvents(snapshot.supportedEvents);
      setBlockingEvents(snapshot.blockingEvents);
      setRecentExecutions(snapshot.recentExecutions);
    } catch (error) {
      console.error('[lifecycle-hooks] Failed to load settings:', error);
      setLoadFailed(true);
      toast.error(t('settings.lifecycleHooks.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const persist = React.useCallback(async (nextHooks: LifecycleHook[]) => {
    setSaving(true);
    reportSettingsSaveState('saving');
    try {
      const saved = await saveLifecycleHooks(nextHooks);
      setHooks(saved);
      reportSettingsSaveState('saved');
      return true;
    } catch (error) {
      console.error('[lifecycle-hooks] Failed to save settings:', error);
      reportSettingsSaveState('error');
      toast.error(t('settings.lifecycleHooks.toast.saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [t]);

  const openCreate = () => {
    setEditingIndex(null);
    setDraft(hookToDraft(DEFAULT_HOOK));
    setDialogOpen(true);
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setDraft(hookToDraft(hooks[index]));
    setDialogOpen(true);
  };

  const timeoutMs = Number(draft.timeoutMs);
  const idIsValid = draft.id.trim().length > 0 && HOOK_ID_PATTERN.test(draft.id.trim());
  const idIsDuplicate = hooks.some((hook, index) => hook.id === draft.id.trim() && index !== editingIndex);
  const draftIsValid = idIsValid
    && !idIsDuplicate
    && draft.executable.trim().length > 0
    && Number.isSafeInteger(timeoutMs)
    && timeoutMs >= 100
    && timeoutMs <= 120_000;

  const saveDraft = async () => {
    if (!draftIsValid) return;
    const hook = draftToHook(draft);
    const next = editingIndex === null
      ? [...hooks, hook]
      : hooks.map((entry, index) => index === editingIndex ? hook : entry);
    if (await persist(next)) {
      setDialogOpen(false);
    }
  };

  const toggleHook = async (index: number, enabled: boolean) => {
    const next = hooks.map((hook, hookIndex) => hookIndex === index ? { ...hook, enabled } : hook);
    await persist(next);
  };

  const moveHook = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= hooks.length) return;
    const next = [...hooks];
    [next[index], next[target]] = [next[target], next[index]];
    await persist(next);
  };

  const deleteHook = async (hookId: string) => {
    if (await persist(hooks.filter((hook) => hook.id !== hookId))) {
      setPendingDeleteId(null);
    }
  };

  const runTest = async (hook: LifecycleHook) => {
    setTestingHookId(hook.id);
    try {
      const result = await testLifecycleHook(hook);
      setRecentExecutions((current) => [result, ...current].slice(0, 50));
      setSelectedExecution(result);
      if (result.ok) {
        toast.success(t('settings.lifecycleHooks.toast.testSucceeded'));
      } else {
        toast.error(t('settings.lifecycleHooks.toast.testReturnedFailure'));
      }
    } catch (error) {
      console.error('[lifecycle-hooks] Failed to test hook:', error);
      toast.error(t('settings.lifecycleHooks.toast.testFailed'));
    } finally {
      setTestingHookId(null);
    }
  };

  const pageTitle = isWork
    ? t('settings.page.lifecycleHooks.workTitle')
    : t('settings.page.lifecycleHooks.title');
  const pageDescription = isWork
    ? t('settings.page.lifecycleHooks.workDescription')
    : t('settings.page.lifecycleHooks.description');
  const eventLabel = React.useCallback((event: LifecycleHookEvent) => {
    const keys = EVENT_LABEL_KEYS[event];
    return t(isWork ? keys.work : keys.developer);
  }, [isWork, t]);
  const draftCanBlock = blockingEvents.includes(draft.event);

  return (
    <SettingsPageLayout title={pageTitle} description={pageDescription} showSaveStatus>
      <SettingsSection
        title={isWork ? t('settings.lifecycleHooks.section.rules') : t('settings.lifecycleHooks.section.hooks')}
        description={isWork
          ? t('settings.lifecycleHooks.securityWarningWork')
          : t('settings.lifecycleHooks.securityWarning')}
        divider={false}
        settingsItem="lifecycle-hooks.list"
        headerAction={(
          <Button type="button" size="sm" onClick={openCreate} disabled={loading || loadFailed || saving}>
            <Icon name="add" className="size-4" />
            {isWork ? t('settings.lifecycleHooks.actions.addRule') : t('settings.lifecycleHooks.actions.addHook')}
          </Button>
        )}
        contentClassName="space-y-4"
      >
        {loading ? (
          <p className="typography-meta text-muted-foreground">
            {isWork ? t('settings.lifecycleHooks.loadingWork') : t('settings.lifecycleHooks.loading')}
          </p>
        ) : loadFailed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="typography-meta text-status-error">{t('settings.lifecycleHooks.toast.loadFailed')}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { void load(); }}>
              {t('settings.lifecycleHooks.actions.retry')}
            </Button>
          </div>
        ) : hooks.length === 0 ? (
          <p className="typography-meta text-muted-foreground">
            {isWork ? t('settings.lifecycleHooks.emptyWork') : t('settings.lifecycleHooks.empty')}
          </p>
        ) : hooks.map((hook, index) => (
          <SettingsFieldRow
            key={hook.id}
            label={hook.id}
            description={eventLabel(hook.event)}
            alignEnd={false}
            controlClassName="flex-wrap"
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={hook.enabled}
                onChange={(enabled) => { void toggleHook(index, enabled); }}
                disabled={saving}
                ariaLabel={hook.enabled
                  ? t('settings.lifecycleHooks.actions.disable', { name: hook.id })
                  : t('settings.lifecycleHooks.actions.enable', { name: hook.id })}
              />
              <span className="typography-meta text-muted-foreground">
                {hook.enabled ? t('settings.lifecycleHooks.status.enabled') : t('settings.lifecycleHooks.status.disabled')}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { void runTest(hook); }}
              disabled={saving || testingHookId !== null}
            >
              {testingHookId === hook.id ? t('settings.lifecycleHooks.actions.testing') : t('settings.lifecycleHooks.actions.test')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openEdit(index)}
              disabled={saving}
            >
              {t('settings.lifecycleHooks.actions.edit')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={SETTINGS_ICON_BUTTON_CLASS}
              onClick={() => { void moveHook(index, -1); }}
              disabled={saving || index === 0}
              aria-label={t('settings.lifecycleHooks.actions.moveUp', { name: hook.id })}
              title={t('settings.lifecycleHooks.actions.moveUp', { name: hook.id })}
            >
              <Icon name="arrow-up-s" className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={SETTINGS_ICON_BUTTON_CLASS}
              onClick={() => { void moveHook(index, 1); }}
              disabled={saving || index === hooks.length - 1}
              aria-label={t('settings.lifecycleHooks.actions.moveDown', { name: hook.id })}
              title={t('settings.lifecycleHooks.actions.moveDown', { name: hook.id })}
            >
              <Icon name="arrow-down-s" className="size-4" />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-8 px-0"
              onClick={() => setPendingDeleteId(hook.id)}
              disabled={saving}
              aria-label={t('settings.lifecycleHooks.actions.delete', { name: hook.id })}
              title={t('settings.lifecycleHooks.actions.delete', { name: hook.id })}
            >
              <Icon name="delete-bin" className="size-4" />
            </Button>
          </SettingsFieldRow>
        ))}
      </SettingsSection>

      <SettingsSection
        title={t('settings.lifecycleHooks.recent.title')}
        info={isWork
          ? t('settings.lifecycleHooks.recent.infoWork')
          : t('settings.lifecycleHooks.recent.info')}
        settingsItem="lifecycle-hooks.recent"
        contentClassName="space-y-3"
      >
        {recentExecutions.length === 0 ? (
          <p className="typography-meta text-muted-foreground">
            {isWork ? t('settings.lifecycleHooks.recent.emptyWork') : t('settings.lifecycleHooks.recent.empty')}
          </p>
        ) : recentExecutions.slice(0, 10).map((execution, index) => (
          <SettingsFieldRow
            key={`${execution.hookId}-${execution.startedAt}-${index}`}
            label={execution.hookId}
            description={`${execution.source === 'test' ? t('settings.lifecycleHooks.recent.source.test') : t('settings.lifecycleHooks.recent.source.event')} · ${new Date(execution.startedAt).toLocaleTimeString()}`}
            alignEnd={false}
          >
            <span className={execution.ok ? 'typography-meta text-status-success' : 'typography-meta text-status-error'}>
              {execution.ok ? t('settings.lifecycleHooks.recent.status.succeeded') : t('settings.lifecycleHooks.recent.status.failed')}
            </span>
            <span className="typography-meta text-muted-foreground">
              {t('settings.lifecycleHooks.recent.duration', { duration: Math.round(execution.durationMs) })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedExecution(execution)}>
              {t('settings.lifecycleHooks.actions.viewOutput')}
            </Button>
          </SettingsFieldRow>
        ))}
      </SettingsSection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={isMobile
          ? 'max-h-[calc(100dvh-1rem)] max-w-none gap-0 overflow-y-auto rounded-md p-0'
          : 'max-w-xl'}>
          <DialogHeader className={isMobile ? 'border-b border-border/40 px-4 pb-3 pt-4 pr-10 text-left' : undefined}>
            <DialogTitle>
              {editingIndex === null
                ? (isWork ? t('settings.lifecycleHooks.dialog.addRuleTitle') : t('settings.lifecycleHooks.dialog.addHookTitle'))
                : (isWork ? t('settings.lifecycleHooks.dialog.editRuleTitle') : t('settings.lifecycleHooks.dialog.editHookTitle'))}
            </DialogTitle>
            <DialogDescription>{t('settings.lifecycleHooks.dialog.description')}</DialogDescription>
          </DialogHeader>

          <div className={isMobile ? 'space-y-4 px-4 py-4' : 'space-y-5 py-1'}>
            <SettingsStackedField
              label={isWork ? t('settings.lifecycleHooks.field.name') : t('settings.lifecycleHooks.field.id')}
              info={isWork
                ? t('settings.lifecycleHooks.field.nameInfo')
                : t('settings.lifecycleHooks.field.idInfo')}
              controlClassName={SETTINGS_CONTROL_CLUSTER_CLASS}
            >
              <Input
                value={draft.id}
                onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
                className="h-8 flex-1 px-3"
                autoComplete="off"
                autoFocus
              />
            </SettingsStackedField>
            {!idIsValid && draft.id.length > 0 ? (
              <p className="typography-meta text-status-error">{t('settings.lifecycleHooks.validation.invalidId')}</p>
            ) : null}
            {idIsDuplicate ? (
              <p className="typography-meta text-status-error">
                {isWork
                  ? t('settings.lifecycleHooks.validation.duplicateName')
                  : t('settings.lifecycleHooks.validation.duplicateId')}
              </p>
            ) : null}

            <SettingsStackedField label={isWork ? t('settings.lifecycleHooks.field.when') : t('settings.lifecycleHooks.field.event')}>
              <Select
                value={draft.event}
                onValueChange={(value) => {
                  const event = supportedEvents.find((candidate) => candidate === value);
                  if (!event) return;
                  setDraft((current) => ({
                    ...current,
                    event,
                    failureMode: blockingEvents.includes(event) ? current.failureMode : 'warn',
                  }));
                }}
              >
                <SelectTrigger size={SETTINGS_SELECT_SIZE} className={SETTINGS_SELECT_TRIGGER_CLASS}>
                  <SelectValue>{eventLabel(draft.event)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {supportedEvents.map((event) => (
                    <SelectItem key={event} value={event}>{eventLabel(event)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsStackedField>

            <SettingsStackedField
              label={isWork ? t('settings.lifecycleHooks.field.program') : t('settings.lifecycleHooks.field.executable')}
              info={t('settings.lifecycleHooks.field.executableInfo')}
              controlClassName="w-full max-w-none"
            >
              <Input
                value={draft.executable}
                onChange={(event) => setDraft((current) => ({ ...current, executable: event.target.value }))}
                className="h-8 w-full px-3 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </SettingsStackedField>

            <SettingsStackedField
              label={t('settings.lifecycleHooks.field.arguments')}
              info={t('settings.lifecycleHooks.field.argumentsInfo')}
              controlClassName="w-full max-w-none"
            >
              <Textarea
                value={draft.argumentsText}
                onChange={(event) => setDraft((current) => ({ ...current, argumentsText: event.target.value }))}
                rows={isMobile ? 3 : 4}
                className="min-h-20 w-full resize-y bg-transparent font-mono typography-meta"
                spellCheck={false}
              />
            </SettingsStackedField>

            <SettingsStackedField
              label={t('settings.lifecycleHooks.field.timeout')}
              info={t('settings.lifecycleHooks.field.timeoutInfo')}
            >
              <Input
                type="number"
                min={100}
                max={120000}
                step={100}
                value={draft.timeoutMs}
                onChange={(event) => setDraft((current) => ({ ...current, timeoutMs: event.target.value }))}
                className="h-8 w-36 px-3"
              />
              <span className="typography-meta text-muted-foreground">ms</span>
            </SettingsStackedField>

            <SettingsStackedField
              label={isWork ? t('settings.lifecycleHooks.field.ifItFails') : t('settings.lifecycleHooks.field.failureMode')}
              info={!draftCanBlock
                ? t(isWork
                  ? 'settings.lifecycleHooks.failure.passiveInfoWork'
                  : 'settings.lifecycleHooks.failure.passiveInfo')
                : undefined}
            >
              <Select
                value={draft.failureMode}
                onValueChange={(value) => setDraft((current) => ({
                  ...current,
                  failureMode: value === 'block' ? 'block' : 'warn',
                }))}
                disabled={!draftCanBlock}
              >
                <SelectTrigger size={SETTINGS_SELECT_SIZE} className={SETTINGS_SELECT_TRIGGER_CLASS}>
                  <SelectValue>
                    {draft.failureMode === 'block'
                      ? (isWork ? t('settings.lifecycleHooks.failure.blockWork') : t('settings.lifecycleHooks.failure.block'))
                      : (isWork ? t('settings.lifecycleHooks.failure.warnWork') : t('settings.lifecycleHooks.failure.warn'))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">
                    {isWork ? t('settings.lifecycleHooks.failure.warnWork') : t('settings.lifecycleHooks.failure.warn')}
                  </SelectItem>
                  <SelectItem value="block">
                    {isWork ? t('settings.lifecycleHooks.failure.blockWork') : t('settings.lifecycleHooks.failure.block')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingsStackedField>

            <SettingsCheckboxRow
              checked={draft.enabled}
              onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
              label={t('settings.lifecycleHooks.field.enabled')}
              ariaLabel={t('settings.lifecycleHooks.field.enabled')}
            />
          </div>

          <DialogFooter className={isMobile ? 'flex-row justify-end gap-2 border-t border-border/40 px-4 py-3' : undefined}>
            <Button type="button" variant={isMobile ? 'ghost' : 'outline'} onClick={() => setDialogOpen(false)}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button type="button" onClick={() => { void saveDraft(); }} disabled={!draftIsValid || saving}>
              {saving ? t('settings.common.actions.saving') : t('settings.common.actions.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingDeleteId ? t('settings.lifecycleHooks.actions.delete', { name: pendingDeleteId }) : ''}
            </DialogTitle>
            <DialogDescription>
              {pendingDeleteId ? t('settings.lifecycleHooks.dialog.deleteDescription', { name: pendingDeleteId }) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteId(null)} disabled={saving}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => { if (pendingDeleteId) void deleteHook(pendingDeleteId); }}
              disabled={saving || pendingDeleteId === null}
            >
              {t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedExecution !== null} onOpenChange={(open) => { if (!open) setSelectedExecution(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isWork
                ? t('settings.lifecycleHooks.recent.outputTitleWork')
                : t('settings.lifecycleHooks.recent.outputTitle')}
            </DialogTitle>
            <DialogDescription>
              {selectedExecution
                ? t('settings.lifecycleHooks.recent.outputDescription', { name: selectedExecution.hookId })
                : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedExecution ? (
            <div className="space-y-5">
              {selectedExecution.error ? (
                <SettingsStackedField label={t('settings.lifecycleHooks.recent.error')} controlClassName="w-full max-w-none">
                  <pre className="max-h-32 w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-status-error/30 bg-status-error/5 p-3 typography-meta text-status-error">
                    {selectedExecution.error}
                  </pre>
                </SettingsStackedField>
              ) : null}
              <SettingsStackedField label={t('settings.lifecycleHooks.recent.stdout')} controlClassName="w-full max-w-none">
                <pre className="max-h-48 w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 font-mono typography-meta">
                  {selectedExecution.stdout || t('settings.lifecycleHooks.recent.noOutput')}
                </pre>
              </SettingsStackedField>
              <SettingsStackedField label={t('settings.lifecycleHooks.recent.stderr')} controlClassName="w-full max-w-none">
                <pre className="max-h-48 w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 font-mono typography-meta">
                  {selectedExecution.stderr || t('settings.lifecycleHooks.recent.noOutput')}
                </pre>
              </SettingsStackedField>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </SettingsPageLayout>
  );
};
