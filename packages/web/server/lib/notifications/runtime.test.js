import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNotificationTriggerRuntime } from './runtime.js';

const createRuntime = ({ shouldAutoAccept }) => {
  const sendPushToAllUiSessions = vi.fn(async () => {});
  const resolver = vi.fn(async (permission) => shouldAutoAccept(permission));
  const runtime = createNotificationTriggerRuntime({
    readSettingsFromDisk: async () => ({
      notifyOnQuestion: true,
      notificationMode: 'always',
      nativeNotificationsEnabled: false,
      notificationTemplates: {},
    }),
    prepareNotificationLastMessage: async ({ message }) => message,
    buildTemplateVariables: async () => ({ session_name: 'Test session' }),
    extractLastMessageText: () => '',
    fetchLastAssistantMessageText: async () => '',
    resolveNotificationTemplate: (template, variables) => template.replace('{last_message}', variables.last_message ?? ''),
    shouldApplyResolvedTemplateMessage: () => true,
    emitDesktopNotification: () => false,
    broadcastUiNotification: () => {},
    sendPushToAllUiSessions,
    sendApnsToAllUiSessions: async () => {},
    isAnyInteractiveClientVisible: () => true,
    buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
    getOpenCodeAuthHeaders: () => ({}),
  });
  runtime.setGetShouldAutoAcceptPermission(resolver);
  return { runtime, resolver, sendPushToAllUiSessions };
};

describe('notification permission decisions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('suppresses a permission notification only when that exact request will be auto-approved', async () => {
    const { runtime, resolver, sendPushToAllUiSessions } = createRuntime({
      shouldAutoAccept: (permission) => permission.patterns?.[0] === 'git status',
    });

    await runtime.maybeSendPushForTrigger({
      type: 'permission.asked',
      properties: {
        id: 'safe',
        sessionID: 'ses_1',
        permission: 'bash',
        patterns: ['git status'],
      },
    });
    await vi.advanceTimersByTimeAsync(600);

    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ id: 'safe', patterns: ['git status'] }), undefined);
    expect(sendPushToAllUiSessions).not.toHaveBeenCalled();
  });

  it('keeps risky Auto permissions on the normal approval notification path', async () => {
    const { runtime, sendPushToAllUiSessions } = createRuntime({ shouldAutoAccept: () => false });

    await runtime.maybeSendPushForTrigger({
      type: 'permission.asked',
      properties: {
        id: 'risky',
        sessionID: 'ses_1',
        permission: 'bash',
        patterns: ['git push origin main'],
      },
    });
    await vi.advanceTimersByTimeAsync(600);

    expect(sendPushToAllUiSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: 'permission-ses_1',
        data: expect.objectContaining({ sessionId: 'ses_1', type: 'permission' }),
      }),
      { requireNoSse: true },
    );
  });
});
